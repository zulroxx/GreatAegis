"""
Post-quantum cryptography helpers for GreatAegis AI Gateway.

Implements two NIST-standardised PQC algorithms via `cryptography>=49.0.0`:

  - **ML-KEM-768** (FIPS 203, formerly Kyber) — key encapsulation for
    hybrid AES-256-GCM encryption of document chunks and prompt payloads.
  - **ML-DSA-65** (FIPS 204, formerly Dilithium) — digital signatures for
    tamper-evident audit records and response integrity verification.

All key material, ciphertexts, signatures and shared secrets are handled as
raw bytes; wire-facing payloads are base64-encoded for JSON compatibility.
"""

from __future__ import annotations

import base64
import hashlib
import logging
import os
from typing import Tuple

from cryptography.hazmat.primitives.asymmetric import mldsa, mlkem
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

logger = logging.getLogger("great_aegis.pqc_crypto")

# Persistent ML-KEM key pair. In a real deployment the seed must be supplied
# via GREATAEGIS_MLKEM_SEED (64 bytes, hex-encoded) so the private key survives
# restarts. If the seed is not set, the gateway generates an ephemeral key pair
# and logs a warning; encrypted documents will be unreadable after restart.
_MLKEM_PRIVATE_KEY: mlkem.MLKEM768PrivateKey | None = None
_MLKEM_PUBLIC_KEY: mlkem.MLKEM768PublicKey | None = None


class PQCNotInitializedError(RuntimeError):
    """Raised when ML-KEM is used before initialization."""


_MLKEM_SEED_SIZE = 64  # ML-KEM-768 deterministic key generation uses 64 bytes.

# ── ML-DSA-65 (Dilithium) signing key pair ──────────────────────────────────

_MLDSA_PRIVATE_KEY: mldsa.MLDSA65PrivateKey | None = None
_MLDSA_PUBLIC_KEY: mldsa.MLDSA65PublicKey | None = None

_MLDSA_SEED_SIZE = 32  # ML-DSA-65 deterministic key generation uses 32 bytes.


def _ensure_mlkem() -> None:
    """Initialize the ML-KEM key pair if it has not been initialized yet."""
    global _MLKEM_PRIVATE_KEY, _MLKEM_PUBLIC_KEY
    if _MLKEM_PRIVATE_KEY is not None:
        return

    seed_hex = os.environ.get("GREATAEGIS_MLKEM_SEED")
    if seed_hex:
        try:
            seed = bytes.fromhex(seed_hex)
        except ValueError as exc:
            raise ValueError("GREATAEGIS_MLKEM_SEED must be a valid hex string") from exc
        if len(seed) != _MLKEM_SEED_SIZE:
            raise ValueError(
                f"GREATAEGIS_MLKEM_SEED must decode to {_MLKEM_SEED_SIZE} bytes, got {len(seed)}"
            )
    else:
        seed = os.urandom(_MLKEM_SEED_SIZE)
        logger.warning(
            "GREATAEGIS_MLKEM_SEED is not set. Generating an ephemeral ML-KEM-768 key pair. "
            "Encrypted documents will be unreadable after the next server restart."
        )

    _MLKEM_PRIVATE_KEY = mlkem.MLKEM768PrivateKey.from_seed_bytes(seed)
    _MLKEM_PUBLIC_KEY = _MLKEM_PRIVATE_KEY.public_key()


def init_mlkem(seed: bytes | None = None) -> None:
    """Explicitly initialize ML-KEM from a 64-byte seed."""
    global _MLKEM_PRIVATE_KEY, _MLKEM_PUBLIC_KEY
    if seed is not None and len(seed) != _MLKEM_SEED_SIZE:
        raise ValueError(f"ML-KEM seed must be {_MLKEM_SEED_SIZE} bytes")
    _MLKEM_PRIVATE_KEY = mlkem.MLKEM768PrivateKey.from_seed_bytes(
        seed or os.urandom(_MLKEM_SEED_SIZE)
    )
    _MLKEM_PUBLIC_KEY = _MLKEM_PRIVATE_KEY.public_key()


def get_mlkem_public_key_b64() -> str:
    """Return the persistent ML-KEM public key as a base64 string."""
    _ensure_mlkem()
    return base64.b64encode(_MLKEM_PUBLIC_KEY.public_bytes_raw()).decode()


def encapsulate() -> Tuple[str, str]:
    """
    Encapsulate to the gateway's public key.

    Returns (shared_secret_b64, ciphertext_b64). The shared secret is the
    32-byte KEM output; the ciphertext is the public value to send back to the
    gateway for decapsulation.
    """
    _ensure_mlkem()
    shared_secret, ciphertext = _MLKEM_PUBLIC_KEY.encapsulate()
    return (
        base64.b64encode(shared_secret).decode(),
        base64.b64encode(ciphertext).decode(),
    )


