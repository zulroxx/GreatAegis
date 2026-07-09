"""
GreatAegis Vector Database — Data Sovereignty Layer (Qdrant edition).

Connects to Qdrant either in cloud mode (QDRANT_URL + QDRANT_API_KEY) or in
local persistent mode (GREATAEGIS_QDRANT_PATH). Text chunks are encrypted with
hybrid AES-256-GCM + ML-KEM before insertion, and decrypted on-the-fly during
queries.

SECURITY NOTE: when using cloud mode the stored *text* is encrypted, but the
embedding vectors are derived from plaintext and are uploaded to the cloud
instance. Treat the Qdrant cluster as part of your trust boundary.

Dependencies: qdrant-client, sentence-transformers
"""

from __future__ import annotations

import logging
import os
import uuid
from typing import Optional

from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
    PayloadSchemaType,
    PointStruct,
    VectorParams,
)
from sentence_transformers import SentenceTransformer

from pqc_crypto import decrypt_chunk, encrypt_chunk

logger = logging.getLogger("great_aegis.vector_db")

# ── Configuration ────────────────────────────────────────────────────────────

# Cloud mode takes precedence when QDRANT_URL is set; otherwise local mode.
QDRANT_URL = os.environ.get("QDRANT_URL", "").strip()
QDRANT_API_KEY = os.environ.get("QDRANT_API_KEY", "").strip()
QDRANT_PATH = os.environ.get(
    "GREATAEGIS_QDRANT_PATH",
    os.path.join(os.path.dirname(__file__), "..", ".qdrant_db"),
)

COLLECTION_NAME = "sovereign_documents"
EMBEDDING_MODEL = "all-MiniLM-L6-v2"
VECTOR_SIZE = 384

# ── Lazy singletons ──────────────────────────────────────────────────────────

_client: QdrantClient | None = None
_model: SentenceTransformer | None = None


def _is_cloud() -> bool:
    return bool(QDRANT_URL)


def _get_client() -> QdrantClient:
    global _client
    if _client is None:
        if _is_cloud():
            _client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY, timeout=30)
            logger.info("Connected to Qdrant Cloud at %s", QDRANT_URL)
        else:
            _client = QdrantClient(path=QDRANT_PATH)
            logger.info("Connected to local Qdrant at %s", QDRANT_PATH)
        _ensure_collection()
    return _client


def _ensure_collection() -> None:
    """Create the Qdrant collection and payload indexes if they do not exist."""
    if not _client.collection_exists(COLLECTION_NAME):
        _client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(size=VECTOR_SIZE, distance=Distance.COSINE),
        )
        location = QDRANT_URL or QDRANT_PATH
        logger.info("Created Qdrant collection '%s' at %s", COLLECTION_NAME, location)

    # Payload indexes are required for filtering in Qdrant Cloud and improve
    # filter performance in local mode.
    for field in ("file_name", "classification"):
        try:
            _client.create_payload_index(
                collection_name=COLLECTION_NAME,
                field_name=field,
                field_schema=PayloadSchemaType.KEYWORD,
            )
        except Exception as exc:
            # Index may already exist; log at debug level and continue.
            logger.debug("Payload index '%s' not created: %s", field, exc)


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        logger.info("Loading embedding model '%s'...", EMBEDDING_MODEL)
        _model = SentenceTransformer(EMBEDDING_MODEL)
        logger.info("Embedding model loaded")
    return _model


def _embed(texts: list[str]) -> list[list[float]]:
    """Encode a list of texts into 384-dimensional cosine embeddings."""
    model = _get_model()
    embeddings = model.encode(texts, convert_to_numpy=True, show_progress_bar=False)
    return [emb.tolist() for emb in embeddings]


# ── Public API ──────────────────────────────────────────────────────────────


def ingest_document(
    *,
    file_name: str,
    classification: str,
    chunks: list[str],
) -> list[str]:
    """
    Encrypt and store text chunks in the local Qdrant vector DB.

    Returns the list of point IDs that were inserted.
    """
    client = _get_client()
    if not chunks:
        return []

    embeddings = _embed(chunks)
    ids: list[str] = []
    points: list[PointStruct] = []

    for idx, plain_chunk in enumerate(chunks):
        # Qdrant requires valid UUID point IDs. Use a deterministic UUID5 so the
        # same chunk of the same file always maps to the same point.
        doc_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"greataegis:{file_name}:chunk-{idx}"))
        encrypted = encrypt_chunk(plain_chunk)

        points.append(
            PointStruct(
                id=doc_id,
                vector=embeddings[idx],
                payload={
                    "file_name": file_name,
                    "classification": classification,
                    "chunk_index": idx,
                    "total_chunks": len(chunks),
                    **encrypted,
                },
            )
        )
        ids.append(doc_id)

    client.upsert(collection_name=COLLECTION_NAME, points=points)
    return ids


def query_documents(
    query_text: str,
    top_k: int = 5,
    filter_classification: str | None = None,
) -> list[dict]:
    """
    Semantic search across encrypted document chunks.

    Returns a list of dicts, each containing the encrypted payload metadata
    and the decrypted plaintext.
    """
    client = _get_client()
    query_embedding = _embed([query_text])[0]

    query_filter = None
    if filter_classification:
        query_filter = Filter(
            must=[
                FieldCondition(
                    key="classification",
                    match=MatchValue(value=filter_classification),
                )
            ]
        )

    response = client.query_points(
        collection_name=COLLECTION_NAME,
        query=query_embedding,
        limit=top_k,
        query_filter=query_filter,
        with_payload=True,
    )

    hits: list[dict] = []
    for point in response.points:
        payload = point.payload or {}
        metadata = {
            k: v
            for k, v in payload.items()
            if k not in ("nonce", "ciphertext", "key_nonce", "encrypted_key", "mlkem_ciphertext")
        }

        encrypted = {
            k: payload.get(k, "")
            for k in ("nonce", "ciphertext", "key_nonce", "encrypted_key", "mlkem_ciphertext")
        }

        plaintext = ""
        if all(encrypted.values()):
            try:
                plaintext = decrypt_chunk(encrypted)
            except Exception as exc:
                logger.warning("Failed to decrypt chunk %s: %s", point.id, exc)
                plaintext = "[decryption failed — ML-KEM private key unavailable or corrupt]"

        hits.append(
            {
                "id": point.id,
                "metadata": metadata,
                "score": point.score,
                "plaintext": plaintext,
            }
        )

    return hits


def delete_document(file_name: str) -> int:
    """
    Remove all chunks belonging to a given file. Returns the count of deleted
    points.
    """
    client = _get_client()
    points, _ = client.scroll(
        collection_name=COLLECTION_NAME,
        scroll_filter=Filter(
            must=[FieldCondition(key="file_name", match=MatchValue(value=file_name))]
        ),
        limit=10_000,
        with_payload=False,
    )
    if not points:
        return 0
    ids = [point.id for point in points]
    client.delete(collection_name=COLLECTION_NAME, points_selector=ids)
    return len(ids)


def collection_stats() -> dict:
    """Return metadata about the Qdrant DB for the dashboard."""
    client = _get_client()
    info = client.get_collection(COLLECTION_NAME)
    location = QDRANT_URL or QDRANT_PATH
    engine = (
        "Qdrant Cloud with hybrid AES-256-GCM + ML-KEM"
        if _is_cloud()
        else "Qdrant (local, air-gapped) with hybrid AES-256-GCM + ML-KEM"
    )
    return {
        "collection_name": COLLECTION_NAME,
        "persist_directory": location,
        "chunk_count": info.points_count,
        "engine": engine,
    }
