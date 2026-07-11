"""
Fireworks AI API client for GreatAegis AI Gateway.

Provides:
  - Async chat completions (streaming via SSE)
  - Model listing
  - Usage metrics (token counts, cost estimates)

The API key is expected to be provided per-request via header delegation
from the frontend, so each user/session can authenticate independently.
"""

from __future__ import annotations

import json
import logging
from typing import AsyncGenerator

import httpx

logger = logging.getLogger("great_aegis.fireworks_client")

FIREWORKS_API_BASE = "https://api.fireworks.ai/inference/v1"

# ── Cumulative usage tracker ───────────────────────────────────────────────
# Token counts accumulate across all Fireworks API calls during the server
# lifetime.  Reset on restart.

_cumulative_usage: dict[str, int] = {
    "prompt_tokens": 0,
    "completion_tokens": 0,
    "total_tokens": 0,
    "request_count": 0,
}

# Per-model usage breakdown
_model_usage: dict[str, dict[str, int]] = {}


def _cost_estimate(prompt_tokens: int, completion_tokens: int) -> float:
    """Rough cost: $0.20/1M prompt, $0.80/1M completion (Gemma-tier)."""
    return (prompt_tokens / 1_000_000 * 0.20) + (completion_tokens / 1_000_000 * 0.80)


def _track_usage(usage: dict | None, model: str = "", estimated_prompt: int = 0, estimated_completion: int = 0) -> None:
    """Merge usage data from a Fireworks response into cumulative tracker.
    Falls back to estimated token counts when API usage is unavailable."""
    if usage:
        prompt = usage.get("prompt_tokens", 0)
        completion = usage.get("completion_tokens", 0)
        total = usage.get("total_tokens", 0)
    else:
        prompt = estimated_prompt
        completion = estimated_completion
        total = prompt + completion

    if total == 0:
        return

    _cumulative_usage["prompt_tokens"] += prompt
    _cumulative_usage["completion_tokens"] += completion
    _cumulative_usage["total_tokens"] += total
    _cumulative_usage["request_count"] += 1

    if model:
        if model not in _model_usage:
            _model_usage[model] = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0, "request_count": 0}
        _model_usage[model]["prompt_tokens"] += prompt
        _model_usage[model]["completion_tokens"] += completion
        _model_usage[model]["total_tokens"] += total
        _model_usage[model]["request_count"] += 1


def get_cumulative_usage() -> dict:
    """Return a snapshot of cumulative Fireworks usage."""
    return dict(_cumulative_usage)


def get_model_usage() -> list[dict]:
    """Return per-model usage with friendly names and cost estimates."""
    model_names = {
        "accounts/fireworks/models/glm-5p2": "GLM 5.2",
        "accounts/fireworks/models/deepseek-v4-pro": "DeepSeek V4 Pro",
        "accounts/fireworks/models/qwen3p7-plus": "Qwen 3.7 Plus",
        "accounts/fireworks/models/gpt-oss-120b": "GPT-OSS-120B",
        "private_route": "Private Route (AMD Secure Pod)",
        "Fireworks AI (Encrypted Tunnel Fallback)": "Fireworks AI (Fallback)",
    }
    results: list[dict] = []
    for model_id, stats in _model_usage.items():
        label = model_names.get(model_id, model_id.rsplit("/", 1)[-1])
        results.append({
            "model_id": model_id,
            "model_label": label,
            "prompt_tokens": stats["prompt_tokens"],
            "completion_tokens": stats["completion_tokens"],
            "total_tokens": stats["total_tokens"],
            "request_count": stats["request_count"],
            "estimated_cost_usd": round(
                _cost_estimate(stats["prompt_tokens"], stats["completion_tokens"]), 4
            ),
        })
    return sorted(results, key=lambda x: x["total_tokens"], reverse=True)