def decapsulate(ciphertext: str | bytes) -> Tuple[str, bool]:
    """
    Decapsulate an ML-KEM ciphertext using the gateway's private key.

    Accepts either raw bytes or a hex/base64 string. Returns a hex digest of
    the shared secret and a validity flag. If decapsulation fails, returns
    ("", False).
    """
    _ensure_mlkem()
    try:
        if isinstance(ciphertext, str):
            # Try base64 first, then hex.
            try:
                ct_bytes = base64.b64decode(ciphertext, validate=True)
            except ValueError:
                ct_bytes = bytes.fromhex(ciphertext)
        else:
            ct_bytes = ciphertext
        shared_secret = _MLKEM_PRIVATE_KEY.decapsulate(ct_bytes)
        return (hashlib.sha256(shared_secret).hexdigest(), True)
    except Exception as exc:
        logger.warning("ML-KEM decapsulation failed: %s", exc)
        return ("", False)


# ── ML-DSA-65 (Dilithium) digital signatures ────────────────────────────────


def _ensure_mldsa() -> None:
    """Initialize the ML-DSA-65 signing key pair if not yet initialized."""
    global _MLDSA_PRIVATE_KEY, _MLDSA_PUBLIC_KEY
    if _MLDSA_PRIVATE_KEY is not None:
        return

    seed_hex = os.environ.get("GREATAEGIS_MLDSA_SEED")
    if seed_hex:
        try:
            seed = bytes.fromhex(seed_hex)
        except ValueError as exc:
            raise ValueError("GREATAEGIS_MLDSA_SEED must be a valid hex string") from exc
        if len(seed) != _MLDSA_SEED_SIZE:
            raise ValueError(
                f"GREATAEGIS_MLDSA_SEED must decode to {_MLDSA_SEED_SIZE} bytes, got {len(seed)}"
            )
    else:
        seed = os.urandom(_MLDSA_SEED_SIZE)
        logger.warning(
            "GREATAEGIS_MLDSA_SEED is not set. Generating an ephemeral ML-DSA-65 key pair. "
            "Signatures will not verify after the next server restart."
        )

    _MLDSA_PRIVATE_KEY = mldsa.MLDSA65PrivateKey.from_seed_bytes(seed)
    _MLDSA_PUBLIC_KEY = _MLDSA_PRIVATE_KEY.public_key()


def init_mldsa(seed: bytes | None = None) -> None:
    """Explicitly initialize ML-DSA-65 from a 32-byte seed."""
    global _MLDSA_PRIVATE_KEY, _MLDSA_PUBLIC_KEY
    if seed is not None and len(seed) != _MLDSA_SEED_SIZE:
        raise ValueError(f"ML-DSA seed must be {_MLDSA_SEED_SIZE} bytes")
    _MLDSA_PRIVATE_KEY = mldsa.MLDSA65PrivateKey.from_seed_bytes(
        seed or os.urandom(_MLDSA_SEED_SIZE)
    )
    _MLDSA_PUBLIC_KEY = _MLDSA_PRIVATE_KEY.public_key()


def get_mldsa_public_key_b64() -> str:
    """Return the persistent ML-DSA-65 public key as a base64 string."""
    _ensure_mldsa()
    return base64.b64encode(_MLDSA_PUBLIC_KEY.public_bytes_raw()).decode()


def sign_payload(payload: bytes) -> str:
    """
    Sign arbitrary bytes with the gateway's ML-DSA-65 private key.

    Returns a base64-encoded signature (~3309 bytes raw).
    """
    _ensure_mldsa()
    signature = _MLDSA_PRIVATE_KEY.sign(payload)
    return base64.b64encode(signature).decode()


def verify_signature(signature_b64: str, payload: bytes) -> bool:
    """
    Verify an ML-DSA-65 signature against the given payload.

    Returns True if the signature is valid, False otherwise.
    """
    _ensure_mldsa()
    try:
        signature = base64.b64decode(signature_b64, validate=True)
        _MLDSA_PUBLIC_KEY.verify(signature, payload)
        return True
    except Exception as exc:
        logger.warning("ML-DSA signature verification failed: %s", exc)
        return False


# ── AES-256-GCM symmetric encryption for document chunks ───────────────────


def encrypt_chunk(plaintext: str) -> dict:
    """
    Hybrid-encrypt a plaintext chunk.

    Returns a JSON-friendly dict with:
      - nonce / ciphertext: AES-256-GCM of the plaintext
      - key_nonce / encrypted_key: AES-256-GCM of the chunk key, keyed by the
        ML-KEM shared secret
      - mlkem_ciphertext: the ML-KEM ciphertext that unlocks the shared secret
    """
    _ensure_mlkem()

    # 1. Encrypt the plaintext with a fresh AES key.
    chunk_key = AESGCM.generate_key(bit_length=256)
    aesgcm = AESGCM(chunk_key)
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)

    # 2. Wrap the chunk key with ML-KEM.
    shared_secret, mlkem_ciphertext = _MLKEM_PUBLIC_KEY.encapsulate()
    key_aesgcm = AESGCM(shared_secret)
    key_nonce = os.urandom(12)
    encrypted_key = key_aesgcm.encrypt(key_nonce, chunk_key, None)

    return {
        "nonce": base64.b64encode(nonce).decode(),
        "ciphertext": base64.b64encode(ciphertext).decode(),
        "key_nonce": base64.b64encode(key_nonce).decode(),
        "encrypted_key": base64.b64encode(encrypted_key).decode(),
        "mlkem_ciphertext": base64.b64encode(mlkem_ciphertext).decode(),
    }


