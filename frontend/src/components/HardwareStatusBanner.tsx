import { AlertTriangle, Shield, Waypoints, Activity, Lock, Monitor, Cloud, ServerOff } from "lucide-react";
import type { InspectResponse } from "../types/api";
import useHealthPolling from "../hooks/useHealthPolling";

interface HardwareStatusBannerProps {
  inspectResponse: InspectResponse | null;
  demoMode?: "casual" | "sovereign" | "fallback";
  /** Called when the user clicks the demo/live toggle switch. */
  onToggleMode?: () => void;
}

/**
 * Network & Hardware Status Widget.
 *
 * AMD Secure Pod status is driven by a realtime 5-second health poll
 * (never hardcoded). Routing verdict and PQC encryption state come from
 * the `inspectResponse` when a prompt has been submitted.
 *
 * A sliding pill toggle at the top-left switches between demo (simulated) and
 * live (backend) modes. When live mode is active but the backend is unreachable,
 * the pod status clearly shows "UNREACHABLE" instead of stale data.
 */
export default function HardwareStatusBanner({
  inspectResponse,
  demoMode,
  onToggleMode,
}: HardwareStatusBannerProps) {
  /* ── Realtime health poll: always live, never hardcoded ────── */
  const { health, loading: healthLoading, reachable } = useHealthPolling();

  /* ── Always render the mode toggle, even when empty ─────── */
  const isDemoMode = Boolean(demoMode);

  /* ── Derive hardware status ─────────────────────────────────── */
  const rawStatus = health?.hardware_status ?? inspectResponse?.hardware_status ?? null;

  /* In demo mode, the demoMode prop overrides the live status so that
     "SIMULATE AMD POD CRASH" (fallback) shows as offline in the UI.
     In live mode with an unreachable backend, show offline too. */
  const liveStatus = demoMode === "fallback"
    ? "offline"
    : !isDemoMode && !reachable
      ? "unreachable"
      : rawStatus;

  const liveAppMode = health?.app_mode ?? null;
  const liveModels = health?.models_available ?? [];

  const isOnline = liveStatus === "online";
  const isSimulated = liveStatus === "simulated";
  const isOffline = liveStatus === "offline" || liveStatus === "unreachable";
  const isUnreachable = liveStatus === "unreachable";

  const statusColor = isOnline
    ? "var(--color-success)"
    : isSimulated
      ? "var(--color-accent)"
      : isUnreachable
        ? "var(--color-error)"
        : "var(--color-warning)";

  const statusBg = isOnline
    ? "rgba(0, 201, 167, 0.08)"
    : isSimulated
      ? "rgba(0, 128, 255, 0.06)"
      : isUnreachable
        ? "rgba(239, 68, 68, 0.08)"
        : "rgba(221, 107, 32, 0.1)";

  const statusLabel = isOnline
    ? "ONLINE"
    : isSimulated
      ? "SIMULATED"
      : isUnreachable
        ? "UNREACHABLE"
        : "OFFLINE";

  /* ── PQC / encryption from inspectResponse (only after a prompt) ── */
  const isEncrypted = inspectResponse?.encryption_status === "active";
  const pqcActive = inspectResponse?.pqc_validation_flag && inspectResponse?.pqc_signature;

  /* ── Has anything to show? ────────────────────────────────── */
  const hasData = Boolean(liveStatus) || Boolean(inspectResponse);

  /* ── Empty state: no data yet, just show the toggle ────────── */
  if (!hasData && healthLoading) {
    return (
      <div className="w-full mb-4">
        <div
          className="flex items-center gap-4 px-3 py-2 rounded-lg text-xs"
          style={{
            backgroundColor: "var(--color-bg-card)",
            border: "0px solid var(--color-border-default)",
          }}
        >
          {/* DEMO / LIVE sliding pill toggle */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleMode}
              className="relative flex items-center h-7 w-[130px] rounded-full cursor-pointer select-none overflow-hidden active:scale-95 transition-transform duration-150"
              style={{
                backgroundColor: "var(--color-bg-input)",
                border: "0px solid var(--color-border-default)",
                outline: "none",
              }}
              aria-label={`Switch to ${isDemoMode ? "live" : "demo"} mode`}
              title={`Currently in ${isDemoMode ? "demo" : "live"} mode — click to switch`}
            >
              {/* Sliding active indicator */}
              <div
                className="absolute top-0.5 bottom-0.5 w-[62px] rounded-full transition-all duration-300 ease-out"
                style={{
                  transform: isDemoMode ? "translateX(2px)" : "translateX(66px)",
                  backgroundColor: isDemoMode
                    ? "rgba(0, 230, 118, 0.12)"
                    : "rgba(74, 158, 255, 0.1)",
                  border: `1px solid ${
                    isDemoMode
                      ? "rgba(0, 230, 118, 0.25)"
                      : "rgba(74, 158, 255, 0.25)"
                  }`,
                }}
              />
              {/* "demo" half */}
              <span
                className="flex-1 flex items-center justify-center gap-1 z-10 transition-all duration-300"
                style={{ padding: "0 4px" }}
              >
                <Monitor
                  size={10}
                  className="transition-colors duration-300"
                  style={{
                    color: isDemoMode ? "var(--color-accent)" : "var(--color-text-muted)",
                  }}
                />
                <span
                  className="font-mono font-bold text-[9px] uppercase tracking-widest transition-colors duration-300"
                  style={{
                    color: isDemoMode ? "var(--color-accent)" : "var(--color-text-muted)",
                  }}
                >
                  demo
                </span>
              </span>
              {/* "live" half */}
              <span
                className="flex-1 flex items-center justify-center gap-1 z-10 transition-all duration-300"
                style={{ padding: "0 4px" }}
              >
                <Cloud
                  size={10}
                  className="transition-colors duration-300"
                  style={{
                    color: !isDemoMode ? "#4A9EFF" : "var(--color-text-muted)",
                  }}
                />
                <span
                  className="font-mono font-bold text-[9px] uppercase tracking-widest transition-colors duration-300"
                  style={{
                    color: !isDemoMode ? "#4A9EFF" : "var(--color-text-muted)",
                  }}
                >
                  live
                </span>
              </span>
            </button>
            <span
              className="inline-block h-1.5 w-1.5 rounded-full transition-all duration-300"
              style={{
                backgroundColor: isDemoMode ? "var(--color-accent)" : "#4A9EFF",
                opacity: 0.5,
              }}
            />
          </div>

          <span style={{ color: "var(--color-text-muted)" }}>
            Contacting backend...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3 mb-4">
      {/* ── Dynamic Hardware Status Pills ──────────────────────── */}
      <div
        className="flex items-center gap-4 px-3 py-2 rounded-lg text-xs animate-slide-up"
        style={{
          backgroundColor: "var(--color-bg-card)",
          border: "0px solid var(--color-border-default)",
        }}
      >
        {/* DEMO / LIVE sliding pill toggle */}
        <button
          type="button"
          onClick={onToggleMode}
          className="relative flex items-center h-7 w-[130px] rounded-full cursor-pointer select-none overflow-hidden active:scale-95 transition-transform duration-150 flex-shrink-0"
          style={{
            backgroundColor: "var(--color-bg-input)",
            border: "0px solid var(--color-border-default)",
            outline: "none",
          }}
          aria-label={`Switch to ${isDemoMode ? "live" : "demo"} mode`}
          title={`Currently in ${isDemoMode ? "demo" : "live"} mode — click to switch`}
        >
          {/* Sliding active indicator */}
          <div
            className="absolute top-0.5 bottom-0.5 w-[62px] rounded-full transition-all duration-300 ease-out"
            style={{
              transform: isDemoMode ? "translateX(2px)" : "translateX(66px)",
              backgroundColor: isDemoMode
                ? "rgba(0, 230, 118, 0.12)"
                : "rgba(74, 158, 255, 0.1)",
              border: `1px solid ${
                isDemoMode
                  ? "rgba(0, 230, 118, 0.25)"
                  : "rgba(74, 158, 255, 0.25)"
              }`,
            }}
          />
          {/* "demo" half */}
          <span
            className="flex-1 flex items-center justify-center gap-1 z-10 transition-all duration-300"
            style={{ padding: "0 4px" }}
          >
            <Monitor
              size={10}
              className="transition-colors duration-300"
              style={{
                color: isDemoMode ? "var(--color-accent)" : "var(--color-text-muted)",
              }}
            />
            <span
              className="font-mono font-bold text-[9px] uppercase tracking-widest transition-colors duration-300"
              style={{
                color: isDemoMode ? "var(--color-accent)" : "var(--color-text-muted)",
              }}
            >
              demo
            </span>
          </span>
          {/* "live" half */}
          <span
            className="flex-1 flex items-center justify-center gap-1 z-10 transition-all duration-300"
            style={{ padding: "0 4px" }}
          >
            <Cloud
              size={10}
              className="transition-colors duration-300"
              style={{
                color: !isDemoMode ? "#4A9EFF" : "var(--color-text-muted)",
              }}
            />
            <span
              className="font-mono font-bold text-[9px] uppercase tracking-widest transition-colors duration-300"
              style={{
                color: !isDemoMode ? "#4A9EFF" : "var(--color-text-muted)",
              }}
            >
              live
            </span>
          </span>
        </button>

        {/* AMD Secure Pod status (from realtime health poll) */}
        <div className="flex items-center gap-1.5">
          <Shield
            size={13}
            style={{ color: "var(--color-text-muted)" }}
          />
          <span style={{ color: "var(--color-text-muted)" }}>
            AMD Secure Pod:
          </span>
          <span
            className={`inline-block h-2 w-2 rounded-full ${isOnline ? "animate-breathe" : ""}`}
            style={{
              backgroundColor: statusColor,
              transition: "background-color 300ms",
            }}
          />
          <span
            className="font-mono font-bold uppercase tracking-wider"
            style={{
              color: statusColor,
              fontSize: "0.65rem",
              transition: "color 300ms",
            }}
          >
            {statusLabel}
          </span>
          {isUnreachable && (
            <ServerOff
              size={11}
              className="inline-block ml-0.5"
              style={{ color: "var(--color-error)" }}
            />
          )}
        </div>

        {/* vLLM Hub models (from realtime health poll) */}
        {liveModels.length > 0 && (
          <>
            <span style={{ color: "var(--color-border-light)" }}>|</span>
            <div className="flex items-center gap-1">
              <Activity size={12} style={{ color: "var(--color-text-muted)" }} />
              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                vLLM Hub:
              </span>
              {liveModels.map((model, i) => (
                <span
                  key={model}
                  className="font-mono font-bold text-[10px]"
                  style={{
                    color: isOnline ? "var(--color-success)" : "var(--color-text-secondary)",
                  }}
                >
                  {model}{i < liveModels.length - 1 ? "," : ""}
                </span>
              ))}
              {!isOnline && (
                <span
                  className="font-mono font-bold text-[10px]"
                  style={{ color: "var(--color-warning)" }}
                >
                  (unreachable)
                </span>
              )}
            </div>
          </>
        )}

        {/* Route verdict (from inspectResponse) */}
        {inspectResponse && (
          <>
            <span style={{ color: "var(--color-border-light)" }}>|</span>
            <div className="flex items-center gap-1">
              <Waypoints
                size={12}
                style={{ color: "var(--color-text-muted)" }}
              />
              <span style={{ color: "var(--color-text-muted)" }}>Route:</span>
              <span
                className="font-mono font-semibold"
                style={{
                  color: inspectResponse.fallback_engaged ? "var(--color-warning)" : "var(--color-accent)",
                  transition: "color 300ms",
                }}
              >
                {inspectResponse.routing_verdict.replace(/_/g, " ")}
              </span>
            </div>
          </>
        )}

        {/* Encryption / PQC indicator (from inspectResponse) */}
        {pqcActive && (
          <>
            <span style={{ color: "var(--color-border-light)" }}>|</span>
            <div className="flex items-center gap-1">
              <Lock
                size={12}
                style={{
                  color: "var(--color-success)",
                  filter: "drop-shadow(0 0 4px rgba(0, 230, 118, 0.6))",
                }}
              />
              <span
                className="font-mono font-semibold"
                style={{ color: "var(--color-success)" }}
              >
                PQC ACTIVE ({inspectResponse!.pqc_algorithm || "ML-KEM-768 + ML-DSA-65"})
              </span>
            </div>
          </>
        )}

        {isEncrypted && !pqcActive && (
          <>
            <span style={{ color: "var(--color-border-light)" }}>|</span>
            <div className="flex items-center gap-1">
              <Activity
                size={12}
                style={{ color: "var(--color-warning)" }}
              />
              <span
                className="font-mono font-semibold"
                style={{ color: "var(--color-warning)" }}
              >
                Encrypted Tunnel
              </span>
            </div>
          </>
        )}
      </div>

      {/* ── High-Alert Warning Banner ────────────────────────────── */}
      {isUnreachable && (
        <div
          className="rounded-xl text-xs leading-relaxed flex flex-col gap-1.5 animate-bounce-in"
          style={{
            backgroundColor: "rgba(239, 68, 68, 0.08)",
            border: "2px solid rgba(239, 68, 68, 0.4)",
            padding: "14px",
          }}
        >
          <div
            className="flex items-center gap-2 font-bold uppercase tracking-wide"
            style={{ color: "var(--color-error)", fontSize: "0.65rem" }}
          >
            <ServerOff size={15} style={{ color: "var(--color-error)" }} />
            Backend Server Unreachable
          </div>

          <p style={{ color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
            The GreatAegis API server is not responding. The health endpoint at{" "}
            <code className="font-mono text-[10px]" style={{ color: "var(--color-text-muted)" }}>
              http://localhost:8060/api/v1/gateway/health
            </code>{" "}
            could not be reached. Make sure the Python backend is running, then
            switch back to <strong>demo</strong> mode to explore the interface
            with simulated data.
          </p>

          <p
            className="font-mono text-[10px] mt-1"
            style={{ color: "var(--color-text-muted)" }}
          >
            Retrying every 5s automatically — status will update once the server is detected.
          </p>
        </div>
      )}

      {/* ── Fallback / Offline Warning Banner ────────────────────── */}
      {isOffline && !isUnreachable && (
        <div
          className="rounded-xl text-xs leading-relaxed flex flex-col gap-1.5 animate-bounce-in"
          style={{
            backgroundColor: statusBg,
            border: "2px solid rgba(221, 107, 32, 0.5)",
            padding: "14px",
          }}
        >
          <div
            className="flex items-center gap-2 font-bold uppercase tracking-wide"
            style={{ color: "var(--color-warning)", fontSize: "0.65rem" }}
          >
            <AlertTriangle size={15} style={{ color: "var(--color-warning)" }} />
            AMD Secure Node Offline — Autonomous Zero-Trust Failover Engaged
          </div>

          <p style={{ color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
            {inspectResponse?.routing_reason || (
              <>
                The local AMD Instinct™ Secure Compute Pod has experienced a
                connection fault. GreatAegis has autonomously rerouted all traffic
                through an encrypted tunnel fallback path. Corporate data
                sovereignty is maintained via end-to-end cryptography-in-transit.
              </>
            )}
          </p>

          {inspectResponse?.target_model && (
            <p
              className="font-mono text-[10px] mt-1"
              style={{ color: "var(--color-text-muted)" }}
            >
              Fallback target: {inspectResponse.target_model}
            </p>
          )}

          <p
            className="font-mono text-[10px] mt-1"
            style={{ color: "var(--color-text-muted)" }}
          >
            Mode: {liveAppMode ?? "unknown"} | Health poll: every 5s
          </p>
        </div>
      )}
    </div>
  );
}
