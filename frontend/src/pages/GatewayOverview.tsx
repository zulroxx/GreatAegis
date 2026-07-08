import { LayoutDashboard, AlertTriangle, Shield, Activity, ExternalLink, Database, DollarSign, Zap, ServerOff } from "lucide-react";
import MetricRibbon from "../components/MetricRibbon";
import AnalyticsChart from "../components/AnalyticsChart";
import GPUPanel from "../components/GPUPanel";
import useMetricsPolling from "../hooks/useMetricsPolling";
import useHealthPolling from "../hooks/useHealthPolling";
import { useState, useEffect } from "react";
import type { FireworksUsageResponse } from "../types/api";

const API_BASE = "http://localhost:8000";

export default function GatewayOverview() {
  const { data, loading, error } = useMetricsPolling();
  const { health, loading: healthLoading, reachable } = useHealthPolling();

  const [fireworksUsage, setFireworksUsage] = useState<FireworksUsageResponse | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);

  // Fetch Fireworks usage if API key is stored
  useEffect(() => {
    const key = localStorage.getItem("GREATAEGIS_FIREWORKS_API_KEY");
    if (!key) return;

    let cancelled = false;
    const fetchUsage = async () => {
      setUsageLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/v1/fireworks/usage`, {
          headers: { "X-Api-Key": key },
        });
        if (res.ok && !cancelled) {
          const json: FireworksUsageResponse = await res.json();
          setFireworksUsage(json);
        }
      } catch {
        // Silently ignore — usage is non-critical
      } finally {
        if (!cancelled) setUsageLoading(false);
      }
    };

    fetchUsage();
    const interval = setInterval(fetchUsage, 30_000); // every 30s
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const isOnline = health?.hardware_status === "online" && reachable;
  const isSimulated = health?.hardware_status === "simulated" && reachable;
  const isOffline = health?.hardware_status === "offline" || !reachable;
  const isUnreachable = !reachable && !healthLoading;

  const statusColor = isOnline
    ? "var(--color-success)"
    : isSimulated
      ? "var(--color-accent)"
      : isUnreachable
        ? "var(--color-error)"
        : "var(--color-warning)";

  const statusLabel = isOnline
    ? "ONLINE"
    : isSimulated
      ? "SIMULATED"
      : isUnreachable
        ? "UNREACHABLE"
        : "OFFLINE";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Gateway Zone Overview
        </h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
          Real-time cluster metrics &amp; traffic analytics
        </p>
      </div>

      {/* ── Realtime AMD Secure Pod & vLLM Hub Status ────────────── */}
      {!healthLoading && (
        <div
          className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-2.5 rounded-lg text-xs animate-slide-up"
          style={{
            backgroundColor: "var(--color-bg-card)",
            border: "1px solid var(--color-border-default)",
          }}
        >
          {/* AMD Secure Pod */}
          <div className="flex items-center gap-1.5">
            <Shield size={14} style={{ color: "var(--color-text-muted)" }} />
            <span style={{ color: "var(--color-text-muted)" }}>
              AMD Secure Pod:
            </span>
            <span
              className={`inline-block h-2 w-2 rounded-full`}
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

          <span className="hidden sm:inline" style={{ color: "var(--color-border-light)" }}>|</span>

          {/* vLLM Hub models */}
          <div className="flex items-center gap-1.5">
            <Activity size={14} style={{ color: "var(--color-text-muted)" }} />
            <span style={{ color: "var(--color-text-muted)" }}>
              vLLM Hub:
            </span>
            {health?.models_available && health.models_available.length > 0 ? (
              <span
                className="font-mono font-bold text-[10px]"
                style={{
                  color: isOnline ? "var(--color-success)" : "var(--color-text-secondary)",
                }}
              >
                {health.models_available.join(", ")}
              </span>
            ) : (
              <span className="font-mono text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                N/A
              </span>
            )}
          </div>

          <span className="hidden sm:inline" style={{ color: "var(--color-border-light)" }}>|</span>

          {/* App mode */}
          <div className="flex items-center gap-1.5">
            <LayoutDashboard size={13} style={{ color: "var(--color-text-muted)" }} />
            <span style={{ color: "var(--color-text-muted)" }}>
              Mode:
            </span>
            <span
              className="font-mono font-bold text-[10px] uppercase tracking-wider"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {health?.app_mode ?? "unknown"}
            </span>
          </div>
        </div>
      )}

      {/* ── Unreachable Backend Warning ─────────────────────────── */}
      {isUnreachable && (
        <div
          className="rounded-lg px-4 py-3 text-sm leading-relaxed flex flex-col gap-1.5 animate-bounce-in"
          style={{
            backgroundColor: "rgba(239, 68, 68, 0.08)",
            border: "2px solid rgba(239, 68, 68, 0.4)",
            color: "var(--color-error)",
          }}
        >
          <div className="flex items-center gap-2 font-bold uppercase tracking-wide text-[0.65rem]">
            <ServerOff size={15} /> Backend Server Unreachable
          </div>
          <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
            The GreatAegis API server is not responding. Make sure it is running on
            port 8000. Data will appear once the server is detected (retrying every
            5s).
          </p>
        </div>
      )}

      {error && (
        <div
          className="rounded-lg px-4 py-3 text-sm"
          style={{
            backgroundColor: "var(--color-error-dim)",
            border: "1px solid var(--color-error)",
            color: "var(--color-error)",
          }}
        >
          <AlertTriangle size={16} style={{ color: "var(--color-error)" }} /> Could not reach backend — {error}. Make sure the API server is running on port 8000.
        </div>
      )}

      {loading && !data ? (
        <div
          className="rounded-lg p-8 flex flex-col items-center justify-center gap-3"
          style={{
            backgroundColor: "var(--color-bg-card)",
            border: "1px solid var(--color-border-default)",
            minHeight: "300px",
          }}
        >
          <div
            className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: "var(--color-border-light)", borderTopColor: "var(--color-accent)" }}
          />
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            Loading gateway metrics…
          </p>
        </div>
      ) : data ? (
        <>
          <div className="animate-slide-up">
            <MetricRibbon data={data} />
          </div>
          <div className="animate-slide-up" style={{ animationDelay: "150ms" }}>
            <AnalyticsChart data={data.chart_data} />
          </div>
          <div className="animate-slide-up" style={{ animationDelay: "300ms" }}>
            <GPUPanel />
          </div>

          {/* ── Fireworks AI Usage Card ──────────────────────── */}
          {fireworksUsage && (
            <div className="animate-slide-up" style={{ animationDelay: "400ms" }}>
              <div
                className="rounded-lg p-5"
                style={{
                  backgroundColor: "var(--color-bg-card)",
                  border: "1px solid var(--color-border-default)",
                }}
              >
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-4" style={{ color: "var(--color-text-primary)" }}>
                  <ExternalLink size={15} style={{ color: "var(--color-accent)" }} />
                  Fireworks AI Usage
                  {usageLoading && (
                    <span className="w-3 h-3 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--color-border-light)", borderTopColor: "var(--color-accent)" }} />
                  )}
                  <span className="ml-auto text-[10px] font-normal" style={{ color: "var(--color-text-muted)" }}>
                    Source: {fireworksUsage.source === "fireworks_api" ? "Live API" : "Estimated"}
                  </span>
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                      <Zap size={12} /> Total Tokens
                    </div>
                    <span className="text-lg font-bold font-mono" style={{ color: "var(--color-text-primary)" }}>
                      {fireworksUsage.total_tokens.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                      <Database size={12} /> Prompt
                    </div>
                    <span className="text-lg font-bold font-mono" style={{ color: "var(--color-text-primary)" }}>
                      {fireworksUsage.prompt_tokens.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                      <Activity size={12} /> Completion
                    </div>
                    <span className="text-lg font-bold font-mono" style={{ color: "var(--color-text-primary)" }}>
                      {fireworksUsage.completion_tokens.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                      <DollarSign size={12} /> Est. Cost
                    </div>
                    <span className="text-lg font-bold font-mono" style={{ color: "var(--color-accent)" }}>
                      ${fireworksUsage.estimated_cost_usd.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div
          className="rounded-lg p-8 flex flex-col items-center justify-center"
          style={{
            backgroundColor: "var(--color-bg-card)",
            border: "1px solid var(--color-border-default)",
            minHeight: "300px",
          }}
        >
          <LayoutDashboard size={36} style={{ color: "var(--color-text-muted)" }} />
          <p className="text-sm mt-3" style={{ color: "var(--color-text-muted)" }}>
            No data available
          </p>
        </div>
      )}
    </div>
  );
}
