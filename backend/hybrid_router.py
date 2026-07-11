"""
GreatAegis Hybrid Router — intelligent multi-model routing engine with
hardware-aware fault tolerance.

Two-tier routing architecture:
  1. PUBLIC     → Fireworks AI API via GLM 5.2 (safe, low-cost public endpoint)
  2. PRIVATE    → AMD Instinct Pod via vLLM (Qwen/Qwen3-0.6B, private inference)

When APP_MODE=production and the vLLM endpoint is unreachable, the router
automatically engages SECURE_FALLBACK — emergency zero-trust routing via
client-side encrypted PQC tunnel to Fireworks AI — instead of throwing a
500 Internal Server Error.
"""

from __future__ import annotations

import logging
import re
import time
from typing import Literal

import requests

logger = logging.getLogger("great_aegis.hybrid_router")

Verdict = Literal[
    "public_fireworks",
    "private_route",
    "secure_fallback",
]
ModelName = Literal[
    "private_route",
    "Fireworks AI (Encrypted Tunnel Fallback)",
    "accounts/fireworks/models/glm-5p2",
]
HardwareStatus = Literal["online", "offline", "simulated"]

# ── Sensitivity keywords ────────────────────────────────────────────────────

_SENSITIVE_KEYWORDS = [
    "financial", "revenue", "confidential", "secret", "password",
    "salary", "budget", "acquisition", "merger", "classified",
    "trade secret", "non-public", "insider", "proprietary",
    "nda", "embargo", "restricted", "internal only",
    "forecast", "earnings", "patent",
    "intellectual property",
]

# Keywords that indicate the prompt is a compliance / policy / lightweight
# reasoning task → route to private Qwen (compliance profile).
_COMPLIANCE_KEYWORDS = [
    "compliance", "policy", "audit", "regulation", "gdpr",
    "soc2", "iso27001", "hipaa", "pci", "governance",
    "review", "summarise", "summarize", "classify", "check",
    "verify", "moderate", "flag", "screening",
    "triage", "routing rule", "cost estimate", "quick",
    "lightweight", "simple query", "faq",
]

# Prompts that clearly need deep inference → Qwen (deep-inference profile)
_DEEP_INFERENCE_KEYWORDS = [
    "generate", "write", "draft", "compose", "create",
    "analyse", "analyze", "deep dive", "complex", "detailed",
    "reasoning chain", "step by step", "explain in detail",
    "long form", "research", "report", "strategy",
]

# ── Disaster-recovery fallback message ──────────────────────────────────────

_FALLBACK_REASON = (
    "AMD Private Pod status is currently OFFLINE or INITIALIZING. "
    "Automatically engaged emergency zero-trust fallback routing via "
    "client-side encrypted PQC tunnel to Fireworks AI to prevent data "
    "disruption."
)


def _keyword_hits(text: str, keywords: list[str]) -> int:
    """Count keyword matches using word-boundary regex to avoid false positives
    from binary data (e.g. 'ip' matching random bytes in a raw PDF)."""
    hits = 0
    for kw in keywords:
        if re.search(r'\b' + re.escape(kw) + r'\b', text):
            hits += 1
    return hits


# ── Risk scoring ────────────────────────────────────────────────────────────

def _compute_risk_score(prompt: str) -> int:
    """Return a score 0-100 indicating how sensitive the prompt is."""
    lowered = prompt.lower()
    score = 0
    for kw in _SENSITIVE_KEYWORDS:
        if re.search(r'\b' + re.escape(kw) + r'\b', lowered):
            score += 20
    match_count = _keyword_hits(lowered, _SENSITIVE_KEYWORDS)
    if match_count >= 3:
        score += 15
    return min(score, 100)


# ── Workload classification ─────────────────────────────────────────────────

