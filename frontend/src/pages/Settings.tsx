import { useState, useEffect, useCallback } from "react";
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
  Trash2,
  Loader2,
  XCircle,
  Lock,
  Eye,
  EyeOff,
} from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";
import type { SystemMetricsResponse } from "../types/api";

const POLLING_OPTIONS = [
  { label: "2 seconds", value: 2000 },
  { label: "5 seconds", value: 5000 },
  { label: "10 seconds", value: 10000 },
  { label: "30 seconds", value: 30000 },
];

const API_BASE = "http://localhost:8060";

interface ServingPath {
  label: string;
  value: string;
}

interface ModelOption {
  label: string;
  baseId: string;
  url: string;
  paths: ServingPath[];
}

const MODEL_OPTIONS: ModelOption[] = [
  {
    label: "GLM 5.2",
    baseId: "accounts/fireworks/models/glm-5p2",
    url: "https://app.fireworks.ai/models/fireworks/glm-5p2",
    paths: [
      { label: "Standard", value: "standard" },
      { label: "Priority", value: "priority" },
      { label: "Fast", value: "fast" },
    ],
  },
  {
    label: "DeepSeek V4 Pro",
    baseId: "accounts/fireworks/models/deepseek-v4-pro",
    url: "https://app.fireworks.ai/models/fireworks/deepseek-v4-pro",
    paths: [
      { label: "Standard", value: "standard" },
      { label: "Priority", value: "priority" },
    ],
  },
  {
    label: "Qwen 3.7 Plus",
    baseId: "accounts/fireworks/models/qwen3p7-plus",
    url: "https://app.fireworks.ai/models/fireworks/qwen3p7-plus",
    paths: [
      { label: "Standard", value: "standard" },
    ],
  },
  {
    label: "GPT-OSS-120B",
    baseId: "accounts/fireworks/models/gpt-oss-120b",
    url: "https://app.fireworks.ai/models/fireworks/gpt-oss-120b",
    paths: [
      { label: "Standard", value: "standard" },
    ],
  },
];

