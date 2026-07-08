import { useState, useEffect } from "react";
import {
  Settings,
  Monitor,
  Bell,
  Clock,
  Globe,
  Shield,
  Save,
  CheckCircle2,
  RefreshCw,
  Terminal,
  Key,
  ExternalLink,
  Cpu,
  HardDrive,
  Server,
  RotateCcw,
} from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";
import type { SystemMetricsResponse } from "../types/api";

const POLLING_OPTIONS = [
  { label: "2 seconds", value: 2000 },
  { label: "5 seconds", value: 5000 },
  { label: "10 seconds", value: 10000 },
  { label: "30 seconds", value: 30000 },
];

const API_BASE = "http://localhost:8000";

interface SettingRowProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  children: React.ReactNode;
}

function SettingRow({ icon, label, description, children }: SettingRowProps) {
  return (
    <div
      className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-6 py-4 px-5 animate-slide-up"
      style={{ borderBottom: "1px solid var(--color-border-default)" }}
    >
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <span className="mt-0.5 flex-shrink-0" style={{ color: "var(--color-accent)" }}>
          {icon}
        </span>
        <div>
          <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
            {label}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            {description}
          </p>
        </div>
      </div>
      <div className="flex-shrink-0 self-start sm:self-auto">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [pollingInterval, setPollingInterval] = useState(5000);
  const [eventLogging, setEventLogging] = useState(true);
  const [autoFallback, setAutoFallback] = useState(true);
  const [pqcEnforcement, setPqcEnforcement] = useState(true);
  const [saved, setSaved] = useState(false);
  const [fireworksKey, setFireworksKey] = useState("");
  const [keyVisible, setKeyVisible] = useState(false);

  // System metrics
  const [sysMetrics, setSysMetrics] = useState<SystemMetricsResponse | null>(null);
  const [sysLoading, setSysLoading] = useState(false);
  const [sysError, setSysError] = useState<string | null>(null);

  // Load Fireworks API key from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("GREATAEGIS_FIREWORKS_API_KEY");
    if (stored) setFireworksKey(stored);
  }, []);

  // Load polling interval preference
  useEffect(() => {
    const stored = localStorage.getItem("GREATAEGIS_POLLING_INTERVAL");
    if (stored) setPollingInterval(Number(stored));
  }, []);

  const handleSave = () => {
    localStorage.setItem("GREATAEGIS_FIREWORKS_API_KEY", fireworksKey);
    localStorage.setItem("GREATAEGIS_POLLING_INTERVAL", String(pollingInterval));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const fetchSystemMetrics = async () => {
    setSysLoading(true);
    setSysError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/gateway/system`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: SystemMetricsResponse = await res.json();
      setSysMetrics(json);
    } catch (err) {
      setSysError(err instanceof Error ? err.message : "Failed to fetch");
      setSysMetrics(null);
    } finally {
      setSysLoading(false);
    }
  };

  const handleResetDefaults = () => {
    setPollingInterval(5000);
    setTheme("dark");
    setEventLogging(true);
    setAutoFallback(true);
    setPqcEnforcement(true);
    localStorage.setItem("GREATAEGIS_POLLING_INTERVAL", "5000");
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="flex flex-col gap-5 max-w-3xl mx-auto">
      {/* ── Page Header ──────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Settings
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            Gateway configuration &amp; preferences
          </p>
        </div>
        <button
          onClick={handleResetDefaults}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-all duration-150 active:scale-95 hover:brightness-125 self-start"
          style={{
            backgroundColor: "var(--color-bg-card)",
            color: "var(--color-text-muted)",
            border: "1px solid var(--color-border-default)",
          }}
          aria-label="Reset settings to defaults"
        >
          <RotateCcw size={12} aria-hidden="true" />
          Reset Defaults
        </button>
      </div>

      {/* ── General Settings Card ────────────────────────────────── */}
      <div
        className="rounded-lg overflow-hidden animate-slide-up"
        style={{
          backgroundColor: "var(--color-bg-card)",
          border: "1px solid var(--color-border-default)",
        }}
      >
        <div
          className="px-5 py-3 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--color-border-default)" }}
        >
          <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--color-text-primary)" }}>
            <Settings size={16} style={{ color: "var(--color-accent)" }} />
            General
          </h2>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-all duration-150 active:scale-95 hover:brightness-125"
            style={{
              backgroundColor: saved ? "var(--color-success-dim)" : "var(--color-accent-glow)",
              color: saved ? "var(--color-success)" : "var(--color-accent)",
              border: `1px solid ${saved ? "var(--color-success)" : "rgba(0, 230, 118, 0.3)"}`,
            }}
          >
            {saved ? (
              <>
                <CheckCircle2 size={13} />
                Saved
              </>
            ) : (
              <>
                <Save size={13} />
                Save Changes
              </>
            )}
          </button>
        </div>

        {/* Polling interval */}
        <SettingRow
          icon={<Clock size={15} />}
          label="Data Polling Interval"
          description="How often the dashboard refreshes metrics, logs, and telemetry from the backend"
        >
          <select
            value={pollingInterval}
            onChange={(e) => setPollingInterval(Number(e.target.value))}
            className="text-xs font-mono rounded-md px-3 py-1.5 cursor-pointer transition-all duration-150 focus:outline-none w-full sm:w-auto"
            style={{
              backgroundColor: "var(--color-bg-input)",
              color: "var(--color-text-primary)",
              border: "1px solid var(--color-border-default)",
            }}
          >
            {POLLING_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </SettingRow>

        {/* Theme — WIRED TO REAL THEMECONTEXT */}
        <SettingRow
          icon={<Monitor size={15} />}
          label="Theme"
          description="Choose the dashboard color scheme"
        >
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as "dark" | "light")}
            className="text-xs font-mono rounded-md px-3 py-1.5 cursor-pointer transition-all duration-150 focus:outline-none w-full sm:w-auto"
            style={{
              backgroundColor: "var(--color-bg-input)",
              color: "var(--color-text-primary)",
              border: "1px solid var(--color-border-default)",
            }}
          >
            <option value="dark">Dark — Deep Space</option>
            <option value="light">Light — Daylight</option>
          </select>
        </SettingRow>

        {/* Event Logging */}
        <SettingRow
          icon={<Bell size={15} />}
          label="Event Logging"
          description="Record all routing decisions and security events to the threat capture log"
        >
          <button
            onClick={() => setEventLogging(!eventLogging)}
            className="relative inline-flex h-5 w-9 rounded-full cursor-pointer transition-all duration-200 active:scale-95 flex-shrink-0"
            style={{
              backgroundColor: eventLogging ? "var(--color-accent)" : "var(--color-border-light)",
            }}
            role="switch"
            aria-checked={eventLogging}
          >
            <span
              className="inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-200"
              style={{
                transform: eventLogging ? "translateX(18px)" : "translateX(2px)",
                marginTop: "2px",
              }}
            />
          </button>
        </SettingRow>
      </div>

      {/* ── Security & Routing Card ──────────────────────────────── */}
      <div
        className="rounded-lg overflow-hidden animate-slide-up"
        style={{
          backgroundColor: "var(--color-bg-card)",
          border: "1px solid var(--color-border-default)",
          animationDelay: "80ms",
        }}
      >
        <div
          className="px-5 py-3 flex items-center"
          style={{ borderBottom: "1px solid var(--color-border-default)" }}
        >
          <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--color-text-primary)" }}>
            <Shield size={16} style={{ color: "var(--color-accent-amber)" }} />
            Security &amp; Routing
          </h2>
        </div>

        <SettingRow
          icon={<Globe size={15} />}
          label="Automatic Secure Fallback"
          description="When the AMD Secure Pod is unreachable, autonomously route through encrypted PQC tunnel"
        >
          <button
            onClick={() => setAutoFallback(!autoFallback)}
            className="relative inline-flex h-5 w-9 rounded-full cursor-pointer transition-all duration-200 active:scale-95 flex-shrink-0"
            style={{
              backgroundColor: autoFallback ? "var(--color-accent)" : "var(--color-border-light)",
            }}
            role="switch"
            aria-checked={autoFallback}
          >
            <span
              className="inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-200"
              style={{
                transform: autoFallback ? "translateX(18px)" : "translateX(2px)",
                marginTop: "2px",
              }}
            />
          </button>
        </SettingRow>

        <SettingRow
          icon={<Shield size={15} />}
          label="Post-Quantum Encryption Enforcement"
          description="Require ML-KEM-768 key wrapping for all sensitive payloads"
        >
          <button
            onClick={() => setPqcEnforcement(!pqcEnforcement)}
            className="relative inline-flex h-5 w-9 rounded-full cursor-pointer transition-all duration-200 active:scale-95 flex-shrink-0"
            style={{
              backgroundColor: pqcEnforcement ? "var(--color-accent)" : "var(--color-border-light)",
            }}
            role="switch"
            aria-checked={pqcEnforcement}
          >
            <span
              className="inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-200"
              style={{
                transform: pqcEnforcement ? "translateX(18px)" : "translateX(2px)",
                marginTop: "2px",
              }}
            />
          </button>
        </SettingRow>

        <SettingRow
          icon={<Terminal size={15} />}
          label="Routing Profile"
          description="Default model routing strategy for the hybrid router"
        >
          <select
            className="text-xs font-mono rounded-md px-3 py-1.5 cursor-pointer transition-all duration-150 focus:outline-none w-full sm:w-auto"
            style={{
              backgroundColor: "var(--color-bg-input)",
              color: "var(--color-text-primary)",
              border: "1px solid var(--color-border-default)",
            }}
          >
            <option value="default">Default (latency-optimized)</option>
            <option value="sovereign">Sovereign (privacy-first)</option>
            <option value="cost">Cost-optimized</option>
          </select>
        </SettingRow>
      </div>

      {/* ── System Health Card (NEW — Real Backend Data) ──────────── */}
      <div
        className="rounded-lg overflow-hidden animate-slide-up"
        style={{
          backgroundColor: "var(--color-bg-card)",
          border: "1px solid var(--color-border-default)",
          animationDelay: "80ms",
        }}
      >
        <div
          className="px-5 py-3 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--color-border-default)" }}
        >
          <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--color-text-primary)" }}>
            <Cpu size={16} style={{ color: "var(--color-accent)" }} />
            System Health
          </h2>
          <button
            onClick={fetchSystemMetrics}
            disabled={sysLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-all duration-150 active:scale-95 hover:brightness-125"
            style={{
              backgroundColor: "var(--color-accent-glow)",
              color: "var(--color-accent)",
              border: "1px solid rgba(0, 230, 118, 0.3)",
              opacity: sysLoading ? 0.6 : 1,
            }}
            aria-label="Fetch system metrics"
          >
            <RefreshCw size={12} className={sysLoading ? "animate-spin" : ""} aria-hidden="true" />
            {sysLoading ? "Fetching..." : "Refresh"}
          </button>
        </div>

        {sysMetrics ? (
          <div className="px-5 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {/* CPU */}
              <div
                className="rounded-lg p-3"
                style={{ backgroundColor: "var(--color-bg-input)" }}
              >
                <div className="flex items-center gap-1.5 text-[10px] mb-1" style={{ color: "var(--color-text-muted)" }}>
                  <Cpu size={11} /> CPU
                </div>
                <p className="text-lg font-bold font-mono" style={{ color: "var(--color-text-primary)" }}>
                  {sysMetrics.cpu_percent.toFixed(0)}%
                </p>
              </div>

              {/* Memory */}
              <div
                className="rounded-lg p-3"
                style={{ backgroundColor: "var(--color-bg-input)" }}
              >
                <div className="flex items-center gap-1.5 text-[10px] mb-1" style={{ color: "var(--color-text-muted)" }}>
                  <Server size={11} /> Memory
                </div>
                <p className="text-lg font-bold font-mono" style={{ color: "var(--color-text-primary)" }}>
                  {sysMetrics.memory_percent.toFixed(0)}%
                </p>
                <p className="text-[10px] font-mono" style={{ color: "var(--color-text-muted)" }}>
                  {sysMetrics.memory_used_gb.toFixed(1)} / {sysMetrics.memory_total_gb.toFixed(0)} GB
                </p>
              </div>

              {/* Disk */}
              <div
                className="rounded-lg p-3"
                style={{ backgroundColor: "var(--color-bg-input)" }}
              >
                <div className="flex items-center gap-1.5 text-[10px] mb-1" style={{ color: "var(--color-text-muted)" }}>
                  <HardDrive size={11} /> Disk
                </div>
                <p className="text-lg font-bold font-mono" style={{ color: "var(--color-text-primary)" }}>
                  {sysMetrics.disk_percent.toFixed(0)}%
                </p>
                <p className="text-[10px] font-mono" style={{ color: "var(--color-text-muted)" }}>
                  {sysMetrics.disk_used_gb.toFixed(1)} / {sysMetrics.disk_total_gb.toFixed(0)} GB
                </p>
              </div>
            </div>

            {/* Host / Uptime info */}
            <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-[10px] font-mono" style={{ color: "var(--color-text-muted)" }}>
              <span>Host: {sysMetrics.hostname}</span>
              <span className="hidden sm:inline">|</span>
              <span>Uptime: {sysMetrics.uptime_hours.toFixed(1)}h</span>
              <span className="hidden sm:inline">|</span>
              <span>Python: {sysMetrics.python_version}</span>
            </div>
          </div>
        ) : sysError ? (
          <div className="px-5 py-4 text-xs" style={{ color: "var(--color-warning)" }}>
            <p>Could not fetch system metrics — {sysError}. Make sure the backend server is running.</p>
          </div>
        ) : (
          <div className="px-5 py-4 text-xs" style={{ color: "var(--color-text-muted)" }}>
            <p>Click "Refresh" to fetch real system metrics from the backend.</p>
          </div>
        )}
      </div>

      {/* ── Fireworks AI Integration Card ──────────────────────────── */}
      <div
        className="rounded-lg overflow-hidden animate-slide-up"
        style={{
          backgroundColor: "var(--color-bg-card)",
          border: "1px solid var(--color-border-default)",
          animationDelay: "80ms",
        }}
      >
        <div
          className="px-5 py-3 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--color-border-default)" }}
        >
          <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--color-text-primary)" }}>
            <ExternalLink size={16} style={{ color: "var(--color-accent)" }} />
            Fireworks AI Integration
          </h2>
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium"
            style={{
              backgroundColor: fireworksKey
                ? "rgba(0, 230, 118, 0.12)"
                : "rgba(221, 107, 32, 0.1)",
              border: `1px solid ${
                fireworksKey
                  ? "rgba(0, 230, 118, 0.3)"
                  : "rgba(221, 107, 32, 0.4)"
              }`,
              color: fireworksKey
                ? "var(--color-success)"
                : "var(--color-warning)",
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                backgroundColor: fireworksKey
                  ? "var(--color-success)"
                  : "var(--color-warning)",
              }}
            />
            {fireworksKey ? "Connected" : "No Key"}
          </div>
        </div>

        <SettingRow
          icon={<Key size={15} />}
          label="Fireworks AI API Key"
          description="Your Fireworks AI API key for live chat completions, model listing, and usage metrics"
        >
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-none">
              <input
                type={keyVisible ? "text" : "password"}
                value={fireworksKey}
                onChange={(e) => setFireworksKey(e.target.value)}
                placeholder="fw_3a... or leave empty for demo mode"
                className="text-xs font-mono rounded-md px-3 py-1.5 w-full sm:w-64 transition-all duration-150 focus:outline-none"
                style={{
                  backgroundColor: "var(--color-bg-input)",
                  color: "var(--color-text-primary)",
                  border: "1px solid var(--color-border-default)",
                }}
              />
              <button
                onClick={() => setKeyVisible(!keyVisible)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] cursor-pointer transition-all duration-150"
                style={{ color: "var(--color-text-muted)" }}
                aria-label={keyVisible ? "Hide API key" : "Show API key"}
              >
                {keyVisible ? "Hide" : "Show"}
              </button>
            </div>
          </div>
        </SettingRow>

        <div className="px-5 py-3">
          <p className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
            Your API key is stored locally in your browser and sent directly
            to the backend via request headers. It is never persisted on the
            server. Get a key from{" "}
            <a
              href="https://fireworks.ai/account/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--color-accent)" }}
              className="underline hover:brightness-125"
            >
              fireworks.ai/account/api-keys
            </a>
          </p>
        </div>
      </div>

      {/* ── About Card ───────────────────────────────────────────── */}
      <div
        className="rounded-lg p-5 animate-slide-up"
        style={{
          backgroundColor: "var(--color-bg-card)",
          border: "1px solid var(--color-border-default)",
          animationDelay: "160ms",
        }}
      >
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: "var(--color-text-primary)" }}>
          <RefreshCw size={15} style={{ color: "var(--color-text-muted)" }} />
          About
        </h2>
        <div className="space-y-1.5 text-xs" style={{ color: "var(--color-text-secondary)" }}>
          <p><span className="font-semibold" style={{ color: "var(--color-text-muted)" }}>Version:</span> GreatAegis AI Gateway v2.0.0</p>
          <p><span className="font-semibold" style={{ color: "var(--color-text-muted)" }}>Runtime:</span> AMD ROCm / Fireworks AI Hybrid Router</p>
          <p><span className="font-semibold" style={{ color: "var(--color-text-muted)" }}>Cryptography:</span> ML-KEM-768 / SLH-DSA (FIPS 205)</p>
          <p><span className="font-semibold" style={{ color: "var(--color-text-muted)" }}>Vector DB:</span> Local ChromaDB with AES-256-GCM encrypted chunks</p>
        </div>
      </div>
    </div>
  );
}
