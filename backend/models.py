"""
GreatAegis AI Gateway — Pydantic request / response models.

Covers:
  - Prompt inspection (hybrid-router + PQC)
  - Metrics & logs (dashboard KPI ribbon)
  - Vector DB document operations (data sovereignty)
  - GPU telemetry (production hardware bridge)
"""

from __future__ import annotations

from pydantic import BaseModel, Field


# ── Prompt Inspection ────────────────────────────────────────────────────────

class InspectRequest(BaseModel):
    prompt_payload: str = Field(..., max_length=100_000)
    routing_profile: str = "auto"
    client_encryption_flag: bool = False
    quantum_encryption_enabled: bool = True
    zero_trust_enabled: bool = True
    pod_isolation_enabled: bool = True
    encrypted_prompt: str | None = None


class InspectResponse(BaseModel):
    routing_verdict: str
    target_compute_node: str | None = None
    target_model: str | None = None
    routing_reason: str = ""
    encryption_status: str
    pqc_signature: str | None = None
    pqc_validation_flag: bool = False
    pqc_algorithm: str = "ML-KEM-768 + ML-DSA-65"
    pqc_public_key: str | None = None
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
    file_name: str = Field(..., max_length=255, pattern=r'^[\w\-\. ]+$')
    classification: str = Field(..., pattern=r'^(Public|Confidential|Highly Confidential)$')
    content: str = Field(..., max_length=1_000_000)
    chunk_size: int = Field(default=512, ge=128, le=4096)
    chunk_overlap: int = Field(default=64, ge=0, le=512)


class DocumentIngestResponse(BaseModel):
    file_name: str
    chunks_stored: int
    doc_ids: list[str]
    encryption: str = "AES-256-GCM + ML-KEM-768 hybrid"
    storage: str = "Local Qdrant (air-gapped)"


class DocumentQueryRequest(BaseModel):
    query: str = Field(..., max_length=10_000)
    top_k: int = Field(default=5, ge=1, le=50)
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
    models_available: list[str]    # e.g. ["glm-5.2-fp8", "glm-5.2-fp8"]


# ── Fireworks AI Chat (direct, user-picks-model) ─────────────────────────────

class ChatRequest(BaseModel):
    prompt: str = Field(..., max_length=100_000)
    model: str = "accounts/fireworks/models/glm-5p2"
    temperature: float = Field(default=0.3, ge=0.0, le=2.0)
    max_tokens: int = Field(default=2048, ge=1, le=8192)
    system_prompt: str | None = None
    routing_profile: str = "auto"
    client_encryption_flag: bool = False
    quantum_encryption_enabled: bool = True
    zero_trust_enabled: bool = True
    pod_isolation_enabled: bool = True
    encrypted_prompt: str | None = None


# ── Gateway Chat (autonomous hybrid router decides model) ───────────────────

class ChatHistoryMessage(BaseModel):
    role: str = Field(..., pattern="^(user|assistant|system)$")
    content: str = Field(..., max_length=100_000)


class GatewayChatRequest(BaseModel):
    """Chat request that goes through the hybrid router."""
    prompt: str = Field(..., max_length=100_000)
    messages: list[ChatHistoryMessage] | None = None
    history_routing_verdicts: list[str] | None = None
    conversation_id: str | None = None
    temperature: float = Field(default=0.3, ge=0.0, le=2.0)
    max_tokens: int = Field(default=2048, ge=1, le=8192)
    model: str | None = None
    system_prompt: str | None = None
    routing_profile: str = "auto"
    client_encryption_flag: bool = False
    quantum_encryption_enabled: bool = True
    zero_trust_enabled: bool = True
    pod_isolation_enabled: bool = True
    encrypted_prompt: str | None = None


class ChatResponse(BaseModel):
    routing_verdict: str
    target_model: str
    routing_reason: str
    encryption_status: str
    hardware_status: str
    fallback_engaged: bool
    quantum_rules: dict[str, bool] = {}
    pqc_algorithm: str = "ML-KEM-768 + ML-DSA-65"
    warning: str | None = None


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


class ModelUsageItem(BaseModel):
    model_id: str
    model_label: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    request_count: int = 0
    estimated_cost_usd: float = 0.0


class ModelUsageResponse(BaseModel):
    models: list[ModelUsageItem]
    total_tokens: int = 0
    total_cost_usd: float = 0.0
    source: str = "fireworks_api"


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


# ── API Key Management ────────────────────────────────────────────────────────

class ApiKeyRequest(BaseModel):
    api_key: str = Field(..., max_length=500)
    settings_password: str | None = None


class SettingsPasswordRequest(BaseModel):
    password: str


class ApiKeyStatusResponse(BaseModel):
    configured: bool
    key_hint: str = ""  # e.g. "fw_3a...****"
