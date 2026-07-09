/* ── API Response Types ─────────────────────────────────────────────── */

export interface ChartDataPoint {
  timestamp: string;
  public_tokens: number;
  private_pod: number;
}

export interface MetricsResponse {
  total_routed_requests: number;
  attacks_intercepted: number;
  opex_savings: number;
  latency_overhead: number;
  chart_data: ChartDataPoint[];
}

export interface LogEntry {
  id: string;
  timestamp: string;
  file_name: string;
  classification: string;
  file_size: number;
  ciphertext: string;
}

export interface InspectRequest {
  prompt_payload: string;
  routing_profile?: string;
  client_encryption_flag?: boolean;
  quantum_encryption_enabled?: boolean;
  zero_trust_enabled?: boolean;
  pod_isolation_enabled?: boolean;
}

export interface InspectResponse {
  routing_verdict: string;
  target_compute_node: string | null;
  target_model: string | null;
  routing_reason: string;
  encryption_status: string;
  pqc_signature: string | null;
  pqc_validation_flag: boolean;
  streaming_endpoint: string | null;
  hardware_status: "online" | "offline" | "simulated";
  fallback_engaged: boolean;
}

/* ── GPU Telemetry Types ────────────────────────────────────────── */

export interface GPUDeviceInfo {
  device_id: number;
  name: string;
  temperature_c: number;
  vram_used_gb: number;
  vram_total_gb: number;
  utilization_pct: number;
  power_watts: number;
  power_cap_watts: number;
  sclk_mhz: number;
  mclk_mhz: number;
}

export interface GPUTelemetryResponse {
  mode: string;
  hardware_status: "online" | "offline" | "simulated";
  timestamp: string;
  devices: GPUDeviceInfo[];
  hostname: string;
}


/* ── Fireworks AI Chat Types ────────────────────────────────────────── */

export interface ChatRequest {
  prompt: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  system_prompt?: string | null;
  routing_profile?: string;
  client_encryption_flag?: boolean;
  quantum_encryption_enabled?: boolean;
  zero_trust_enabled?: boolean;
  pod_isolation_enabled?: boolean;
}

export interface ChatRoutingInfo {
  routing_verdict: string;
  target_model: string;
  routing_reason: string;
  encryption_status: string;
  hardware_status: string;
  fallback_engaged: boolean;
  warning?: string | null;
  quantum_rules?: {
    ml_kem_wrapping: boolean;
    zero_trust_encapsulation: boolean;
    pod_isolation: boolean;
  };
}

/* ── System Metrics Type ────────────────────────────────────────── */

export interface SystemMetricsResponse {
  cpu_percent: number;
  memory_percent: number;
  memory_used_gb: number;
  memory_total_gb: number;
  disk_percent: number;
  disk_used_gb: number;
  disk_total_gb: number;
  uptime_hours: number;
  python_version: string;
  hostname: string;
}

export interface FireworksUsageResponse {
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  estimated_cost_usd: number;
  source: string;
}

export interface ModelUsageItem {
  model_id: string;
  model_label: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  request_count: number;
  estimated_cost_usd: number;
}

export interface ModelUsageResponse {
  models: ModelUsageItem[];
  total_tokens: number;
  total_cost_usd: number;
  source: string;
}

export interface FireworksModel {
  id: string;
  object: string;
  curated?: boolean;
}

export interface FireworksModelsResponse {
  models: FireworksModel[];
  count: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  routing?: ChatRoutingInfo | null;
  attachment?: { name: string; content: string } | null;
}
