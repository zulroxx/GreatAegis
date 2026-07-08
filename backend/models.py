"""
GreatAegis AI Gateway — Pydantic request / response models.

Covers:
  - Prompt inspection (hybrid-router + PQC)
  - Metrics & logs (dashboard KPI ribbon)
  - Vector DB document operations (data sovereignty)
  - GPU telemetry (production hardware bridge)
"""

from __future__ import annotations

from pydantic import BaseModel


# ── Prompt Inspection ────────────────────────────────────────────────────────

class InspectRequest(BaseModel):
    prompt_payload: str
    routing_profile: str = "auto"  # "auto" | "compliance" | "deep-inference"
    client_encryption_flag: bool = False
    quantum_encryption_enabled: bool = True
    zero_trust_enabled: bool = True
    pod_isolation_enabled: bool = True


class InspectResponse(BaseModel):
    routing_verdict: str
    target_compute_node: str | None = None
    target_model: str | None = None
    routing_reason: str = ""
    encryption_status: str
    pqc_signature: str | None = None
    pqc_validation_flag: bool = False
    streaming_endpoint: str | None = None
    hardware_status: str = "online"           # "online" | "offline" | "simulated"
    fallback_engaged: bool = False            # True when SECURE_FALLBACK is active


# ── Metrics ──────────────────────────────────────────────────────────────────

class ChartDataPoint(BaseModel):
    timestamp: str
    public_tokens: int
    private_pod: int


class MetricsResponse(BaseModel):
    total_routed_requests: int
    attacks_intercepted: int
    opex_savings: float
    latency_overhead: float
    chart_data: list[ChartDataPoint]


# ── Logs ─────────────────────────────────────────────────────────────────────

class LogEntry(BaseModel):
    id: str
    timestamp: str
    file_name: str
    classification: str
    file_size: int
    ciphertext: str


# ── Vector DB (Data Sovereignty) ─────────────────────────────────────────────

class DocumentIngestRequest(BaseModel):
    """Upload a file's text content for encrypted local vector storage."""
    file_name: str
    classification: str  # e.g. "Public" | "Confidential" | "Highly Confidential"
    content: str         # raw text extracted from the uploaded file
    chunk_size: int = 512
    chunk_overlap: int = 64


class DocumentIngestResponse(BaseModel):
    file_name: str
    chunks_stored: int
    doc_ids: list[str]
    encryption: str = "AES-256-GCM via PQC module"
    storage: str = "Local ChromaDB (air-gapped)"


class DocumentQueryRequest(BaseModel):
    query: str
    top_k: int = 5
    filter_classification: str | None = None


class DocumentQueryResponse(BaseModel):
    query: str
    hits: list[dict]
    total_in_db: int


class VectorDBStatsResponse(BaseModel):
    collection_name: str
    persist_directory: str
    chunk_count: int
    engine: str


# ── GPU Telemetry ────────────────────────────────────────────────────────────

class GPUDeviceInfo(BaseModel):
    device_id: int
    name: str
    temperature_c: float
    vram_used_gb: float
    vram_total_gb: float
    utilization_pct: float
    power_watts: float
    power_cap_watts: float
    sclk_mhz: int
    mclk_mhz: int


class GPUTelemetryResponse(BaseModel):
    mode: str                      # "simulated" | "production"
    hardware_status: str = "simulated"  # "online" | "offline" | "simulated"
    timestamp: str
    devices: list[GPUDeviceInfo]
    hostname: str = ""


# ── App Mode / Health ────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str                    # "healthy"
    app_mode: str                  # "simulated" | "production"
    hardware_status: str = "simulated"  # "online" | "offline" | "simulated"
    vector_db: str                 # "connected" | "disconnected"
    models_available: list[str]    # e.g. ["gemma-7b", "mixtral-8x7b"]


# ── Fireworks AI Chat (direct, user-picks-model) ─────────────────────────────

class ChatRequest(BaseModel):
    prompt: str
    model: str = "accounts/fireworks/models/gemma-4-26b-a4b-it"
    temperature: float = 0.7
    max_tokens: int = 2048
    system_prompt: str | None = None
    routing_profile: str = "auto"
    client_encryption_flag: bool = False
    quantum_encryption_enabled: bool = True
    zero_trust_enabled: bool = True
    pod_isolation_enabled: bool = True


# ── Gateway Chat (autonomous hybrid router decides model) ───────────────────

class GatewayChatRequest(BaseModel):
    """Chat request that goes through the hybrid router — no model field.
    The router autonomously selects the target model based on content."""
    prompt: str
    temperature: float = 0.7
    max_tokens: int = 2048
    system_prompt: str | None = None
    routing_profile: str = "auto"
    client_encryption_flag: bool = False
    quantum_encryption_enabled: bool = True
    zero_trust_enabled: bool = True
    pod_isolation_enabled: bool = True


class ChatResponse(BaseModel):
    routing_verdict: str
    target_model: str
    routing_reason: str
    encryption_status: str
    hardware_status: str
    fallback_engaged: bool
    quantum_rules: dict[str, bool] = {}


# ── Fireworks Models ─────────────────────────────────────────────────────────

class FireworksModelsResponse(BaseModel):
    models: list[dict]
    count: int


# ── Fireworks Usage ──────────────────────────────────────────────────────────

class FireworksUsageResponse(BaseModel):
    total_tokens: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    estimated_cost_usd: float = 0.0
    source: str = "simulated"  # "fireworks_api" | "simulated"


# ── System Metrics (Real Backend Data) ───────────────────────────────────────

class SystemMetricsResponse(BaseModel):
    cpu_percent: float
    memory_percent: float
    memory_used_gb: float
    memory_total_gb: float
    disk_percent: float
    disk_used_gb: float
    disk_total_gb: float
    uptime_hours: float
    python_version: str
    hostname: str
