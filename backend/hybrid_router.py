"""
GreatAegis Hybrid Router — intelligent multi-model routing engine with
hardware-aware fault tolerance.

Three-tier routing architecture:
  1. PUBLIC          → Fireworks AI API via Gemma 4 26B (safe, low-cost public endpoint)
  2. PRIVATE-GEMMA   → AMD-hosted Gemma via vLLM (lightweight compliance,
                         policy verification, intermediate reasoning)
  3. PRIVATE-MIXTRAL → AMD Instinct Pod via vLLM (heavy inference, high-
                         sensitivity data, deep confidential reasoning)

When APP_MODE=production and a vLLM endpoint is unreachable, the router
automatically engages SECURE_FALLBACK — emergency zero-trust routing via
client-side encrypted PQC tunnel to Fireworks AI — instead of throwing a
500 Internal Server Error.
"""

from __future__ import annotations

import logging
from typing import Literal

import requests

logger = logging.getLogger("great_aegis.hybrid_router")

Verdict = Literal[
    "public_fireworks",
    "private_gemma",
    "private_mixtral",
    "secure_fallback",
]
ModelName = Literal[
    "gemma-7b",
    "mixtral-8x7b",
    "Fireworks AI (Encrypted Tunnel Fallback)",
    "accounts/fireworks/models/gemma-4-26b-a4b-it",
]
HardwareStatus = Literal["online", "offline", "simulated"]

# ── Sensitivity keywords ────────────────────────────────────────────────────

_SENSITIVE_KEYWORDS = [
    "financial", "revenue", "confidential", "secret", "password",
    "salary", "budget", "q4", "acquisition", "merger", "classified",
    "trade secret", "non-public", "insider", "proprietary",
    "nda", "embargo", "restricted", "internal only",
    "forecast", "earnings", "patent", "ip",
]

# Keywords that indicate the prompt is a compliance / policy / lightweight
# reasoning task → route to Gemma (cheaper, equally capable for this tier).
_COMPLIANCE_KEYWORDS = [
    "compliance", "policy", "audit", "regulation", "gdpr",
    "soc2", "iso27001", "hipaa", "pci", "governance",
    "review", "summarise", "summarize", "classify", "check",
    "validate", "verify", "moderate", "flag", "screening",
    "triage", "routing rule", "cost estimate", "quick",
    "lightweight", "simple query", "faq",
]

# Prompts that clearly need deep inference → Mixtral
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

# ── Risk scoring ────────────────────────────────────────────────────────────

def _compute_risk_score(prompt: str) -> int:
    """Return a score 0-100 indicating how sensitive the prompt is."""
    lowered = prompt.lower()
    score = 0
    for kw in _SENSITIVE_KEYWORDS:
        if kw in lowered:
            score += 20
    match_count = sum(1 for kw in _SENSITIVE_KEYWORDS if kw in lowered)
    if match_count >= 3:
        score += 15
    return min(score, 100)


# ── Workload classification ─────────────────────────────────────────────────

def _classify_workload(prompt: str) -> Literal["compliance", "deep-inference", "general"]:
    """
    Classify the prompt workload type to decide between Gemma and Mixtral.
    """
    lowered = prompt.lower()
    compliance_hits = sum(1 for kw in _COMPLIANCE_KEYWORDS if kw in lowered)
    deep_hits = sum(1 for kw in _DEEP_INFERENCE_KEYWORDS if kw in lowered)

    if deep_hits >= 2 or (deep_hits >= 1 and compliance_hits == 0):
        return "deep-inference"
    if compliance_hits >= 1:
        return "compliance"
    return "general"


# ── vLLM health probe ───────────────────────────────────────────────────────

def probe_vllm_health(endpoint_url: str, timeout: float = 3.0) -> bool:
    """
    Ping a vLLM server's /health endpoint.

    Returns True if the server responds with HTTP 200 within the timeout
    window, False for any connection error, timeout, or non-200 status.
    """
    health_url = endpoint_url.rstrip("/").replace("/v1/chat/completions", "/health")

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
) -> tuple[Verdict, int, ModelName, str, bool]:
    """
    Determine the routing verdict, target model, and reasoning.

    Args:
        prompt_payload:           Raw user prompt text.
        client_encryption_flag:   True if the client already wrapped the payload.
        routing_profile:          "auto" | "compliance" | "deep-inference"
        vllm_endpoints:           Map of model name → vLLM endpoint URL
                                  (only used in production mode).
        app_mode:                 "simulated" | "production"
        quantum_encryption_enabled: Rule 1 — ML-KEM/Kyber key wrapping.
                                  OFF → force client_encryption_flag to False.
        zero_trust_enabled:       Rule 2 — Zero-Trust payload encapsulation.
                                  ON → force ALL traffic through private routes.
        pod_isolation_enabled:    Rule 3 — Strict pod isolation.
                                  ON → block fallback to external providers.

    Returns:
        (verdict, risk_score, model_name, routing_reason, fallback_engaged)
    """
    score = _compute_risk_score(prompt_payload)

    # ── Apply quantum rule overrides ───────────────────────────────────
    # Rule 1: if ML-KEM wrapping is disabled, force encryption flag off
    effective_encryption = client_encryption_flag and quantum_encryption_enabled
    # Rule 2: if zero-trust is enabled, force all traffic through private routes
    force_private = zero_trust_enabled

    # ── Step 1: public vs private ──────────────────────────────────────
    if not force_private and score < 40 and not effective_encryption:
        return (
            "public_fireworks",
            score,
            "accounts/fireworks/models/gemma-4-26b-a4b-it",
            "Low-risk content; routed to public Fireworks endpoint via Gemma 4 26B for cost efficiency.",
            False,
        )

    # ── Step 2: which private model? ───────────────────────────────────
    workload = _classify_workload(prompt_payload)

    # Respect explicit routing profile overrides
    if routing_profile == "compliance":
        workload = "compliance"
    elif routing_profile == "deep-inference":
        workload = "deep-inference"

    if workload == "compliance":
        verdict: Verdict = "private_gemma"
        target_model: ModelName = "gemma-7b"
        reason = (
            "Lightweight compliance / policy verification task; "
            "routed to AMD-hosted Gemma-7B via vLLM for optimal cost-performance."
        )
    else:
        verdict = "private_mixtral"
        target_model = "mixtral-8x7b"
        reason = (
            "Sensitive or complex inference task; "
            "routed to AMD Instinct MI300X Pod running Mixtral-8x7B via vLLM "
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
                # Rule 3: Strict pod isolation blocks all external fallback
                return (
                    "secure_fallback",
                    max(score, 80),
                    "Fireworks AI (Encrypted Tunnel Fallback)",
                    "STRICT POD ISOLATION POLICY BLOCKED: AMD Private Pod unreachable "
                    "and fallback to external providers is disabled by pod isolation. "
                    "Disable pod isolation in Security Suite to allow emergency "
                    "zero-trust routing via Fireworks AI, or restore AMD pod connectivity.",
                    True,
                )

            return (
                "secure_fallback",
                max(score, 80),  # floor at 80 to reflect elevated risk
                "Fireworks AI (Encrypted Tunnel Fallback)",
                _FALLBACK_REASON,
                True,
            )

    return (verdict, score, target_model, reason, False)
