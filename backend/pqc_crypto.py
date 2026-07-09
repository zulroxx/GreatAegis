"""
Real ML-KEM-768 post-quantum cryptography helpers.

Uses the NIST-standard ML-KEM algorithm provided by `cryptography>=49.0.0`.
All key material, ciphertexts and shared secrets are handled as raw bytes;
wire-facing payloads are base64-encoded for JSON compatibility.

Also provides AES-256-GCM symmetric encryption for document chunk protection.
Each chunk is encrypted with a fresh AES key, and that AES key is wrapped
using an ML-KEM shared secret (hybrid encryption). This means the vector DB
never stores usable plaintext keys: a copy of the persistent ML-KEM private
key is required to decrypt any document.
"""

from __future__ import annotations

import base64
import hashlib
import logging
import os
from typing import Tuple

from cryptography.hazmat.primitives.asymmetric import mlkem
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