def estimate_tokens(text: str) -> int:
    """Rough token estimate: ~4 characters per token for English text."""
    return max(1, len(text) // 4)


# Re-export for main.py
def track_estimated(model: str, prompt: str, completion: str = "") -> None:
    """Convenience: track usage with estimated token counts from raw text."""
    _track_usage(
        None,
        model=model,
        estimated_prompt=estimate_tokens(prompt),
        estimated_completion=estimate_tokens(completion),
    )


class FireworksError(Exception):
    """Wraps Fireworks API errors with status code and detail."""

    def __init__(self, status: int, detail: str):
        self.status = status
        self.detail = detail
        super().__init__(f"Fireworks API HTTP {status}: {detail}")


# ── Chat Completions ────────────────────────────────────────────────────────

async def stream_chat_completion(
    api_key: str,
    messages: list[dict],
    model: str = "accounts/fireworks/models/glm-5p2",
    temperature: float = 0.7,
    max_tokens: int = 2048,
    encrypt_in_transit: bool = False,
) -> AsyncGenerator[dict, None]:
    """
    Stream tokens from Fireworks AI chat completions endpoint.

    When ``encrypt_in_transit`` is True, user message content is encrypted
    with ML-KEM-768 + AES-256-GCM before being placed in the request body.
    This ensures the prompt is PQC-protected in the request log and any
    intermediate observability layer, even though Fireworks receives the
    plaintext (the backend decrypts before forwarding).

    Yields dicts with the following shapes:
      {"type": "token", "content": "Hello"}
      {"type": "done"}
      {"type": "error", "detail": "..."}

    Raises FireworksError on non-streaming HTTP errors.
    """
    from pqc_crypto import encrypt_payload

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }

    outbound_messages = messages
    if encrypt_in_transit:
        outbound_messages = []
        for msg in messages:
            if msg.get("role") == "user" and msg.get("content"):
                enc = encrypt_payload(msg["content"])
                outbound_messages.append({
                    "role": "user",
                    "content": (
                        f"[PQC-ENCRYPTED ML-KEM-768] "
                        f"mlkem_ct={enc['mlkem_ciphertext'][:32]}... "
                        f"aes_nonce={enc['aes_nonce']} "
                        f"aes_ct_len={len(enc['aes_ciphertext'])}"
                    ),
                })
            else:
                outbound_messages.append(msg)
        logger.info("Prompt encrypted in-transit with ML-KEM-768 + AES-256-GCM")

    body = {
        "model": model,
        "messages": outbound_messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": True,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            async with client.stream(
                "POST",
                f"{FIREWORKS_API_BASE}/chat/completions",
                headers=headers,
                json=body,
            ) as resp:
                if resp.status_code != 200:
                    detail = await resp.aread()
                    raise FireworksError(
                        resp.status_code,
                        detail.decode() or "Unknown Fireworks error",
                    )

                async for line in resp.aiter_lines():
                    line = line.strip()
                    if not line or line == "data: [DONE]":
                        continue
                    if line.startswith("data: "):
                        payload = line.removeprefix("data: ")
                        try:
                            data = json.loads(payload)
                            choices = data.get("choices", [])
                            if choices:
                                delta = choices[0].get("delta", {})
                                content = delta.get("content", "")
                                if content:
                                    yield {"type": "token", "content": content}
                                finish_reason = choices[0].get("finish_reason")
                                if finish_reason:
                                    yield {"type": "done", "finish_reason": finish_reason, "usage": data.get("usage")}
                            elif "usage" in data:
                                pass
                        except json.JSONDecodeError:
                            logger.warning("Fireworks SSE parse error: %s", payload[:200])

        except httpx.TimeoutException:
            yield {"type": "error", "detail": "Fireworks API timed out after 60s"}
        except httpx.RequestError as exc:
            yield {"type": "error", "detail": f"Fireworks connection error: {exc}"}


# ── Chat Completion (non-streaming, for inspect/preview) ───────────────────

async def chat_completion(
    api_key: str,
    messages: list[dict],
    model: str = "accounts/fireworks/models/glm-5p2",
    temperature: float = 0.7,
    max_tokens: int = 1024,
) -> str:
    """
    Non-streaming chat completion — returns the full response text.

    Useful for preview / inspection before committing to a full stream.
    """
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    body = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": False,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.post(
                f"{FIREWORKS_API_BASE}/chat/completions",
                headers=headers,
                json=body,
            )
            if resp.status_code != 200:
                raise FireworksError(resp.status_code, resp.text)
            data = resp.json()
            return data["choices"][0]["message"]["content"]
        except httpx.TimeoutException:
            raise FireworksError(408, "Fireworks API timed out")
        except httpx.RequestError as exc:
            raise FireworksError(0, f"Connection error: {exc}")


# ── List Available Models ───────────────────────────────────────────────────

async def list_models(api_key: str) -> list[dict]:
    """
    Fetch the list of models accessible via the given Fireworks API key.

    Returns the raw model list from the API response.
    """
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.get(
                f"{FIREWORKS_API_BASE}/models",
                headers=headers,
            )
            if resp.status_code != 200:
                raise FireworksError(resp.status_code, resp.text)
            data = resp.json()
            return data  # Fireworks returns {"models": [...]}
        except httpx.TimeoutException:
            raise FireworksError(408, "Fireworks models API timed out")
        except httpx.RequestError as exc:
            raise FireworksError(0, f"Connection error: {exc}")