const MODEL_STORAGE_KEY = "GREATAEGIS_FIREWORKS_MODEL";
const SERVING_PATH_STORAGE_KEY = "GREATAEGIS_FIREWORKS_SERVING_PATH";

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
  const [selectedModelIdx, setSelectedModelIdx] = useState(0);
  const [selectedPath, setSelectedPath] = useState(MODEL_OPTIONS[0].paths[0].value);

  const [fireworksKey, setFireworksKey] = useState("");
  const [keyConnected, setKeyConnected] = useState(false);
  const [keyHint, setKeyHint] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ valid: boolean; detail?: string } | null>(null);

  // Settings password gate
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordRequired, setPasswordRequired] = useState<boolean | null>(null);

  // System metrics
  const [sysMetrics, setSysMetrics] = useState<SystemMetricsResponse | null>(null);
  const [sysLoading, setSysLoading] = useState(false);
  const [sysError, setSysError] = useState<string | null>(null);

  useEffect(() => {
    const storedModel = localStorage.getItem(MODEL_STORAGE_KEY);
    const storedPath = localStorage.getItem(SERVING_PATH_STORAGE_KEY);
    if (storedModel) {
      const idx = MODEL_OPTIONS.findIndex((m) => m.baseId === storedModel);
      if (idx >= 0) {
        setSelectedModelIdx(idx);
        const paths = MODEL_OPTIONS[idx].paths;
        if (storedPath && paths.some((p) => p.value === storedPath)) {
          setSelectedPath(storedPath);
        } else {
          setSelectedPath(paths[0].value);
        }
      }
    }
    initKeyStatus();
    checkPasswordRequired();
  }, []);

  const checkPasswordRequired = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/gateway/verify-settings-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "" }),
      });
      const data = await res.json();
      // If no password is set, granted is always true
      if (data.granted) {
        setAuthenticated(true);
        setPasswordRequired(false);
      } else {
        setPasswordRequired(true);
      }
    } catch {
      // Backend unreachable — let user in
      setAuthenticated(true);
      setPasswordRequired(false);
    }
  };

  const handlePasswordSubmit = async () => {
    if (!password.trim() || authLoading) return;
    setAuthLoading(true);
    setAuthError("");
    try {
      const res = await fetch(`${API_BASE}/api/v1/gateway/verify-settings-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.granted) {
        setAuthenticated(true);
      } else {
        setAuthError("Incorrect password");
      }
    } catch {
      setAuthError("Cannot reach backend");
    } finally {
      setAuthLoading(false);
    }
  };

  const initKeyStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/gateway/key-status`);
      if (res.ok) {
        const data = await res.json();
        setKeyConnected(data.configured);
        setKeyHint(data.key_hint || "");
        // If no key on backend but one exists in localStorage, migrate it
        if (!data.configured) {
          const legacy = localStorage.getItem("GREATAEGIS_FIREWORKS_API_KEY");
          if (legacy) {
            const saveRes = await fetch(`${API_BASE}/api/v1/gateway/save-key`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ api_key: legacy }),
            });
            const saveData = await saveRes.json();
            if (saveData.saved) {
              setKeyConnected(true);
              setKeyHint(saveData.key_hint || "");
            }
            localStorage.removeItem("GREATAEGIS_FIREWORKS_API_KEY");
          }
        }
      }
    } catch {
      // backend unreachable
    }
  };

  useEffect(() => {
    const stored = localStorage.getItem("GREATAEGIS_POLLING_INTERVAL");
    if (stored) setPollingInterval(Number(stored));
  }, []);

  const handleSave = () => {
    localStorage.setItem("GREATAEGIS_POLLING_INTERVAL", String(pollingInterval));
    localStorage.setItem(MODEL_STORAGE_KEY, MODEL_OPTIONS[selectedModelIdx].baseId);
    localStorage.setItem(SERVING_PATH_STORAGE_KEY, selectedPath);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleTestConnection = useCallback(async () => {
    if (!fireworksKey.trim() || testing) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/gateway/test-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: fireworksKey }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch {
      setTestResult({ valid: false, detail: "Cannot reach backend" });
    } finally {
      setTesting(false);
    }
  }, [fireworksKey, testing]);

  const handleSaveKey = useCallback(async () => {
    if (!fireworksKey.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/gateway/save-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: fireworksKey }),
      });
      const data = await res.json();
      if (data.saved) {
        setKeyConnected(true);
        setKeyHint(data.key_hint || "");
        setFireworksKey("");
        setTestResult(null);
      }
    } catch {
      // ignore
    }
  }, [fireworksKey]);

  const handleRemoveKey = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/api/v1/gateway/key`, { method: "DELETE" });
    } catch {
      // ignore
    }
    setKeyConnected(false);
    setKeyHint("");
    setFireworksKey("");
    setTestResult(null);
  }, []);

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
    setSelectedModelIdx(0);
    setSelectedPath(MODEL_OPTIONS[0].paths[0].value);
    localStorage.setItem("GREATAEGIS_POLLING_INTERVAL", "5000");
    localStorage.setItem(MODEL_STORAGE_KEY, MODEL_OPTIONS[0].baseId);
    localStorage.setItem(SERVING_PATH_STORAGE_KEY, MODEL_OPTIONS[0].paths[0].value);
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

        {/* Theme */}
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

      {/* ── System Health Card ──────────────────────────────────── */}
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
              backgroundColor: keyConnected
                ? "var(--color-accent-dim)"
                : "rgba(221, 107, 32, 0.1)",
              border: `1px solid ${
                keyConnected
                  ? "color-mix(in srgb, var(--color-accent) 30%, transparent)"
                  : "rgba(221, 107, 32, 0.4)"
              }`,
              color: keyConnected ? "var(--color-success)" : "var(--color-warning)",
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                backgroundColor: keyConnected ? "var(--color-success)" : "var(--color-warning)",
              }}
            />
            {keyConnected ? "Connected" : "No Key"}
          </div>
        </div>

        {keyConnected ? (
          /* ── Connected state ── */
          <>
            <SettingRow
              icon={<Key size={15} />}
              label="Fireworks AI API Key"
              description="Your API key is securely stored on the server and never exposed to the browser"
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono select-none"
                  style={{
                    backgroundColor: "var(--color-accent-dim)",
                    color: "var(--color-success)",
                    border: "1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)",
                  }}
                >
                  <CheckCircle2 size={12} />
                  <span>{keyHint || "Connected"}</span>
                </div>
                <button
                  onClick={handleRemoveKey}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-all duration-150 active:scale-95"
                  style={{
                    backgroundColor: "var(--color-error-dim)",
                    color: "var(--color-error)",
                    border: "1px solid rgba(255, 82, 82, 0.3)",
                  }}
                  title="Remove API key"
                >
                  <Trash2 size={12} />
                  Remove
                </button>
              </div>
            </SettingRow>

            <SettingRow
              icon={<Cpu size={15} />}
              label="Default Model"
              description="Select the Fireworks model and serving path used for chat completions"
            >
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                {(() => {
                  const currentPaths = MODEL_OPTIONS[selectedModelIdx].paths;
                  const safePath = currentPaths.some((p) => p.value === selectedPath)
                    ? selectedPath
                    : currentPaths[0].value;
  if (passwordRequired === null) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={24} className="animate-spin" style={{ color: "var(--color-accent)" }} />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div
          className="rounded-xl p-8 w-full max-w-sm animate-slide-up"
          style={{
            backgroundColor: "var(--color-bg-card)",
            border: "1px solid var(--color-border-default)",
          }}
        >
          <div className="flex flex-col items-center gap-4">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{
                backgroundColor: "var(--color-accent-glow)",
                color: "var(--color-accent)",
              }}
            >
              <Lock size={22} />
            </div>
            <div className="text-center">
              <h2 className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>
                Settings Locked
              </h2>
              <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                Enter the settings password to continue
              </p>
            </div>

            <div className="w-full flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setAuthError("");
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") handlePasswordSubmit(); }}
                  placeholder="Password"
                  autoFocus
                  className="text-sm rounded-md px-3 py-2 w-full transition-all duration-150 focus:outline-none"
                  style={{
                    backgroundColor: "var(--color-bg-input)",
                    color: "var(--color-text-primary)",
                    border: `1px solid ${authError ? "var(--color-error)" : "var(--color-border-default)"}`,
                  }}
                />
                <button
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <button
                onClick={handlePasswordSubmit}
                disabled={!password.trim() || authLoading}
                className="px-4 py-2 rounded-md text-sm font-medium cursor-pointer transition-all duration-150 active:scale-95"
                style={{
                  backgroundColor: password.trim() ? "var(--color-accent)" : "var(--color-border-light)",
                  color: password.trim() ? "#000" : "var(--color-text-muted)",
                  opacity: authLoading ? 0.7 : 1,
                }}
              >
                {authLoading ? <Loader2 size={14} className="animate-spin" /> : "Unlock"}
              </button>
            </div>

            {authError && (
              <p className="text-xs" style={{ color: "var(--color-error)" }}>{authError}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
                    <>
                      <select
                        value={selectedModelIdx}
                        onChange={(e) => {
                          const idx = Number(e.target.value);
                          setSelectedModelIdx(idx);
                          setSelectedPath(MODEL_OPTIONS[idx].paths[0].value);
                        }}
                        className="text-xs font-mono rounded-md px-3 py-1.5 cursor-pointer transition-all duration-150 focus:outline-none"
                        style={{
                          backgroundColor: "var(--color-bg-input)",
                          color: "var(--color-text-primary)",
                          border: "1px solid var(--color-border-default)",
                        }}
                      >
                        {MODEL_OPTIONS.map((opt, idx) => (
                          <option key={opt.baseId} value={idx}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <select
                        value={safePath}
                        onChange={(e) => setSelectedPath(e.target.value)}
                        className="text-xs font-mono rounded-md px-3 py-1.5 cursor-pointer transition-all duration-150 focus:outline-none"
                        style={{
                          backgroundColor: "var(--color-bg-input)",
                          color: "var(--color-text-primary)",
                          border: "1px solid var(--color-border-default)",
                        }}
                      >
                        {currentPaths.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </>
                  );
                })()}
              </div>
            </SettingRow>
          </>
        ) : (
          /* ── Setup state ── */
          <>
            <SettingRow
              icon={<Key size={15} />}
              label="Fireworks AI API Key"
              description="Paste your key, test the connection, then save it securely on the server"
            >
              <div className="flex flex-col gap-2 w-full sm:w-72">
                <input
                  type="password"
                  value={fireworksKey}
                  onChange={(e) => {
                    setFireworksKey(e.target.value);
                    setTestResult(null);
                  }}
                  placeholder="fw_3a..."
                  className="text-xs font-mono rounded-md px-3 py-1.5 w-full transition-all duration-150 focus:outline-none"
                  style={{
                    backgroundColor: "var(--color-bg-input)",
                    color: "var(--color-text-primary)",
                    border: `1px solid ${
                      testResult?.valid
                        ? "var(--color-success)"
                        : testResult && !testResult.valid
                          ? "var(--color-error)"
                          : "var(--color-border-default)"
                    }`,
                  }}
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleTestConnection}
                    disabled={!fireworksKey.trim() || testing}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-all duration-150 active:scale-95"
                    style={{
                      backgroundColor: "var(--color-bg-input)",
                      color: "var(--color-text-secondary)",
                      border: "1px solid var(--color-border-default)",
                      opacity: !fireworksKey.trim() || testing ? 0.5 : 1,
                    }}
                  >
                    {testing ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <RefreshCw size={12} />
                    )}
                    Test Connection
                  </button>
                  {testResult?.valid && (
                    <button
                      onClick={handleSaveKey}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-all duration-150 active:scale-95"
                      style={{
                        backgroundColor: "var(--color-accent-glow)",
                        color: "var(--color-accent)",
                        border: "1px solid rgba(0, 230, 118, 0.3)",
                      }}
                    >
                      <Save size={12} />
                      Save Key
                    </button>
                  )}
                </div>
                {testResult && (
                  <div
                    className="flex items-center gap-1.5 text-[10px]"
                    style={{ color: testResult.valid ? "var(--color-success)" : "var(--color-error)" }}
                  >
                    {testResult.valid ? (
                      <>
                        <CheckCircle2 size={11} />
                        Connection successful
                      </>
                    ) : (
                      <>
                        <XCircle size={11} />
                        {testResult.detail || "Connection failed"}
                      </>
                    )}
                  </div>
                )}
              </div>
            </SettingRow>
          </>
        )}

        <div className="px-5 py-3">
          <p className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
            {keyConnected
              ? "Your API key is stored in memory on the backend and never persisted to disk. It cannot be read by browser DevTools. Restarting the server clears the key."
              : "Your API key is sent to the backend for validation and storage. It is never persisted to disk — stored in server memory only. Get a key from "}
            {!keyConnected && (
              <a
                href="https://fireworks.ai/account/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--color-accent)" }}
                className="underline hover:brightness-125"
              >
                fireworks.ai/account/api-keys
              </a>
            )}
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
