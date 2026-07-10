/**
 * Client-side post-quantum cryptography for GreatAegis AI Gateway.
 *
 * Uses @noble/post-quantum (auditable, pure JS, FIPS 203/204/205) to perform
 * ML-KEM-768 key encapsulation in the browser. This means prompts are
 * quantum-wrapped BEFORE they hit the network — an HNDL attacker observing
 * traffic only sees ML-KEM ciphertext, not plaintext.
 *
 * Also provides ML-DSA-65 signature verification so the client can
 * independently verify that a response originated from the gateway.
 */

import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";
import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";

const API_BASE = import.meta.env.VITE_API_BASE_URL;

// ── Cached server public keys ───────────────────────────────────────────────

let _mlkemPublicKey: Uint8Array | null = null;
let _mldsaPublicKey: Uint8Array | null = null;
let _keyFetchPromise: Promise<void> | null = null;

interface PqcPublicKeyResponse {
  mlkem_public_key: string;
  mldsa_public_key: string;
  algorithms: string;
}

/**
 * Fetch and cache the gateway's PQC public keys.
 * Called once per page load; subsequent calls return from cache.
 */
export async function ensureServerPublicKeys(): Promise<void> {
  if (_mlkemPublicKey && _mldsaPublicKey) return;
  if (_keyFetchPromise) return _keyFetchPromise;

  _keyFetchPromise = (async () => {
    const res = await fetch(`${API_BASE}/api/v1/gateway/pqc-public-key`);
    if (!res.ok) throw new Error(`PQC key fetch failed: HTTP ${res.status}`);
    const data: PqcPublicKeyResponse = await res.json();
    _mlkemPublicKey = base64ToBytes(data.mlkem_public_key);
    _mldsaPublicKey = base64ToBytes(data.mldsa_public_key);
  })();

  return _keyFetchPromise;
}

// ── ML-KEM-768 prompt encapsulation ─────────────────────────────────────────

export interface EncryptedPrompt {
  /** base64-encoded JSON string of {mlkem_ciphertext, aes_nonce, aes_ciphertext} */
  encrypted_prompt: string;
}

/**
 * Encapsulate a prompt using ML-KEM-768 in the browser.
 *
 * 1. Derive a shared secret via ML-KEM encapsulation with the server's public key.
 * 2. Generate a fresh AES-256-GCM key, encrypt the prompt.
 * 3. Wrap the AES key with the ML-KEM shared secret.
 * 4. Return a base64-encoded JSON blob the backend can decrypt.
 *
 * This mirrors the backend's encrypt_payload() construction so the server
 * can decrypt with its ML-KEM private key.
 */
export async function encapsulatePrompt(prompt: string): Promise<EncryptedPrompt> {
  await ensureServerPublicKeys();
  if (!_mlkemPublicKey) throw new Error("ML-KEM public key not available");

  // 1. ML-KEM-768 encapsulation → (cipherText, sharedSecret)
  const { cipherText: mlkemCiphertext, sharedSecret } = ml_kem768.encapsulate(_mlkemPublicKey);

  // 2. AES-256-GCM encrypt the prompt using the shared secret as the key.
  //    The shared secret from ML-KEM-768 is 32 bytes — perfect for AES-256.
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const promptBytes = new TextEncoder().encode(prompt);
  const aesKey = await crypto.subtle.importKey(
    "raw",
    sharedSecret,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    promptBytes,
  );

  // 3. Build the JSON payload matching backend decrypt_payload() expectations.
  const payload = {
    mlkem_ciphertext: bytesToBase64(mlkemCiphertext),
    aes_nonce: bytesToBase64(iv),
    aes_ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };

  // 4. Base64-encode the JSON for transit.
  const jsonStr = JSON.stringify(payload);
  const encrypted_prompt = bytesToBase64(new TextEncoder().encode(jsonStr));

  return { encrypted_prompt };
}

// ── ML-DSA-65 signature verification ────────────────────────────────────────

/**
 * Verify a gateway ML-DSA-65 signature on a response payload.
 *
 * @param signatureB64  base64-encoded ML-DSA-65 signature from the server
 * @param payload       the original payload bytes that were signed
 * @returns true if the signature is valid
 */
export async function verifyServerSignature(
  signatureB64: string,
  payload: string,
): Promise<boolean> {
  await ensureServerPublicKeys();
  if (!_mldsaPublicKey) return false;

  try {
    const signature = base64ToBytes(signatureB64);
    const msg = new TextEncoder().encode(payload);
    return ml_dsa65.verify(signature, msg, _mldsaPublicKey);
  } catch {
    return false;
  }
}

// ── Base64 helpers ──────────────────────────────────────────────────────────

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