def decrypt_chunk(encrypted: dict) -> str:
    """Reverse encrypt_chunk."""
    _ensure_mlkem()

    # 1. Unwrap the chunk key with ML-KEM.
    mlkem_ciphertext = base64.b64decode(encrypted["mlkem_ciphertext"])
    shared_secret = _MLKEM_PRIVATE_KEY.decapsulate(mlkem_ciphertext)
    key_aesgcm = AESGCM(shared_secret)
    key_nonce = base64.b64decode(encrypted["key_nonce"])
    encrypted_key = base64.b64decode(encrypted["encrypted_key"])
    chunk_key = key_aesgcm.decrypt(key_nonce, encrypted_key, None)

    # 2. Decrypt the plaintext.
    aesgcm = AESGCM(chunk_key)
    nonce = base64.b64decode(encrypted["nonce"])
    ciphertext = base64.b64decode(encrypted["ciphertext"])
    return aesgcm.decrypt(nonce, ciphertext, None).decode("utf-8")


# ── Payload-in-transit encryption (PQC tunnel) ──────────────────────────────


def encrypt_payload(plaintext: str) -> dict:
    """
    Hybrid-encrypt a prompt payload for transit.

    Uses the same ML-KEM-768 + AES-256-GCM construction as ``encrypt_chunk``
    but with a streamlined output schema suitable for prompt encapsulation.
    The encrypted payload can only be decrypted by the holder of the
    gateway's ML-KEM private key.

    Returns a JSON-friendly dict with:
      - mlkem_ciphertext: ML-KEM encapsulation ciphertext (base64)
      - aes_nonce: AES-256-GCM nonce (base64)
      - aes_ciphertext: encrypted payload (base64)
    """
    _ensure_mlkem()

    shared_secret, mlkem_ciphertext = _MLKEM_PUBLIC_KEY.encapsulate()
    aesgcm = AESGCM(shared_secret)
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)

    return {
        "mlkem_ciphertext": base64.b64encode(mlkem_ciphertext).decode(),
        "aes_nonce": base64.b64encode(nonce).decode(),
        "aes_ciphertext": base64.b64encode(ciphertext).decode(),
    }


def decrypt_payload(encrypted: dict) -> str:
    """
    Reverse ``encrypt_payload``.

    Accepts a dict with ``mlkem_ciphertext``, ``aes_nonce``, and
    ``aes_ciphertext`` (all base64). Returns the decrypted plaintext string.
    """
    _ensure_mlkem()

    mlkem_ciphertext = base64.b64decode(encrypted["mlkem_ciphertext"])
    shared_secret = _MLKEM_PRIVATE_KEY.decapsulate(mlkem_ciphertext)
    aesgcm = AESGCM(shared_secret)
    nonce = base64.b64decode(encrypted["aes_nonce"])
    ciphertext = base64.b64decode(encrypted["aes_ciphertext"])
    return aesgcm.decrypt(nonce, ciphertext, None).decode("utf-8")


# ── Tamper-evident audit records (ML-DSA-65 signed) ─────────────────────────

import json as _json


def create_audit_record(
    prompt_hash: str,
    verdict: str,
    risk_score: int,
    timestamp: str,
    encryption_status: str = "",
    fallback_engaged: bool = False,
) -> str:
    """
    Create a tamper-evident audit record signed with ML-DSA-65.

    The record is a JSON document containing the routing decision metadata,
    signed by the gateway's ML-DSA-65 private key. Any modification to the
    record after signing will cause ``verify_audit_record`` to fail.

    Returns a base64-encoded signed JSON envelope:
      {"record": {...}, "signature": "<base64 ML-DSA-65 signature>"}
    """
    record = {
        "prompt_hash": prompt_hash,
        "verdict": verdict,
        "risk_score": risk_score,
        "timestamp": timestamp,
        "encryption_status": encryption_status,
        "fallback_engaged": fallback_engaged,
        "algorithm": "ML-DSA-65",
    }

    record_json = _json.dumps(record, sort_keys=True, separators=(",", ":"))
    signature = sign_payload(record_json.encode("utf-8"))

    envelope = {
        "record": record,
        "signature": signature,
    }
    return base64.b64encode(
        _json.dumps(envelope, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).decode()


def verify_audit_record(record_b64: str) -> dict | None:
    """
    Verify a tamper-evident audit record.

    Returns the decoded record dict if the ML-DSA-65 signature is valid,
    or None if verification fails (the record has been tampered with).
    """
    try:
        envelope = _json.loads(base64.b64decode(record_b64).decode("utf-8"))
        record = envelope["record"]
        signature = envelope["signature"]

        record_json = _json.dumps(record, sort_keys=True, separators=(",", ":"))
        if verify_signature(signature, record_json.encode("utf-8")):
            return record
        return None
    except Exception as exc:
        logger.warning("Audit record verification failed: %s", exc)
        return None
