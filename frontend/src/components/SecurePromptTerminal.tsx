import { useState, useRef } from "react";
import { Terminal, Send, Loader2, Lock, Clock, AlertTriangle, Activity, Paperclip } from "lucide-react";
import type { InspectResponse } from "../types/api";

interface SecurePromptTerminalProps {
  onSubmit: (prompt: string) => Promise<void>;
  loading: boolean;
  result: InspectResponse | null;
  error: string | null;
  classification: string;
  riskScore: number;
  demoMode?: "casual" | "sovereign" | "fallback";
  onFileAttach?: () => void;
}

export default function SecurePromptTerminal({
  onSubmit,
  loading,
  result,
  error,
  classification,
  riskScore,
  demoMode,
  onFileAttach,
}: SecurePromptTerminalProps) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    await onSubmit(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSubmit();
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = () => {
    onFileAttach?.();
  };

  /* ── Resolve state: demo mode overrides real backend data ─── */
  const demoOnline = demoMode === "casual" || demoMode === "sovereign";
  const demoFallback = demoMode === "fallback";
  const isOnline = demoMode ? demoOnline : result?.hardware_status === "online";
  const isFallbackActive = demoMode ? demoFallback : result?.fallback_engaged === true;

  const hardwareColor = isOnline
    ? "var(--color-success)"
    : isFallbackActive
      ? "var(--color-warning)"
      : "var(--color-accent)";

  const vllmLabel = isFallbackActive
    ? "SECURE FALLBACK"
    : isOnline
      ? "CONNECTED"
      : "SIMULATED";

  return (
    <div
      className="rounded-lg flex flex-col h-full"
      style={{
        backgroundColor: "var(--color-bg-input)",
        border: "0px solid var(--color-border-default)",
        fontFamily: 'ui-monospace, "SF Mono", "Fira Code", "Courier New", monospace',
      }}
    >
      {/* ── Terminal header ────────────────────────────────── */}
      <div
        className="flex items-center gap-2 px-4 py-2.5 rounded-t-lg"
        style={{
          backgroundColor: "var(--color-bg-input)",
          borderBottom: "0px solid var(--color-border-default)",
        }}
      >
        <Terminal size={14} style={{ color: "var(--color-accent)" }} />
        <span className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>
          Secure Prompt Terminal
        </span>
      </div>

      {/* ── Output area ────────────────────────────────────── */}
      <div className="flex-1 px-4 py-3 overflow-y-auto" style={{ minHeight: 160 }}>
        {/* Prompt prefix + input */}
        <div className="flex items-center gap-1.5 text-sm mb-2">
          <span style={{ color: "var(--color-accent)", fontWeight: 600 }}>great-aegis@gateway:~$</span>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-3">
          <label htmlFor="terminal-input" className="sr-only">Enter your prompt</label>
          <input
            id="terminal-input"
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a prompt..."
            disabled={loading}
            className="flex-1 text-sm bg-transparent border-none outline-none min-w-0"
            style={{
              color: "var(--color-text-primary)",
              fontFamily: "inherit",
            }}
            aria-describedby="terminal-hint"
          />
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleSubmit}
              disabled={loading || !input.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all duration-150 active:scale-95"
              style={{
                backgroundColor: loading ? "var(--color-border-light)" : "var(--color-accent)",
                color: "#fff",
                opacity: !input.trim() || loading ? 0.5 : 1,
                cursor: !input.trim() || loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Send size={12} />
              )}
              {loading ? "Routing..." : "Submit"}
            </button>
            {/* ── File attach button ──────────────────────────────── */}
            <button
              onClick={handleFileSelect}
              disabled={loading}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium transition-all duration-150 active:scale-95 cursor-pointer"
              style={{
                backgroundColor: "var(--color-bg-card)",
                border: "1px solid var(--color-border-light)",
                color: "var(--color-text-muted)",
                opacity: loading ? 0.5 : 1,
              }}
              title="Attach file"
            >
              <Paperclip size={12} />
              Attach
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
              accept=".txt,.pdf,.doc,.docx,.csv,.json"
            />
          </div>
        </div>

        <p id="terminal-hint" className="text-xs mb-3" style={{ color: "var(--color-text-muted)" }}>
          {loading
            ? <span className="flex items-center gap-1"><Clock size={12} /> Routing prompt through GreatAegis hybrid router...</span>
            : "Enter a prompt above to inspect routing and encryption status."}
        </p>

        {/* Encryption indicator — animated on mount */}
        {classification === "highly_confidential" && !loading && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded text-xs mb-3 animate-slide-up"
            style={{
              backgroundColor: "rgba(0, 128, 255, 0.08)",
              border: "1px solid var(--color-accent)",
              color: "var(--color-accent)",
            }}
          >
            <span><Lock size={12} /></span>
            <span>
              Frontend Encryption Active — Risk Score {riskScore}/100. Routing to private AMD pod.
            </span>
          </div>
        )}

        {/* ── PQC Engine Log (Sovereign Demo Mode) ──────────── */}
        {demoMode === "sovereign" && result && (
          <div
            className="text-xs mb-3 px-3 py-2 rounded animate-slide-up"
            style={{
              backgroundColor: "rgba(0, 230, 118, 0.08)",
              border: "1px solid var(--color-success)",
              color: "var(--color-success)",
              fontFamily: "inherit",
            }}
          >
            <span className="opacity-70">[PQC Engine]</span>{" "}
            Wrapping payload into uncrackable lattice-based noise... Done (+0.05s)
          </div>
        )}

        {/* ── Fallback warning (demo mode) ──────────────────── */}
        {demoMode === "fallback" && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded text-xs mb-3 animate-bounce-in"
            style={{
              backgroundColor: "rgba(221, 107, 32, 0.1)",
              border: "1px solid rgba(221, 107, 32, 0.4)",
              color: "var(--color-warning)",
            }}
          >
            <AlertTriangle size={12} />
            <span>
              <span className="font-bold">SECURE FALLBACK ACTIVE</span> —{" "}
              AMD Secure Node Offline — Autonomous Zero-Trust Failover Engaged
            </span>
          </div>
        )}

        {/* Fallback warning banner */}
        {result?.fallback_engaged && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded text-xs mb-3 animate-bounce-in"
            style={{
              backgroundColor: "rgba(221, 107, 32, 0.1)",
              border: "1px solid rgba(221, 107, 32, 0.4)",
              color: "var(--color-warning)",
            }}
          >
            <AlertTriangle size={12} />
            <span>
              <span className="font-bold">SECURE FALLBACK ACTIVE</span> —{" "}
              {result.routing_reason}
            </span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            className="flex items-center gap-1.5 px-3 py-2 rounded text-xs mb-3 animate-slide-up"
            style={{
              backgroundColor: "var(--color-error-dim)",
              border: "1px solid var(--color-error)",
              color: "var(--color-error)",
            }}
          >
            <AlertTriangle size={12} />
            <span>{error}</span>
          </div>
        )}

        {/* JSON result — animated reveal */}
        {result && (
          <div className="mt-2 animate-reveal" style={{ animationDelay: "100ms" }}>
            <p className="text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>
              ▼ Gateway Response
            </p>
            <pre
              className="text-xs leading-relaxed p-3 rounded overflow-x-auto"
              style={{
                backgroundColor: "var(--color-bg-input)",
                border: "1px solid var(--color-border-light)",
                color: "var(--color-text-primary)",
              }}
            >
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* ── Status bar ─────────────────────────────────────── */}
      <div
        className="px-4 py-1.5 text-xs rounded-b-lg"
        style={{
          backgroundColor: "var(--color-bg-input)",
          borderTop: "0px solid var(--color-border-default)",
          color: "var(--color-text-secondary)",
        }}
      >
        <span className="flex items-center gap-1.5">
          <span
            className={`w-1.5 h-1.5 rounded-full ${loading ? "animate-breathe" : ""}`}
            style={{
              backgroundColor: loading
                ? "var(--color-warning)"
                : isFallbackActive
                  ? "var(--color-warning)"
                  : "var(--color-success)",
              transition: "background-color 300ms",
            }}
          />
          {loading ? "CONNECTING..." : isFallbackActive ? "FALLBACK" : "READY"}
          <span className="mx-1">|</span>
          PQC: ML-KEM-768
          <span className="mx-1">|</span>
          <span
            className="font-mono font-semibold"
            style={{ color: hardwareColor, transition: "color 300ms" }}
          >
            vLLM Hub: {vllmLabel}
          </span>
          {isFallbackActive && (
            <Activity size={12} style={{ color: "var(--color-warning)" }} />
          )}
        </span>
      </div>
    </div>
  );
}