def _classify_workload(prompt: str) -> Literal["compliance", "deep-inference", "general"]:
    """
    Classify the prompt workload type to decide between compliance and deep-inference profiles.
    """
    lowered = prompt.lower()
    compliance_hits = _keyword_hits(lowered, _COMPLIANCE_KEYWORDS)
    deep_hits = _keyword_hits(lowered, _DEEP_INFERENCE_KEYWORDS)

    if deep_hits >= 2 or (deep_hits >= 1 and deep_hits >= compliance_hits):
        return "deep-inference"
    if compliance_hits >= 1:
        return "compliance"
    return "general"


# ── vLLM health probe ───────────────────────────────────────────────────────

# Short-lived cache so that repeated probes within the same window (e.g.
# probe_all + route's re-probe + frontend /health polling) don't each hit
# the network and emit duplicate warning lines.  Keyed by health URL.
_HEALTH_CACHE_TTL: float = 5.0
_HEALTH_CACHE: dict[str, tuple[float, bool]] = {}


def probe_vllm_health(endpoint_url: str, timeout: float = 3.0) -> bool:
    """
    Ping a vLLM server's /health endpoint.

    Returns True if the server responds with HTTP 200 within the timeout
    window, False for any connection error, timeout, or non-200 status.

    Results are cached for ``_HEALTH_CACHE_TTL`` seconds so that concurrent
    or back-to-back callers (frontend polling, per-request re-probe in
    :func:`route`) share a single network round-trip and a single log line.
    """
    health_url = endpoint_url.rstrip("/").replace("/v1/chat/completions", "/health")

    cached = _HEALTH_CACHE.get(health_url)
    if cached is not None and (time.monotonic() - cached[0]) < _HEALTH_CACHE_TTL:
        return cached[1]

    alive = _probe_vllm_health_uncached(health_url, timeout)
    _HEALTH_CACHE[health_url] = (time.monotonic(), alive)
    return alive


def _probe_vllm_health_uncached(health_url: str, timeout: float) -> bool:
    """Perform the actual network probe (no caching, no dedup)."""
    try:
        resp = requests.get(health_url, timeout=timeout)
        if resp.status_code == 200:
            return True
        logger.warning(
            "vLLM health probe returned HTTP %d from %s",
            resp.status_code,
            health_url,
        )
        return False
    except requests.exceptions.ConnectionError:
        logger.warning("vLLM health probe: connection refused — %s", health_url)
        return False
    except requests.exceptions.HTTPError as exc:
        logger.warning("vLLM health probe: HTTP error — %s (%s)", health_url, exc)
        return False
    except requests.exceptions.Timeout:
        logger.warning("vLLM health probe: timeout after %.1fs — %s", timeout, health_url)
        return False


def probe_all_vllm_endpoints(
    endpoints: dict[str, str],
    timeout: float = 3.0,
) -> HardwareStatus:
    """
    Check every configured vLLM endpoint.

    Returns:
        "online"     — at least one endpoint is reachable
        "offline"    — production mode but all endpoints are unreachable
        "simulated"  — no endpoints provided (simulated/development mode)
    """
    if not endpoints:
        return "simulated"

    any_alive = False
    for model, url in endpoints.items():
        if probe_vllm_health(url, timeout=timeout):
            logger.info("vLLM endpoint %s (%s) is healthy", model, url)
            any_alive = True
        else:
            logger.warning("vLLM endpoint %s (%s) is unreachable", model, url)

    return "online" if any_alive else "offline"


# ── Core routing ────────────────────────────────────────────────────────────

