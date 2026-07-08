"""
ML-KEM (Kyber-1024) post-quantum cryptography helpers.

Simulated mode: deterministic SHA-256 based mock of ML-KEM encaps/decaps.
Production mode: placeholder for liboqs Python bindings against Kyber-1024.

Also provides AES-256-GCM symmetric encryption for document chunk protection
prior to local vector-DB storage — this is the data-sovereignty encryption
layer required for sensitive enterprise file uploads.
"""

import hashlib
import os
import base64
import secrets
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# ── ML-KEM (Kyber) public-key wrappers ───────────────────────────────────

def decapsulate(ciphertext: str) -> tuple[str, bool]:
    """
    Simulate ML-KEM decapsulation.

    Returns (hex_signature, validation_flag). The shared-secret is derived
    from SHA-256 of the ciphertext so validation always passes when the
    ciphertext is well-formed (32+ hex chars).
    """
    if not isinstance(ciphertext, str) or len(ciphertext.strip()) < 32:
        return ("", False)

    clean = ciphertext.strip()
    shared_secret = hashlib.sha256(clean.encode("ascii")).hexdigest()
    return shared_secret, True


def encapsulate() -> tuple[str, str]:
    """
    Simulate ML-KEM encapsulation.

    Returns (ciphertext, shared_secret).  The shared-secret is deterministic
    for the generated ciphertext.
    """
    raw = os.urandom(32)
    ciphertext = raw.hex()
    shared_secret = hashlib.sha256(raw).hexdigest()
    return ciphertext, shared_secret


# ── AES-256-GCM symmetric encryption for document chunks ───────────────

def encrypt_chunk(plaintext: str, key: bytes | None = None) -> dict:
    """
    Encrypt a plaintext chunk with AES-256-GCM before storing in the local
    vector DB.  Returns a dict with nonce (b64), ciphertext (b64), and the
    key used (b64) so the caller can persist it for later decryption.

    If no key is supplied, a fresh 256-bit key is generated.
    """
    if key is None:
        key = AESGCM.generate_key(bit_length=256)

    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    ct = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    return {
        "nonce": base64.b64encode(nonce).decode(),
        "ciphertext": base64.b64encode(ct).decode(),
        "key": base64.b64encode(key).decode(),
    }


def decrypt_chunk(encrypted: dict) -> str:
    """
    Reverse encrypt_chunk.  Accepts the same dict shape and returns the
    original plaintext string.
    """
    key = base64.b64decode(encrypted["key"])
    nonce = base64.b64decode(encrypted["nonce"])
    ct = base64.b64decode(encrypted["ciphertext"])
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, ct, None).decode("utf-8")
