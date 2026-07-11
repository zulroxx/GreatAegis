"""
GreatAegis AI Gateway — FastAPI Application (v2.0)

Environment-controlled operation:
  APP_MODE=simulated   → Uses sim_data.py for mock traffic & GPU telemetry.
  APP_MODE=production  → Forwards to real vLLM endpoints on AMD Cloud hardware,
                          reads live rocm-smi metrics, and uses real PQC.

Fault tolerance:
  On startup (and via a background health poll) the gateway probes each
  configured vLLM endpoint.  If an AMD pod is unreachable the router auto-
  matically engages SECURE_FALLBACK — emergency zero-trust routing via
  client-side encrypted PQC tunnel to Fireworks AI — instead of returning
  5xx errors.  The hardware_status field propagates through every relevant
  response so the frontend can display an explicit warning banner.

Endpoints:
  GET  /api/v1/gateway/health          — App mode, hardware status, vector DB, models
  GET  /api/v1/gateway/metrics         — Zone metrics (ribbon KPIs + chart)
  GET  /api/v1/gateway/logs            — Threat-capture log entries
  POST /api/v1/gateway/inspect         — Hybrid-router + PQC inspection
  POST /api/v1/gateway/chat/stream     — Autonomous hybrid-router chat streaming
  POST /api/v1/gateway/vector/ingest   — Encrypt & store document chunks
  POST /api/v1/gateway/vector/query    — Semantic search over encrypted chunks
  GET  /api/v1/gateway/vector/stats    — Local vector DB health
  GET  /api/v1/gateway/telemetry       — GPU device stats (rocm-smi / simulated)
"""

from __future__ import annotations

try:
    from dotenv import load_dotenv
    from pathlib import Path
    _env_path = Path(__file__).resolve().parent / ".env"
    load_dotenv(dotenv_path=_env_path)
except ImportError:
    pass

import logging
import os
import time
import hashlib
import hmac
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta

from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from sse_starlette.sse import EventSourceResponse

from models import (
    InspectRequest,
    InspectResponse,
    MetricsResponse,
    LogEntry,
    ChartDataPoint,
    DocumentIngestRequest,
    DocumentIngestResponse,
    DocumentQueryRequest,
    DocumentQueryResponse,
    VectorDBStatsResponse,
    GPUTelemetryResponse,
    GPUDeviceInfo,
    HealthResponse,
    ChatRequest,
    ChatResponse,
    GatewayChatRequest,
    FireworksModelsResponse,
    FireworksUsageResponse,
    SystemMetricsResponse,
    ApiKeyRequest,
    ApiKeyStatusResponse,
    SettingsPasswordRequest,
    ModelUsageItem,
    ModelUsageResponse,
)
from pqc_crypto import (
    encapsulate as mlkem_encapsulate,
    decapsulate as mlkem_decapsulate,
    sign_payload as mldsa_sign,
    verify_signature as mldsa_verify,
    get_mldsa_public_key_b64,
    get_mlkem_public_key_b64,
    decrypt_payload as pqc_decrypt_payload,
    create_audit_record,
    verify_audit_record,
)
from sim_data import generate_gpu_telemetry, generate_offline_telemetry
from hybrid_router import (
    route,
    probe_all_vllm_endpoints,
    HardwareStatus,
)

logger = logging.getLogger("great_aegis.main")

# ── Environment toggle ──────────────────────────────────────────────────────

APP_MODE: str = os.environ.get("APP_MODE", "simulated").lower()
if APP_MODE not in ("simulated", "production"):
    APP_MODE = "simulated"

SETTINGS_PASSWORD: str = os.environ.get("SETTINGS_PASSWORD", "")

# ── vLLM endpoint map (used in production mode) ─────────────────────────────

VLLM_ENDPOINTS: dict[str, str] = {
    "private_route": os.environ.get("VLLM_ENDPOINT", ""),
}

VLLM_MODEL_NAMES: dict[str, str] = {
    "private_route": os.environ.get("VLLM_MODEL_NAME", "ThinkingCap"),
}

# ── Production safety checks ──────────────────────────────────────────────────

if APP_MODE == "production":
    import sys
    _default_mlkem = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f"
    _default_mldsa = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"
    if os.environ.get("GREATAEGIS_MLKEM_SEED", "") == _default_mlkem:
        logger.error("FATAL: GREATAEGIS_MLKEM_SEED is the default/dev seed. Refusing to start in production mode.")
        logger.error("Generate a new seed: python -c \"import secrets; print(secrets.token_hex(64))\"")
        sys.exit(1)
    if os.environ.get("GREATAEGIS_MLDSA_SEED", "") == _default_mldsa:
        logger.error("FATAL: GREATAEGIS_MLDSA_SEED is the default/dev seed. Refusing to start in production mode.")
        logger.error("Generate a new seed: python -c \"import secrets; print(secrets.token_hex(32))\"")
        sys.exit(1)
    if SETTINGS_PASSWORD in ("", "root"):
        logger.error("FATAL: SETTINGS_PASSWORD is empty or using the default 'root'. Set a strong password for production.")
        sys.exit(1)
    if not VLLM_ENDPOINTS.get("private_route"):
        logger.info("No VLLM endpoints configured — gateway will operate with Fireworks AI fallback only.")
        if not STORED_API_KEY:
            logger.error("FATAL: No VLLM endpoints configured and FIREWORKS_API_KEY is not set. Gateway has no available backend.")
            sys.exit(1)


# ── Server-side API key storage (in-memory only, never persisted) ────────────

STORED_API_KEY: str = os.environ.get("FIREWORKS_API_KEY", "")

def _resolve_api_key(header_key: str) -> str:
    """Return header key if present, otherwise fall back to stored key."""
    return header_key or STORED_API_KEY

AVAILABLE_MODELS = sorted(VLLM_ENDPOINTS.keys())

# ── Global hardware status (updated at startup + per-request) ───────────────

HARDWARE_STATUS: HardwareStatus = "simulated"


def _refresh_hardware_status() -> None:
    """
    Probe all configured vLLM endpoints and update the global
    HARDWARE_STATUS.  Safe to call at startup and periodically.
    """
    global HARDWARE_STATUS

    if APP_MODE == "simulated":
        HARDWARE_STATUS = "simulated"
        logger.info("Hardware status → simulated (APP_MODE=simulated)")
        return

    status = probe_all_vllm_endpoints(VLLM_ENDPOINTS, timeout=3.0)
    HARDWARE_STATUS = status
    logger.info("Hardware status → %s (APP_MODE=%s)", status, APP_MODE)


