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
FIREWORKS_V1_BASE = "https://api.fireworks.ai/v1"


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
    model: str = "accounts/fireworks/models/gemma-4-26b-a4b-it",
    temperature: float = 0.7,
    max_tokens: int = 2048,
) -> AsyncGenerator[dict, None]:
    """
    Stream tokens from Fireworks AI chat completions endpoint.

    Yields dicts with the following shapes:
      {"type": "token", "content": "Hello"}
      {"type": "done"}
      {"type": "error", "detail": "..."}

    Raises FireworksError on non-streaming HTTP errors.
    """
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }

    body = {
        "model": model,
        "messages": messages,
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
                                    yield {"type": "done", "finish_reason": finish_reason}
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
    model: str = "accounts/fireworks/models/gemma-4-26b-a4b-it",
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


# ── Usage Metrics ───────────────────────────────────────────────────────────

async def get_usage(api_key: str) -> dict:
    """
    Fetch usage stats from the Fireworks AI usage API.

    Returns a dict with token usage and cost breakdown.
    Falls back gracefully if the usage endpoint is unavailable.
    """
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.get(
                f"{FIREWORKS_V1_BASE}/usage",
                headers=headers,
            )
            if resp.status_code == 200:
                return resp.json()
            # Some keys may not have usage endpoint access
            logger.warning("Fireworks usage API returned HTTP %d", resp.status_code)
            return {"error": f"HTTP {resp.status_code}", "data": None}
        except httpx.TimeoutException:
            logger.warning("Fireworks usage API timed out")
            return {"error": "timeout", "data": None}
        except httpx.RequestError as exc:
            logger.warning("Fireworks usage API connection error: %s", exc)
            return {"error": str(exc), "data": None}