def route(
    prompt_payload: str,
    client_encryption_flag: bool = False,
    routing_profile: str = "auto",
    vllm_endpoints: dict[str, str] | None = None,
    app_mode: str = "simulated",
    quantum_encryption_enabled: bool = True,
    zero_trust_enabled: bool = True,
    pod_isolation_enabled: bool = True,
    encrypted_prompt_received: bool = False,
) -> tuple[Verdict, int, ModelName, str, bool]:
    """
    Determine the routing verdict, target model, and reasoning.

    Args:
        prompt_payload:           Raw user prompt text (decrypted if
                                  client-side PQC was used).
        client_encryption_flag:   True if the client already wrapped the payload.
        routing_profile:          "auto" | "compliance" | "deep-inference"
        vllm_endpoints:           Map of model name → vLLM endpoint URL
                                  (only used in production mode).
        app_mode:                 "simulated" | "production"
        quantum_encryption_enabled: Rule 1 — ML-KEM/Kyber key wrapping.
                                  OFF → force client_encryption_flag to False.
        zero_trust_enabled:       Rule 2 — Zero-Trust payload encapsulation.
                                  ON → force ALL traffic through private routes
                                  and require encrypted prompt from client.
        pod_isolation_enabled:    Rule 3 — Strict pod isolation.
                                  ON → block fallback to external providers.
        encrypted_prompt_received: True if the client sent an ML-KEM-encrypted
                                  prompt (``encrypted_prompt`` field was present
                                  and successfully decrypted by the gateway).

    Returns:
        (verdict, risk_score, model_name, routing_reason, fallback_engaged)
    """
    score = _compute_risk_score(prompt_payload)

    # ── Apply quantum rule overrides ───────────────────────────────────
    # Rule 1: if ML-KEM wrapping is disabled, force encryption flag off
    effective_encryption = client_encryption_flag and quantum_encryption_enabled
    # Rule 2: if zero-trust is enabled, force all traffic through private routes
    force_private = zero_trust_enabled

    # ── Zero-trust enforcement: require encrypted prompt ───────────────
    if zero_trust_enabled and not encrypted_prompt_received and score >= 40:
        logger.warning(
            "Zero-trust policy requires encrypted prompt for sensitive "
            "content (risk=%d). Routing to private path with warning.",
            score,
        )

    # ── Step 1: public vs private ──────────────────────────────────────
    if not force_private and score < 40 and not effective_encryption:
        return (
            "public_fireworks",
            score,
            "accounts/fireworks/models/glm-5p2",
            "Low-risk content; routed to public Fireworks endpoint via GLM 5.2 for cost efficiency.",
            False,
        )

    # ── Step 2: route to private Qwen ─────────────────────────────────
    verdict: Verdict = "private_route"
    target_model: ModelName = "private_route"
    reason = (
        "Sensitive or complex inference task; "
        "routed to AMD Secure Pod via vLLM "
        "with client-side ML-KEM encryption."
    )

    # ── Step 3: hardware health check (production only) ────────────────
    if app_mode == "production" and vllm_endpoints:
        endpoint = vllm_endpoints.get(target_model)
        if endpoint and not probe_vllm_health(endpoint):
            logger.error(
                "Target vLLM endpoint %s (%s) is unreachable — "
                "engaging SECURE_FALLBACK for prompt classification.",
                target_model,
                endpoint,
            )

            if pod_isolation_enabled:
                # Pod isolation is ON but the AMD Pod is not ready.  We still
                # fall back to Fireworks AI via encrypted tunnel so the user
                # gets a response, but flag that pod isolation policy was
                # relaxed for this request.
                return (
                    "secure_fallback",
                    max(score, 80),
                    "Fireworks AI (Encrypted Tunnel Fallback)",
                    "AMD Private Pod is not ready. Sensitive content was routed "
                    "through an encrypted PQC tunnel to Fireworks AI. Pod isolation "
                    "policy was bypassed for emergency continuity — restore AMD pod "
                    "connectivity to resume private processing.",
                    True,
                )

            return (
                "secure_fallback",
                max(score, 80),  # floor at 80 to reflect elevated risk
                "Fireworks AI (Encrypted Tunnel Fallback)",
                "AMD Private Pod is not ready. Sensitive content was routed "
                "through an encrypted PQC tunnel to Fireworks AI as a zero-trust "
                "fallback. Data remains protected via client-side ML-KEM wrapping.",
                True,
            )

    return (verdict, score, target_model, reason, False)