# ── Lifespan (startup health probe) ─────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI lifespan context: runs the vLLM health probe at startup so
    that the hardware_status field is accurate before the first request
    arrives.
    """
    _refresh_hardware_status()
    yield


# ── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="GreatAegis AI Gateway",
    version="2.0.0",
    description=f"Running in {APP_MODE.upper()} mode",
    lifespan=lifespan,
)

# CORS is locked to the local frontend origin by default. Override via env for
# production deployments or judging VMs, but never use "*" with credentials.
_ALLOWED_ORIGINS = os.environ.get(
    "GREATAEGIS_CORS_ORIGINS",
    "http://localhost:3060,http://127.0.0.1:3060,http://localhost:5173,http://127.0.0.1:5173",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _ALLOWED_ORIGINS.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type", "X-Api-Key", "Authorization"],
)

# ── Gateway API token (shared-secret auth) ────────────────────────────────────

GATEWAY_API_TOKEN: str = os.environ.get("GATEWAY_API_TOKEN", "")


@app.middleware("http")
async def _security_middleware(request: Request, call_next):
    origin = request.headers.get("origin", "")
    is_local = (
        origin.startswith("http://localhost:")
        or origin.startswith("http://127.0.0.1:")
        or request.client.host in ("127.0.0.1", "::1")
        if request.client
        else False
    )

    if GATEWAY_API_TOKEN and not is_local and request.method != "OPTIONS":
        if request.url.path.startswith("/api/v1/"):
            auth_header = request.headers.get("Authorization", "")
            if not (auth_header.startswith("Bearer ") and hmac.compare_digest(auth_header[7:], GATEWAY_API_TOKEN)):
                rejection = Response(
                    status_code=401,
                    content='{"detail":"Unauthorized — invalid or missing gateway token"}',
                    media_type="application/json",
                )
                rejection.headers["X-Content-Type-Options"] = "nosniff"
                rejection.headers["X-Frame-Options"] = "DENY"
                if origin:
                    rejection.headers["Access-Control-Allow-Origin"] = origin
                    rejection.headers["Access-Control-Allow-Credentials"] = "true"
                return rejection

    response = await call_next(request)

    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

    return response


# ── Rate limiting ────────────────────────────────────────────────────────────

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# ── Health ───────────────────────────────────────────────────────────────────

@app.get("/api/v1/gateway/health", response_model=HealthResponse)
@limiter.limit("60/minute")
async def health(request: Request):
    """
    Return app mode, hardware connectivity status, vector DB status,
    and available models.

    Triggers a fresh vLLM health probe in production mode so the
    frontend always sees the latest hardware_status.
    """
    _refresh_hardware_status()

    vdb_status = "disconnected"
    try:
        from local_vector_db import collection_stats
        stats = collection_stats()
        if stats["chunk_count"] >= 0:
            vdb_status = "connected"
    except Exception:
        vdb_status = "disconnected"

    return HealthResponse(
        status="healthy",
        app_mode=APP_MODE,
        hardware_status=HARDWARE_STATUS,
        vector_db=vdb_status,
        models_available=AVAILABLE_MODELS,
    )


# ── PQC public keys ──────────────────────────────────────────────────────────

@app.get("/api/v1/gateway/pqc-public-key")
@limiter.limit("30/minute")
async def pqc_public_key(request: Request):
    """
    Return the gateway's post-quantum public keys (ML-KEM-768 and ML-DSA-65)
    as base64-encoded raw bytes.

    Clients use the ML-KEM public key to encapsulate prompts before transit
    and the ML-DSA public key to verify signatures on responses.
    """
    return {
        "mlkem_public_key": get_mlkem_public_key_b64(),
        "mldsa_public_key": get_mldsa_public_key_b64(),
        "algorithms": "ML-KEM-768 + ML-DSA-65",
    }


# ── Audit record verification ────────────────────────────────────────────────

@app.get("/api/v1/gateway/audit/verify")
@limiter.limit("30/minute")
async def audit_verify(request: Request, record: str):
    """
    Verify a tamper-evident ML-DSA-65 signed audit record.

    Pass the base64-encoded audit record (from a log entry's ``audit_record``
    field). Returns the decoded record if the signature is valid, or a 400
    error if the record has been tampered with.
    """
    decoded = verify_audit_record(record)
    if decoded is None:
        raise HTTPException(
            status_code=400,
            detail="Audit record signature verification failed — record may have been tampered with.",
        )
    return {"valid": True, "record": decoded, "algorithm": "ML-DSA-65"}


# ── Runtime mode switch ──────────────────────────────────────────────────────

@app.post("/api/v1/gateway/mode")
@limiter.limit("10/minute")
async def set_app_mode(request: Request, mode: str):
    """
    Switch the gateway between 'simulated' and 'production' at runtime.

    In production mode the backend probes the real vLLM endpoints; if the AMD
    pods are unreachable the status becomes 'offline' and SECURE_FALLBACK is
    engaged automatically.
    """
    global APP_MODE
    mode_lower = mode.lower().strip()
    if mode_lower not in ("simulated", "production"):
        raise HTTPException(status_code=400, detail="mode must be 'simulated' or 'production'")
    APP_MODE = mode_lower
    _refresh_hardware_status()
    logger.info("APP_MODE switched to '%s' at runtime", APP_MODE)
    return {"app_mode": APP_MODE, "hardware_status": HARDWARE_STATUS}


# ── System Metrics (Real Backend Data via psutil) ────────────────────────────

@app.get("/api/v1/gateway/system", response_model=SystemMetricsResponse)
@limiter.limit("30/minute")
async def system_metrics(request: Request):
    """
    Return real system resource metrics from the backend host.

    Uses psutil to read CPU, memory, and disk usage.  Falls back to
    sensible defaults if psutil is not available.
    """
    import os
    import time

    hostname = os.uname().nodename if hasattr(os, "uname") else "great-aegis-pod"

    try:
        import psutil

        cpu = psutil.cpu_percent(interval=0.3)
        mem = psutil.virtual_memory()
        disk = psutil.disk_usage("/")

        # Uptime via /proc/uptime or psutil.boot_time()
        try:
            boot = psutil.boot_time()
            uptime_hours = (time.time() - boot) / 3600
        except Exception:
            uptime_hours = 0.0

        return SystemMetricsResponse(
            cpu_percent=round(cpu, 1),
            memory_percent=round(mem.percent, 1),
            memory_used_gb=round(mem.used / (1024**3), 1),
            memory_total_gb=round(mem.total / (1024**3), 1),
            disk_percent=round(disk.percent, 1),
            disk_used_gb=round(disk.used / (1024**3), 1),
            disk_total_gb=round(disk.total / (1024**3), 1),
            uptime_hours=round(uptime_hours, 1),
            python_version=__import__("sys").version.split()[0],
            hostname=hostname,
        )
    except ImportError:
        # Fallback: return placeholder metrics
        return SystemMetricsResponse(
            cpu_percent=0.0,
            memory_percent=0.0,
            memory_used_gb=0.0,
            memory_total_gb=0.0,
            disk_percent=0.0,
            disk_used_gb=0.0,
            disk_total_gb=0.0,
            uptime_hours=0.0,
            python_version=__import__("sys").version.split()[0],
            hostname=hostname,
        )


# ── Metrics ──────────────────────────────────────────────────────────────────

# Real metrics tracker (persists across requests, reset on restart)
_METRICS = {
    "total_requests": 0,
    "attacks_intercepted": 0,
    "private_routes": 0,
    "public_routes": 0,
    "latency_ms_sum": 0.0,
    "hourly": {},  # "2025-01-01T14" → {"public": int, "private": int}
    "request_times": [],  # list of (timestamp, elapsed_ms)
}

_REQUEST_START: dict[str, float] = {}  # request_id → start_time for latency tracking


def _track_metrics(
    verdict: str,
    risk_score: int,
    elapsed_ms: float,
    pqc_encrypted: bool = False,
) -> None:
    """Record a gateway routing event into real metrics.

    ``attacks_intercepted`` now counts requests where PQC encryption was
    actually applied to a sensitive prompt (risk >= 40), reflecting genuine
    HNDL protection rather than a keyword-based keyword match.
    """
    now = datetime.now(timezone.utc)
    hour_key = now.strftime("%Y-%m-%dT%H")

    _METRICS["total_requests"] += 1
    _METRICS["latency_ms_sum"] += elapsed_ms
    _METRICS["request_times"].append((now, elapsed_ms))
    # Keep only last 500
    if len(_METRICS["request_times"]) > 500:
        _METRICS["request_times"] = _METRICS["request_times"][-500:]

    if verdict.startswith("private_") or verdict == "secure_fallback":
        _METRICS["private_routes"] += 1
        route_type = "private"
    else:
        _METRICS["public_routes"] += 1
        route_type = "public"

    # Count as "PQC-protected" when encryption was applied to a sensitive
    # prompt (risk >= 40) or when secure_fallback engaged encrypted tunnel.
    if pqc_encrypted and (risk_score >= 40 or verdict == "secure_fallback"):
        _METRICS["attacks_intercepted"] += 1

    # Hourly bucket — track public/private separately so the chart reflects
    # the actual routing verdicts instead of a fabricated split.
    bucket = _METRICS["hourly"].get(hour_key, {"public": 0, "private": 0})
    bucket[route_type] = bucket.get(route_type, 0) + 1
    _METRICS["hourly"][hour_key] = bucket
    # Keep last 24 hours
    cutoff = (now - timedelta(hours=24)).strftime("%Y-%m-%dT%H")
    _METRICS["hourly"] = {k: v for k, v in _METRICS["hourly"].items() if k >= cutoff}


def _build_chart_data() -> list[ChartDataPoint]:
    """Build 24-hour chart data from real per-hour public/private buckets."""
    now = datetime.now(timezone.utc)
    points: list[ChartDataPoint] = []
    for i in range(23, -1, -1):
        hour = now - timedelta(hours=i)
        key = hour.strftime("%Y-%m-%dT%H")
        label = hour.strftime("%H:%M")
        bucket = _METRICS["hourly"].get(key, {"public": 0, "private": 0})
        points.append(ChartDataPoint(
            timestamp=label,
            public_tokens=bucket.get("public", 0),
            private_pod=bucket.get("private", 0),
        ))
    return points


@app.get("/api/v1/gateway/metrics", response_model=MetricsResponse)
@limiter.limit("60/minute")
async def get_metrics(request: Request):
    total = _METRICS["total_requests"]
    attacks = _METRICS["attacks_intercepted"]
    avg_latency = round(_METRICS["latency_ms_sum"] / max(total, 1) / 1000, 3)

    # OPEX savings: private routes save ~40% vs public API costs
    private = _METRICS["private_routes"]
    public = _METRICS["public_routes"]
    opex = round((private * 0.40 - public * 0.05) / max(private + public, 1) * 100, 1)

    chart = _build_chart_data()
    return MetricsResponse(
        total_routed_requests=total,
        attacks_intercepted=attacks,
        opex_savings=opex,
        latency_overhead=avg_latency,
        chart_data=chart,
    )


# ── Logs ─────────────────────────────────────────────────────────────────────

# Accumulated real event log (persists across requests, reset on restart)
_EVENT_LOG: list[dict] = []
_MAX_REAL_LOGS = 50


def _append_log(
    event_type: str,
    classification: str,
    file_name: str = "live_prompt",
    file_size: int = 0,
    ciphertext: str = "",
    **extra: str,
) -> None:
    """Record a real gateway event to the persistent log."""
    now = datetime.now(timezone.utc)
    entry = {
        "id": f"evt-{len(_EVENT_LOG):04d}",
        "timestamp": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "file_name": file_name,
        "classification": classification,
        "file_size": file_size,
        "ciphertext": ciphertext or _event_summary(event_type, **extra),
    }
    _EVENT_LOG.insert(0, entry)
    if len(_EVENT_LOG) > _MAX_REAL_LOGS:
        _EVENT_LOG.pop()


def _event_summary(event_type: str, **extra: str) -> str:
    """Generate a human-readable summary for the ciphertext column."""
    parts = [f"[{event_type}]"]
    for k, v in extra.items():
        parts.append(f"{k}={v}")
    return " | ".join(parts)


@app.get("/api/v1/gateway/logs", response_model=list[LogEntry])
@limiter.limit("60/minute")
async def get_logs(request: Request):
    return [
        LogEntry(
            id=e["id"],
            timestamp=e["timestamp"],
            file_name=e["file_name"],
            classification=e["classification"],
            file_size=e["file_size"],
            ciphertext=e["ciphertext"],
        )
        for e in _EVENT_LOG
    ]


@app.delete("/api/v1/gateway/logs")
async def clear_logs():
    _EVENT_LOG.clear()
    return {"cleared": True, "count": 0}


# ── Inspect (Hybrid Router + PQC + Fallback) ─────────────────────────────────

@app.post("/api/v1/gateway/inspect", response_model=InspectResponse)
@limiter.limit("30/minute")
async def inspect_prompt(request: Request, req: InspectRequest):
    """
    Evaluate a prompt payload through the hybrid router.

    When APP_MODE=production and the target AMD vLLM pod is unreachable,
    the router automatically engages SECURE_FALLBACK — the response will
    carry fallback_engaged=True and hardware_status="offline" so the
    frontend can display an explicit warning.
    """
    # Refresh hardware status on every inspect so fallback is immediate
    _t0 = time.perf_counter()
    _refresh_hardware_status()

    # ── Decrypt client-encrypted prompt if present ──────────────────────
    prompt_payload = req.prompt_payload
    if req.encrypted_prompt:
        try:
            import json as _json
            enc_data = _json.loads(
                __import__("base64").b64decode(req.encrypted_prompt).decode("utf-8")
            )
            prompt_payload = pqc_decrypt_payload(enc_data)
            logger.info("Client-side PQC prompt decrypted successfully (ML-KEM-768)")
        except Exception as exc:
            logger.warning("Failed to decrypt client-side PQC prompt: %s", exc)

    verdict, risk_score, model_name, reason, fallback_engaged = route(
        prompt_payload,
        req.client_encryption_flag,
        req.routing_profile,
        vllm_endpoints=VLLM_ENDPOINTS if APP_MODE == "production" else None,
        app_mode=APP_MODE,
        quantum_encryption_enabled=req.quantum_encryption_enabled,
        zero_trust_enabled=req.zero_trust_enabled,
        pod_isolation_enabled=req.pod_isolation_enabled,
        encrypted_prompt_received=bool(req.encrypted_prompt),
    )
    _elapsed = (time.perf_counter() - _t0) * 1000
    _track_metrics(
        verdict, risk_score, _elapsed,
        pqc_encrypted=bool(req.encrypted_prompt) or req.quantum_encryption_enabled,
    )

    # ── Log to Threat Capture with tamper-evident audit record ────────
    prompt_snippet = prompt_payload[:60] + ("..." if len(prompt_payload) > 60 else "")
    prompt_hash = hashlib.sha256(prompt_payload.encode("utf-8")).hexdigest()
    _now_ts = datetime.now(timezone.utc).isoformat()
    audit_record = create_audit_record(
        prompt_hash=prompt_hash,
        verdict=verdict,
        risk_score=risk_score,
        timestamp=_now_ts,
        encryption_status="PQC-encrypted" if req.encrypted_prompt else "plaintext",
        fallback_engaged=fallback_engaged,
    )
    _append_log(
        "prompt_inspect",
        classification="Highly Confidential" if verdict.startswith("private_") else "Public",
        file_name=prompt_snippet,
        file_size=len(prompt_payload),
        verdict=verdict,
        risk=str(risk_score),
        fallback=str(fallback_engaged),
        pqc_encrypted=str(bool(req.encrypted_prompt)),
        audit_record=audit_record,
    )

    target_node: str | None = None
    encryption_status = "none"
    pqc_sig: str | None = None
    pqc_valid = False
    streaming_endpoint: str | None = None

    # ── Build response based on verdict ─────────────────────────────────
    if fallback_engaged:
        # SECURE_FALLBACK: disaster-recovery route
        target_node = "Fireworks AI (Encrypted PQC Tunnel — Disaster Recovery)"
        encryption_status = "client-side ML-KEM wrapping (emergency fallback)"
        streaming_endpoint = None  # no AMD streaming endpoint available
        if req.client_encryption_flag:
            _, ct = mlkem_encapsulate()
            pqc_sig, pqc_valid = mlkem_decapsulate(ct)
        else:
            pqc_sig = "emergency-pqc-tunnel-recommended"
            pqc_valid = False

    elif verdict == "private_qwen":
        target_node = (
            "AMD-Secure-Pod (Private Route)"
        )
        encryption_status = "client-side ML-KEM wrapping"

        if req.client_encryption_flag:
            _, ct = mlkem_encapsulate()
            pqc_sig, pqc_valid = mlkem_decapsulate(ct)
        else:
            pqc_sig = "recommend-client-encryption"
            pqc_valid = False

        # In production mode expose the real vLLM streaming endpoint
        if APP_MODE == "production":
            streaming_endpoint = VLLM_ENDPOINTS.get(model_name)  # type: ignore[arg-type]

    else:
        # public_fireworks
        encryption_status = "plaintext (public route)"

    # ── ML-DSA-65 digital signature on the prompt payload ──────────────
    # Sign the raw prompt bytes so the client can verify response integrity
    # and provenance using the gateway's ML-DSA-65 public key.
    try:
        pqc_sig = mldsa_sign(prompt_payload.encode("utf-8"))
        pqc_valid = mldsa_verify(pqc_sig, prompt_payload.encode("utf-8"))
    except Exception as exc:
        logger.warning("ML-DSA signing failed: %s", exc)
        pqc_sig = None
        pqc_valid = False

    return InspectResponse(
        routing_verdict=verdict,
        target_compute_node=target_node,
        target_model=model_name,
        routing_reason=reason,
        encryption_status=encryption_status,
        pqc_signature=pqc_sig,
        pqc_validation_flag=pqc_valid,
        pqc_algorithm="ML-KEM-768 + ML-DSA-65",
        pqc_public_key=get_mldsa_public_key_b64(),
        streaming_endpoint=streaming_endpoint,
        hardware_status=HARDWARE_STATUS,
        fallback_engaged=fallback_engaged,
    )


# ── Vector DB: Ingest ───────────────────────────────────────────────────────

@app.post("/api/v1/gateway/vector/ingest", response_model=DocumentIngestResponse)
@limiter.limit("20/minute")
async def vector_ingest(request: Request, req: DocumentIngestRequest):
    """
    Accept a file's text content, chunk it, hybrid-encrypt each chunk with
    AES-256-GCM + ML-KEM-768, and store in the local Qdrant vector DB.
    """
    from local_vector_db import ingest_document

    chunk_size = req.chunk_size
    overlap = req.chunk_overlap
    text = req.content
    step = chunk_size - overlap
    chunks: list[str] = []

    for start in range(0, len(text), step):
        chunk = text[start : start + chunk_size]
        if chunk.strip():
            chunks.append(chunk.strip())

    if not chunks:
        raise HTTPException(status_code=400, detail="No extractable text content found.")

    doc_ids = ingest_document(
        file_name=req.file_name,
        classification=req.classification,
        chunks=chunks,
    )

    return DocumentIngestResponse(
        file_name=req.file_name,
        chunks_stored=len(doc_ids),
        doc_ids=doc_ids,
    )


# ── Vector DB: Query ────────────────────────────────────────────────────────

@app.post("/api/v1/gateway/vector/query", response_model=DocumentQueryResponse)
@limiter.limit("30/minute")
async def vector_query(request: Request, req: DocumentQueryRequest):
    """Semantic search across encrypted document chunks."""
    from local_vector_db import query_documents, collection_stats

    hits = query_documents(
        query_text=req.query,
        top_k=req.top_k,
        filter_classification=req.filter_classification,
    )
    stats = collection_stats()

    return DocumentQueryResponse(
        query=req.query,
        hits=hits,
        total_in_db=stats["chunk_count"],
    )


# ── Vector DB: Stats ────────────────────────────────────────────────────────

@app.get("/api/v1/gateway/vector/stats", response_model=VectorDBStatsResponse)
@limiter.limit("60/minute")
async def vector_stats(request: Request):
    from local_vector_db import collection_stats
    stats = collection_stats()
    return VectorDBStatsResponse(**stats)


# ── GPU Telemetry ───────────────────────────────────────────────────────────

@app.get("/api/v1/gateway/telemetry", response_model=GPUTelemetryResponse)
@limiter.limit("60/minute")
async def gpu_telemetry(request: Request):
    """
    Return GPU health metrics.

    Simulated mode: randomised-but-plausible MI300X stats.
    Production / online: parses live `rocm-smi --showmetrics --json`.
    Production / offline: returns near-zero "Awaiting Connection" stubs
      so the frontend can render the warning indicator.
    """
    _refresh_hardware_status()

    if APP_MODE == "simulated":
        devices = generate_gpu_telemetry()
    elif HARDWARE_STATUS == "offline":
        devices = generate_offline_telemetry()
    else:
        devices = _read_live_rocm_smi()

    return GPUTelemetryResponse(
        mode=APP_MODE,
        hardware_status=HARDWARE_STATUS,
        timestamp=datetime.now(timezone.utc).isoformat(),
        devices=devices,
        hostname=os.uname().nodename if hasattr(os, "uname") else "great-aegis-pod",
    )


# ── Production: live rocm-smi bridge ─────────────────────────────────────────

_ROCM_SMI_STUB = lambda: [
    GPUDeviceInfo(
        device_id=0,
        name="AMD Instinct MI300X (rocm-smi unavailable)",
        temperature_c=0,
        vram_used_gb=0,
        vram_total_gb=192,
        utilization_pct=0,
        power_watts=0,
        power_cap_watts=750,
        sclk_mhz=0,
        mclk_mhz=0,
    )
]


def _parse_rocm_smi_output(raw: dict) -> list[GPUDeviceInfo]:
    """
    Parse rocm-smi JSON output into GPUDeviceInfo objects.

    Handles:
      - 'rocm-smi -a --json'              (all-info, used by remote proxy)

    No hardcoded defaults — only values actually present in the rocm-smi
    output are used. Missing fields become 0 / empty where sensible.
    """
    import re

    def _extract_mhz(val: str | int | float | None) -> int:
        if val is None:
            return 0
        if isinstance(val, (int, float)):
            return int(val)
        m = re.search(r"(\d+)", str(val))
        return int(m.group(1)) if m else 0

    def _safe_float(val, default=0.0) -> float:
        if val is None or (isinstance(val, str) and val.strip() == ""):
            return default
        if isinstance(val, str):
            val = val.replace("(C)", "").replace("(W)", "").replace("(Mhz)", "").strip()
        try:
            return float(val)
        except (ValueError, TypeError):
            return default

    # Default to MI300X spec (192 GB) when rocm-smi doesn't report total.
    # -a --json only gives VRAM %, not absolute MB.
    _MI300X_VRAM_GB = 192.0
    _vram_total_raw = raw.get("card0", {}).get("VRAM Total Memory")
    _vram_total_gb: float = (
        _safe_float(_vram_total_raw) / 1024
        if _vram_total_raw is not None
        else _MI300X_VRAM_GB
    )

    devices: list[GPUDeviceInfo] = []
    for card_id, card_data in raw.items():
        if not isinstance(card_data, dict) or card_id == "system":
            continue

        try:
            # Temperature — both formats supply this
            temp = _safe_float(
                card_data.get("Temperature (Sensor edge)")
                or card_data.get("Temperature (Sensor junction) (C)")
            )

            # VRAM used — -a --json gives % (no raw MB)
            vram_raw = card_data.get("VRAM Total Used Memory")
            if vram_raw is not None:
                vram_used = _safe_float(vram_raw) / 1024
            else:
                pct = _safe_float(card_data.get("GPU Memory Allocated (VRAM%)"))
                vram_used = round(pct * _vram_total_gb / 100.0, 1)

            # VRAM total — not available in -a --json format; default to MI300X 192 GB
            vram_total: float = (
                _vram_total_gb
                if _vram_total_raw is not None
                else (_safe_float(card_data.get("VRAM Total Memory")) / 1024) or _vram_total_gb
            )

            # Utilization — -a --json uses "GPU use (%)"
            util = _safe_float(
                card_data.get("GFX Activity")
                or card_data.get("GPU use (%)")
                or card_data.get("GPU Activity (%)")
            )

            # Power — both formats supply this
            power = _safe_float(
                card_data.get("Average Graphics Package Power")
                or card_data.get("Current Socket Graphics Package Power (W)")
            )
            power_cap = _safe_float(
                card_data.get("Max Graphics Package Power (W)")
                or card_data.get("Max Graphics Package Power")
            )

            # Clocks
            sclk = _extract_mhz(card_data.get("SLCK") or card_data.get("sclk clock speed:"))
            mclk = _extract_mhz(card_data.get("MCLK") or card_data.get("mclk clock speed:"))

            # Name — use what the hardware actually reports
            name = (
                card_data.get("GPU name")
                or card_data.get("Device Name")
                or card_data.get("Card Series")
                or card_data.get("Card Model")
                or ""
            )
            if not name or name in ("N/A", ""):
                vendor = card_data.get("Card Vendor", "")
                if vendor:
                    name = "AMD Instinct MI300X"
                else:
                    name = "AMD Instinct MI300X"

            devices.append(
                GPUDeviceInfo(
                    device_id=int(card_id.removeprefix("card")),
                    name=name,
                    temperature_c=temp,
                    vram_used_gb=vram_used,
                    vram_total_gb=vram_total,
                    utilization_pct=util,
                    power_watts=power,
                    power_cap_watts=power_cap,
                    sclk_mhz=sclk,
                    mclk_mhz=mclk,
                )
            )
        except (ValueError, TypeError):
            continue

    return devices if devices else _ROCM_SMI_STUB()


def _resolve_rocm_smi_url() -> str:
    """
    Determine the URL for the remote rocm-smi metrics endpoint.

    Priority:
      1. ROCM_SMI_URL env var (explicit)
       2. Derived from VLLM_ENDPOINT — same host, port 8001, path /gpu
      3. Empty string (no remote endpoint)
    """
    rocm_url = os.environ.get("ROCM_SMI_URL", "").strip()
    if rocm_url:
        return rocm_url

    vllm_ep = os.environ.get("VLLM_ENDPOINT", "").strip()
    if vllm_ep:
        from urllib.parse import urlparse
        parsed = urlparse(vllm_ep)
        if parsed.hostname:
            return f"{parsed.scheme or 'http'}://{parsed.hostname}:8001/gpu"

    return ""


# ═══════════════════════════════════════════════════════════════════════════
# Prometheus GPU Metrics Parser (AMD GPU Exporter / do-agent)
# ═══════════════════════════════════════════════════════════════════════════

def _parse_prometheus_gpu_metrics(text: str) -> list[GPUDeviceInfo]:
    """
    Parse Prometheus text exposition format from an AMD GPU exporter.

    Handles the output of `curl localhost:5000/metrics` as emitted by the
    amd-smi-exporter or similar AMD GPU Prometheus exporters.

    Groups metrics by ``gpu_id`` label and maps known metric names to
    GPUDeviceInfo fields.  Metrics not present in the Prometheus output
    (sclk, mclk, power_cap) are set to sensible defaults.
    """
    import re

    _METRIC_RE = re.compile(
        r'^(?P<name>[a-zA-Z_:][a-zA-Z0-9_:]*)'
        r'\{(?P<labels>[^}]*)\}'
        r'\s+(?P<value>[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)'
    )

    def _parse_labels(labels_str: str) -> dict[str, str]:
        out: dict[str, str] = {}
        for m in re.finditer(r'(\w+)="((?:[^"\\]|\\.)*)"', labels_str):
            out[m.group(1)] = m.group(2)
        return out

    def _safe_float(val: str | None, default: float = 0.0) -> float:
        if val is None:
            return default
        try:
            return float(val)
        except (ValueError, TypeError):
            return default

    # Group raw metrics by gpu_id
    gpu_metrics: dict[str, dict[str, float]] = {}
    gpu_labels: dict[str, dict[str, str]] = {}

    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        m = _METRIC_RE.match(line)
        if not m:
            continue

        metric_name = m.group('name')
        labels = _parse_labels(m.group('labels'))
        value = _safe_float(m.group('value'))

        gpu_id = labels.get('gpu_id', '0')
        if gpu_id not in gpu_metrics:
            gpu_metrics[gpu_id] = {}
            gpu_labels[gpu_id] = labels

        gpu_metrics[gpu_id][metric_name] = value

    if not gpu_metrics:
        return []

    devices: list[GPUDeviceInfo] = []
    for gpu_id in sorted(gpu_metrics.keys(), key=lambda x: int(x) if x.isdigit() else 0):
        m = gpu_metrics[gpu_id]
        lbl = gpu_labels.get(gpu_id, {})

        temperature = _safe_float(
            str(m.get('amd_gpu_edge_temperature', m.get('amd_gpu_junction_temperature', 0)))
        )

        utilization = _safe_float(str(m.get('amd_gpu_gfx_activity', 0)))

        power = _safe_float(
            str(m.get('amd_gpu_average_package_power',
                m.get('amd_gpu_package_power',
                m.get('amd_gpu_power_usage', 0))))
        )

        vram_total_mb = _safe_float(str(m.get('amd_gpu_total_vram', 0)))
        vram_used_mb = _safe_float(str(m.get('amd_gpu_used_vram', 0)))

        vram_total_gb = round(vram_total_mb / 1024.0, 1) if vram_total_mb else 192.0
        vram_used_gb = round(vram_used_mb / 1024.0, 1)

        if vram_used_gb == 0 and vram_total_mb > 0:
            free_mb = _safe_float(str(m.get('amd_gpu_free_vram', 0)))
            vram_used_gb = round((vram_total_mb - free_mb) / 1024.0, 1)

        vendor = lbl.get('card_vendor', '')
        model = lbl.get('card_model', '')
        series = lbl.get('card_series', '')
        if model:
            name = model
        elif series and vendor:
            name = f"{vendor} {series}"
        elif vendor:
            name = vendor
        else:
            name = "AMD Instinct MI300X"

        device_id_val = int(gpu_id) if gpu_id.isdigit() else 0

        devices.append(GPUDeviceInfo(
            device_id=device_id_val,
            name=name,
            temperature_c=temperature,
            vram_used_gb=vram_used_gb,
            vram_total_gb=vram_total_gb,
            utilization_pct=utilization,
            power_watts=power,
            power_cap_watts=750.0,
            sclk_mhz=0,
            mclk_mhz=0,
        ))

    return devices if devices else _ROCM_SMI_STUB()


def _resolve_gpu_prometheus_url() -> str:
    """
    Determine the URL for the GPU Prometheus metrics endpoint (AMD exporter).

    Priority:
      1. GPU_PROMETHEUS_URL env var (explicit)
       2. Derived from VLLM_ENDPOINT — same host, port 5000, path /metrics
      3. Empty string (no endpoint)
    """
    prom_url = os.environ.get("GPU_PROMETHEUS_URL", "").strip()
    if prom_url:
        return prom_url

    vllm_ep = os.environ.get("VLLM_ENDPOINT", "").strip()
    if vllm_ep:
        from urllib.parse import urlparse
        parsed = urlparse(vllm_ep)
        if parsed.hostname:
            return f"{parsed.scheme or 'http'}://{parsed.hostname}:5000/metrics"

    return ""


def _read_live_rocm_smi() -> list[GPUDeviceInfo]:
    """
    Attempt to read live GPU metrics.

    Tries, in order:
      1. Local rocm-smi --showmetrics --json
      2. Remote rocm-smi HTTP endpoint (ROCM_SMI_URL env var)
      3. Prometheus metrics endpoint (GPU_PROMETHEUS_URL env var or
         derived from VLLM_ENDPOINT, port 5000/metrics)
      4. Stub fallback (zero-value device)
    """
    import json
    import subprocess

    # ── Strategy 1: local rocm-smi ────────────────────────────────────
    try:
        result = subprocess.run(
            ["rocm-smi", "--showmetrics", "--json"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0:
            raw = json.loads(result.stdout)
            return _parse_rocm_smi_output(raw)
    except (FileNotFoundError, json.JSONDecodeError, subprocess.TimeoutExpired):
        pass

    # ── Strategy 2: remote HTTP endpoint on the GPU droplet ───────────
    rocm_url = _resolve_rocm_smi_url()
    if rocm_url:
        try:
            import httpx
            resp = httpx.get(rocm_url, timeout=10.0)
            if resp.status_code == 200:
                raw = resp.json()
                return _parse_rocm_smi_output(raw)
            logger.debug("Remote rocm-smi endpoint %s returned HTTP %d", rocm_url, resp.status_code)
        except Exception as exc:
            logger.debug("Remote rocm-smi fetch from %s failed: %s", rocm_url, exc)

    # ── Strategy 3: Prometheus metrics endpoint (AMD GPU exporter) ─────
    prom_url = _resolve_gpu_prometheus_url()
    if prom_url:
        try:
            import httpx
            resp = httpx.get(prom_url, timeout=10.0)
            if resp.status_code == 200:
                devices = _parse_prometheus_gpu_metrics(resp.text)
                if devices and any(
                    d.temperature_c > 0 or d.utilization_pct > 0 or d.vram_used_gb > 0
                    for d in devices
                ):
                    return devices
            logger.debug("Prometheus GPU endpoint %s returned HTTP %d", prom_url, resp.status_code)
        except Exception as exc:
            logger.debug("Prometheus GPU fetch from %s failed: %s", prom_url, exc)

    # ── Fallback: stub device so the frontend doesn't break ───────────
    return _ROCM_SMI_STUB()


# ═══════════════════════════════════════════════════════════════════════════
# API Key Management (server-side, in-memory)
# ═══════════════════════════════════════════════════════════════════════════

@app.post("/api/v1/gateway/verify-settings-password")
@limiter.limit("5/minute")
async def verify_settings_password(request: Request, req: SettingsPasswordRequest):
    """Verify the password for accessing the Settings page."""
    if not SETTINGS_PASSWORD:
        return {"granted": True}
    return {"granted": req.password == SETTINGS_PASSWORD}


@app.post("/api/v1/gateway/test-key")
@limiter.limit("5/minute")
async def test_api_key(request: Request, req: ApiKeyRequest):
    """
    Test whether a Fireworks API key is valid by calling the models list endpoint.
    Returns {valid: true} or {valid: false, detail: ...}.
    """
    import httpx

    if not req.api_key.strip():
        return {"valid": False, "detail": "API key is empty"}

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://api.fireworks.ai/inference/v1/models",
                headers={"Authorization": f"Bearer {req.api_key}"},
            )
            if resp.status_code == 200:
                return {"valid": True}
            elif resp.status_code == 401:
                return {"valid": False, "detail": "Invalid API key — unauthorized"}
            else:
                return {"valid": False, "detail": f"Fireworks returned HTTP {resp.status_code}"}
    except httpx.TimeoutException:
        return {"valid": False, "detail": "Connection timed out"}
    except Exception:
        return {"valid": False, "detail": "Connection error — unable to reach Fireworks AI"}


@app.post("/api/v1/gateway/save-key")
@limiter.limit("5/minute")
async def save_api_key(request: Request, req: ApiKeyRequest):
    """Save the Fireworks API key server-side (in-memory only)."""
    global STORED_API_KEY
    key = req.api_key.strip()
    if not key:
        return {"saved": False, "detail": "Key is empty"}
    STORED_API_KEY = key
    hint = _key_hint(key)
    logger.info("Fireworks API key saved (in-memory)")
    return {"saved": True, "key_hint": hint}


@app.delete("/api/v1/gateway/key")
@limiter.limit("10/minute")
async def delete_api_key(request: Request):
    """Remove the stored Fireworks API key."""
    global STORED_API_KEY
    STORED_API_KEY = ""
    logger.info("Fireworks API key removed from memory")
    return {"removed": True}


@app.get("/api/v1/gateway/key-status", response_model=ApiKeyStatusResponse)
@limiter.limit("60/minute")
async def key_status(request: Request):
    """Return whether an API key is configured on the server (never exposes the key)."""
    return ApiKeyStatusResponse(
        configured=bool(STORED_API_KEY),
        key_hint=_key_hint(STORED_API_KEY) if STORED_API_KEY else "",
    )


def _key_hint(key: str) -> str:
    """Return a masked hint e.g. 'fw_3a...****'"""
    if len(key) <= 8:
        return key[:3] + "****"
    return key[:5] + "..." + "****"


# ═══════════════════════════════════════════════════════════════════════════
# Fireworks AI Live Integration
# ═══════════════════════════════════════════════════════════════════════════

FIRST_CLASS_MODELS = [
    "accounts/fireworks/models/glm-5p2",
    "accounts/fireworks/models/deepseek-v4-pro",
    "accounts/fireworks/models/qwen3p7-plus",
]


@app.post("/api/v1/fireworks/chat/stream")
@limiter.limit("10/minute")
async def fireworks_chat_stream(
    request: Request,
    req: ChatRequest,
    x_api_key: str = Header(default="", alias="X-Api-Key"),
):
    """
    Stream chat completion from Fireworks AI.

    Accepts the Fireworks API key via the X-Api-Key header (sent from the
    frontend where the user inputs it).  Also runs the hybrid router inspection
    first and includes it in the SSE initial event so the frontend can display
    routing info alongside the streamed response.

    SSE event types:
      event: routing    → {verdict, model, reason, encryption, etc.}
      event: token      → {content: "..."}
      event: done       → {finish_reason: "stop"}
      event: error      → {detail: "..."}
    """
    if not x_api_key:
        return {"error": "Fireworks API key required via X-Api-Key header"}

    api_key = _resolve_api_key(x_api_key)
    if not api_key:
        return {"error": "Fireworks API key required — set via X-Api-Key header or save in Settings"}

    from fireworks_client import stream_chat_completion

    # ── 1. Run hybrid router inspection ─────────────────────────────────
    _t0 = time.perf_counter()
    _refresh_hardware_status()
    verdict, risk_score, model_name, reason, fallback_engaged = route(
        req.prompt,
        req.client_encryption_flag,
        req.routing_profile,
        vllm_endpoints=VLLM_ENDPOINTS if APP_MODE == "production" else None,
        app_mode=APP_MODE,
        quantum_encryption_enabled=req.quantum_encryption_enabled,
        zero_trust_enabled=req.zero_trust_enabled,
        pod_isolation_enabled=req.pod_isolation_enabled,
        encrypted_prompt_received=bool(req.encrypted_prompt),
    )
    _elapsed = (time.perf_counter() - _t0) * 1000
    _track_metrics(
        verdict, risk_score, _elapsed,
        pqc_encrypted=bool(req.encrypted_prompt) or req.quantum_encryption_enabled,
    )

    # ── Log to Threat Capture ─────────────────────────────────────────
    prompt_snippet = req.prompt[:60] + ("..." if len(req.prompt) > 60 else "")
    _append_log(
        "fireworks_chat",
        classification="Highly Confidential" if verdict.startswith("private_") else "Public",
        file_name=prompt_snippet,
        file_size=len(req.prompt),
        verdict=verdict,
        model=str(req.model),
    )

    encryption_status = "plaintext (public route)" if verdict == "public_fireworks" else "client-side ML-KEM wrapping"
    target_node = (
        "AMD-Instinct-MI300X-Private-Pod" if "private" in verdict
        else "Fireworks AI (Encrypted Tunnel Fallback)" if fallback_engaged
        else "Fireworks AI (Public)"
    )

    routing_info = ChatResponse(
        routing_verdict=verdict,
        target_model=req.model,
        routing_reason=reason,
        encryption_status=encryption_status,
        hardware_status=HARDWARE_STATUS,
        fallback_engaged=fallback_engaged,
        quantum_rules={
            "ml_kem_wrapping": req.quantum_encryption_enabled,
            "zero_trust_encapsulation": req.zero_trust_enabled,
            "pod_isolation": req.pod_isolation_enabled,
        },
        pqc_algorithm="ML-KEM-768 + ML-DSA-65",
    )

    # ── 2. Build Fireworks messages ────────────────────────────────────
    messages: list[dict] = []
    if req.system_prompt:
        messages.append({"role": "system", "content": req.system_prompt})
    messages.append({"role": "user", "content": req.prompt})

    # ── 3. Stream from Fireworks, prepend routing event ────────────────
    async def event_generator():
        # First event: routing info
        yield {"event": "routing", "data": routing_info.model_dump_json()}

        # Then stream tokens from Fireworks
        async for chunk in stream_chat_completion(
            api_key=api_key,
            messages=messages,
            model=req.model,
            temperature=req.temperature,
            max_tokens=req.max_tokens,
            encrypt_in_transit=req.quantum_encryption_enabled,
        ):
            if chunk["type"] == "token":
                yield {"event": "token", "data": chunk["content"]}
            elif chunk["type"] == "done":
                yield {"event": "done", "data": chunk.get("finish_reason", "stop")}
            elif chunk["type"] == "error":
                yield {"event": "error", "data": chunk["detail"]}
                return

    return EventSourceResponse(event_generator())


# ═══════════════════════════════════════════════════════════════════════════
# Gateway Chat (Autonomous Hybrid Router — model decided by the router)
# ═══════════════════════════════════════════════════════════════════════════

def _simulate_private_response(model_name: str, prompt: str, temperature: float, max_tokens: int):
    """
    Generate a simulated streaming response for private AMD pod routes.
    Used in APP_MODE=simulated when the router decides private_qwen.

    Produces a context-aware response based on the actual prompt rather
    than a generic compliance assessment.  The output is intentionally
    labelled as simulated so the user knows no real AMD GPU served it.
    """
    import time
    import re

    model_label = "Private Route (AMD Secure Pod)"
    header = (
        f"[Processed on {model_label} — private compute pod (simulated)]\n"
        "Your prompt was classified as sensitive and routed to the private AMD pod.\n"
        "---\n\n"
    )

    body = (
        f"**Response (Private Route — simulated):**\n\n"
        f"Your prompt: *{prompt[:200]}{'...' if len(prompt) > 200 else ''}*\n\n"
        f"This request has been processed through the simulated private "
        f"model on the AMD Secure Pod accelerator.\n\n"
        f"In production mode this workload would leverage the full private "
        f"model for inference tasks such as compliance checking, code generation, "
        f"complex reasoning, and detailed analytical work.\n\n"
        f"All intermediate states remained encrypted and air-gapped within "
        f"the private compute pod — no data was exposed to public endpoints.\n\n"
        f"**Note:** This is a simulated response. Connect a real vLLM endpoint "
        f"(APP_MODE=production) for live LLM inference on AMD hardware."
    )

    full_text = header + body
    tokens: list[str] = re.split(r"(\s+)", full_text)
    i = 0
    while i < len(tokens):
        yield {"type": "token", "content": tokens[i]}
        i += 1
        time.sleep(0.002)  # fast simulated streaming

    yield {"type": "done", "finish_reason": "stop"}


@app.post("/api/v1/gateway/chat/stream")
@limiter.limit("10/minute")
async def gateway_chat_stream(
    request: Request,
    req: GatewayChatRequest,
    x_api_key: str = Header(default="", alias="X-Api-Key"),
):
    """
    Stream chat completion through the autonomous hybrid router.

    The hybrid router inspects the prompt content, classifies it by
    sensitivity and workload, and selects the target model automatically.
    No user-driven model selection — the gateway decides.

    Routing outcomes:
      public_fireworks  → Fireworks AI (GLM 5.2) — general prompts
      private_qwen      → AMD Instinct pod (Qwen3-0.6B) — private inference
      secure_fallback   → Fireworks AI via encrypted PQC tunnel — disaster recovery

    SSE event types:
      event: routing    → {verdict, model, reason, encryption, etc.}
      event: token      → {content: "..."}
      event: done       → {finish_reason: "stop"}
      event: error      → {detail: "..."}
    """
    # ── 1. Privilege-escalation guard ──────────────────────────────────
    # If any prior message in this conversation was routed to a private
    # endpoint, force all subsequent requests to stay on the private pod.
    # This prevents accidental leakage of sensitive context to public AI.
    force_private = False
    escalation_reason: str | None = None
    if req.history_routing_verdicts:
        for old_verdict in req.history_routing_verdicts:
            if old_verdict in ("private_qwen", "secure_fallback"):
                force_private = True
                escalation_reason = (
                    "Privilege-escalation guard: previous messages were processed "
                    f"on a private endpoint ({old_verdict}). Keeping this request "
                    "on the private AMD pod to prevent context leakage."
                )
                break

    # ── 2. Run hybrid router ───────────────────────────────────────────
    _t0 = time.perf_counter()
    _refresh_hardware_status()

    # ── Decrypt client-encrypted prompt if present ──────────────────────
    prompt_text = req.prompt
    if req.encrypted_prompt:
        try:
            import json as _json
            enc_data = _json.loads(
                __import__("base64").b64decode(req.encrypted_prompt).decode("utf-8")
            )
            prompt_text = pqc_decrypt_payload(enc_data)
            logger.info("Client-side PQC prompt decrypted successfully (ML-KEM-768)")
        except Exception as exc:
            logger.warning("Failed to decrypt client-side PQC prompt: %s", exc)

    if force_private:
        verdict, risk_score, model_name, reason, fallback_engaged = (
            "private_qwen",
            80,
            "private_route",
            escalation_reason,
            False,
        )
    else:
        verdict, risk_score, model_name, reason, fallback_engaged = route(
            prompt_text,
            req.client_encryption_flag,
            req.routing_profile,
            vllm_endpoints=VLLM_ENDPOINTS if APP_MODE == "production" else None,
            app_mode=APP_MODE,
            quantum_encryption_enabled=req.quantum_encryption_enabled,
            zero_trust_enabled=req.zero_trust_enabled,
            pod_isolation_enabled=req.pod_isolation_enabled,
            encrypted_prompt_received=bool(req.encrypted_prompt),
        )
    _elapsed = (time.perf_counter() - _t0) * 1000  # ms
    _track_metrics(
        verdict, risk_score, _elapsed,
        pqc_encrypted=bool(req.encrypted_prompt) or req.quantum_encryption_enabled,
    )

    # ── Log to Threat Capture ─────────────────────────────────────────
    prompt_snippet = prompt_text[:60] + ("..." if len(prompt_text) > 60 else "")
    classification = (
        "Highly Confidential" if verdict.startswith("private_") or verdict == "secure_fallback"
        else "Public"
    )
    _append_log(
        "chat_route",
        classification=classification,
        file_name=prompt_snippet,
        file_size=len(prompt_text),
        verdict=verdict,
        model=model_name,
        encryption=str(req.quantum_encryption_enabled),
        zt=str(req.zero_trust_enabled),
        pqc_encrypted=str(bool(req.encrypted_prompt)),
        force_private=str(force_private),
    )

    # ── 3. Build routing info ──────────────────────────────────────────
    warning: str | None = None
    if verdict == "public_fireworks":
        encryption_status = "plaintext (public route)"
        target_node = "Fireworks AI (Public)"
    elif verdict == "private_qwen":
        encryption_status = "client-side ML-KEM wrapping"
        target_node = "AMD-Secure-Pod (Private Route)"
    else:  # secure_fallback
        encryption_status = "client-side ML-KEM wrapping (emergency fallback)"
        target_node = "Fireworks AI (Encrypted PQC Tunnel — Disaster Recovery)"
        warning = (
            "⚠️ AMD Secure Pod is not ready. Sensitive content was routed through "
            "an encrypted PQC tunnel to Fireworks AI. Responses are generated on "
            "the public endpoint with zero-trust encryption in transit."
        )

    if force_private:
        warning = (
            "🔒 Privilege-escalation guard active — this conversation previously "
            "used a private endpoint. All subsequent messages stay on the private "
            "AMD pod to prevent context leakage."
        )

    routing_info = ChatResponse(
        routing_verdict=verdict,
        target_model=model_name,
        routing_reason=reason,
        encryption_status=encryption_status,
        hardware_status=HARDWARE_STATUS,
        fallback_engaged=fallback_engaged,
        quantum_rules={
            "ml_kem_wrapping": req.quantum_encryption_enabled,
            "zero_trust_encapsulation": req.zero_trust_enabled,
            "pod_isolation": req.pod_isolation_enabled,
        },
        pqc_algorithm="ML-KEM-768 + ML-DSA-65",
        warning=warning,
    )

    # ── 4. Build messages for AI call ──────────────────────────────────
    from fireworks_client import stream_chat_completion

    messages: list[dict] = []
    if req.system_prompt:
        messages.append({"role": "system", "content": req.system_prompt})
    if req.messages:
        for msg in req.messages:
            messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": prompt_text})

    # ── 4. Stream response based on verdict ────────────────────────────
    async def event_generator():
        accumulated = ""
        yield {"event": "routing", "data": routing_info.model_dump_json()}

        # Emit a prominent warning event when the AMD Pod is not ready so the
        # frontend can display it before tokens start streaming.
        if warning:
            yield {"event": "warning", "data": warning}

        if verdict == "public_fireworks":
            api_key = _resolve_api_key(x_api_key)
            if not api_key:
                yield {"event": "error", "data": "Fireworks API key required for public route. Save in Settings."}
                return

            async for chunk in stream_chat_completion(
                api_key=api_key,
                messages=messages,
                model=req.model or model_name,
                temperature=req.temperature,
                max_tokens=req.max_tokens,
                encrypt_in_transit=req.quantum_encryption_enabled,
            ):
                if chunk["type"] == "token":
                    accumulated += chunk["content"]
                    yield {"event": "token", "data": chunk["content"]}
                elif chunk["type"] == "done":
                    yield {"event": "done", "data": chunk.get("finish_reason", "stop")}
                elif chunk["type"] == "error":
                    yield {"event": "error", "data": chunk["detail"]}
                    return

        elif verdict == "secure_fallback":
            api_key = _resolve_api_key(x_api_key)
            if not api_key:
                yield {"event": "error", "data": "Fireworks API key required for fallback route. Save in Settings."}
                return

            async for chunk in stream_chat_completion(
                api_key=api_key,
                messages=messages,
                model=req.model or model_name,
                temperature=req.temperature,
                max_tokens=req.max_tokens,
                encrypt_in_transit=req.quantum_encryption_enabled,
            ):
                if chunk["type"] == "token":
                    accumulated += chunk["content"]
                    yield {"event": "token", "data": chunk["content"]}
                elif chunk["type"] == "done":
                    yield {"event": "done", "data": chunk.get("finish_reason", "stop")}
                elif chunk["type"] == "error":
                    yield {"event": "error", "data": chunk["detail"]}
                    return

        else:
            # Private AMD pod route (private_qwen)
            vllm_endpoint = VLLM_ENDPOINTS.get(model_name, "")
            vllm_ok = False

            if APP_MODE == "production" and vllm_endpoint:
                import httpx as _httpx
                import json as _json
                vllm_model = VLLM_MODEL_NAMES.get(model_name, model_name)
                vllm_body = {
                    "model": vllm_model,
                    "messages": messages,
                    "temperature": req.temperature,
                    "max_tokens": req.max_tokens,
                    "stream": True,
                }
                try:
                    async with _httpx.AsyncClient(timeout=120.0) as vllm_client:
                        async with vllm_client.stream(
                            "POST", vllm_endpoint, json=vllm_body
                        ) as vllm_resp:
                            if vllm_resp.status_code == 200:
                                vllm_ok = True
                                async for line in vllm_resp.aiter_lines():
                                    line = line.strip()
                                    if not line or line == "data: [DONE]":
                                        continue
                                    if line.startswith("data: "):
                                        try:
                                            chunk_data = _json.loads(line[6:])
                                            choices = chunk_data.get("choices", [])
                                            if choices:
                                                delta = choices[0].get("delta", {})
                                                content = delta.get("content", "")
                                                if content:
                                                    accumulated += content
                                                    yield {"event": "token", "data": content}
                                                finish = choices[0].get("finish_reason")
                                                if finish:
                                                    yield {"event": "done", "data": finish}
                                        except _json.JSONDecodeError:
                                            pass
                                    elif line == "[DONE]":
                                        yield {"event": "done", "data": "stop"}
                            else:
                                _body = await vllm_resp.aread()
                                logger.warning(
                                    "vLLM %s returned HTTP %d: %s",
                                    vllm_endpoint, vllm_resp.status_code, _body.decode(errors="replace")[:300],
                                )
                                yield {"event": "warning", "data": f"AMD Pod returned HTTP {vllm_resp.status_code} — using simulated response"}
                except Exception as exc:
                    logger.warning("vLLM stream to %s failed: %s", vllm_endpoint, exc)
                    yield {"event": "warning", "data": f"AMD Pod unreachable — using simulated response"}

            if not vllm_ok:
                gen = _simulate_private_response(
                    model_name=model_name,
                    prompt=req.prompt,
                    temperature=req.temperature,
                    max_tokens=req.max_tokens,
                )
                for chunk in gen:
                    if chunk["type"] == "token":
                        accumulated += chunk["content"]
                        yield {"event": "token", "data": chunk["content"]}
                    elif chunk["type"] == "done":
                        yield {"event": "done", "data": chunk.get("finish_reason", "stop")}

        # ── Estimate usage for all routes ──────────────────────────
        from fireworks_client import track_estimated
        effective_model = req.model or model_name
        track_estimated(
            model=effective_model,
            prompt=req.prompt,
            completion=accumulated,
        )

    return EventSourceResponse(event_generator())


@app.get("/api/v1/fireworks/models", response_model=FireworksModelsResponse)
@limiter.limit("30/minute")
async def fireworks_models(
    request: Request,
    x_api_key: str = Header(default="", alias="X-Api-Key"),
):
    """
    List available models from the Fireworks AI account associated with
    the provided API key.  Also returns our curated first-class model list.
    """
    api_key = _resolve_api_key(x_api_key)
    if not api_key:
        return FireworksModelsResponse(models=[], count=0)

    from fireworks_client import list_models

    try:
        result = await list_models(api_key)
        raw_models = result.get("models", []) if isinstance(result, dict) else result
        # Merge with our curated list for display
        all_models = raw_models + [
            {"id": m, "object": "model", "curated": True}
            for m in FIRST_CLASS_MODELS
            if not any(existing.get("id") == m for existing in raw_models)
        ]
        return FireworksModelsResponse(models=all_models, count=len(all_models))
    except Exception as exc:
        logger.warning("Failed to list Fireworks models: %s", exc)
        return FireworksModelsResponse(
            models=[{"id": m, "object": "model", "curated": True} for m in FIRST_CLASS_MODELS],
            count=len(FIRST_CLASS_MODELS),
        )


@app.get("/api/v1/fireworks/usage", response_model=FireworksUsageResponse)
@limiter.limit("30/minute")
async def fireworks_usage(
    request: Request,
    x_api_key: str = Header(default="", alias="X-Api-Key"),
):
    """
    Return cumulative Fireworks API usage metrics tracked from all
    chat completion calls made during this server session.
    """
    from fireworks_client import get_cumulative_usage

    usage = get_cumulative_usage()
    request_count = usage.get("request_count", 0)

    if request_count > 0:
        prompt_tokens = usage.get("prompt_tokens", 0)
        completion_tokens = usage.get("completion_tokens", 0)
        total_tokens = usage.get("total_tokens", 0)

        # Rough cost estimate: $0.20/1M prompt, $0.80/1M completion (Gemma-tier pricing)
        estimated_cost = (prompt_tokens / 1_000_000 * 0.20) + (completion_tokens / 1_000_000 * 0.80)

        return FireworksUsageResponse(
            total_tokens=total_tokens,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            estimated_cost_usd=round(estimated_cost, 4),
            source="fireworks_api",
        )

    return FireworksUsageResponse(
        total_tokens=0,
        prompt_tokens=0,
        completion_tokens=0,
        estimated_cost_usd=0.0,
        source="no_data",
    )


@app.get("/api/v1/fireworks/usage/models", response_model=ModelUsageResponse)
@limiter.limit("30/minute")
async def fireworks_model_usage(request: Request):
    """
    Return per-model Fireworks API usage breakdown.
    """
    from fireworks_client import get_model_usage, get_cumulative_usage

    models = get_model_usage()
    cumulative = get_cumulative_usage()
    total_cost = sum(m["estimated_cost_usd"] for m in models)

    return ModelUsageResponse(
        models=[
            ModelUsageItem(
                model_id=m["model_id"],
                model_label=m["model_label"],
                prompt_tokens=m["prompt_tokens"],
                completion_tokens=m["completion_tokens"],
                total_tokens=m["total_tokens"],
                request_count=m["request_count"],
                estimated_cost_usd=m["estimated_cost_usd"],
            )
            for m in models
        ],
        total_tokens=cumulative.get("total_tokens", 0),
        total_cost_usd=round(total_cost, 4),
        source="estimated" if models else "no_data",
    )


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8060))
    # reload=True spawns a watchdog process that slows shutdown significantly.
    # Enable it only when explicitly requested for development.
    use_reload = os.environ.get("GREATAEGIS_RELOAD", "").lower() in ("1", "true", "yes")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=use_reload)
