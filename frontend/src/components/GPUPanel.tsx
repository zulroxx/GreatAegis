import { Cpu, Thermometer, HardDrive, Gauge, Zap, Clock, AlertTriangle, Activity } from "lucide-react";
import useTelemetryPolling from "../hooks/useTelemetryPolling";

/**
 * GPU Telemetry Panel
 *
 * Displays live AMD Instinct MI300X device stats pulled from the
 * /api/v1/gateway/telemetry endpoint. Polls every 8 seconds.
 *
 * Shows: device name, temperature, VRAM usage bar, utilization %,
 * power draw, and clock speeds. Handles loading, error, and offline
 * device states with appropriate visual treatment.
 */
export default function GPUPanel() {
  const { data, loading, error } = useTelemetryPolling();

  /* ── Empty state: no backend yet ─────────────────────────── */
  if (loading && !data) {
    return (
      <div
        className="rounded-lg p-6 flex flex-col items-center justify-center gap-3"
        style={{
          backgroundColor: "var(--color-bg-card)",
          border: "1px solid var(--color-border-default)",
        }}
      >
        <div
          className="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "var(--color-border-light)", borderTopColor: "var(--color-accent)" }}
        />
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Loading GPU telemetry…
        </p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div
        className="rounded-lg p-6"
        style={{
          backgroundColor: "var(--color-error-dim)",
          border: "1px solid var(--color-error)",
        }}
      >
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--color-error)" }}>
          <AlertTriangle size={16} />
          <span>Could not reach GPU telemetry — {error}</span>
        </div>
      </div>
    );
  }

  if (!data || data.devices.length === 0) {
    return (
      <div
        className="rounded-lg p-6 flex flex-col items-center justify-center gap-3"
        style={{
          backgroundColor: "var(--color-bg-card)",
          border: "1px solid var(--color-border-default)",
          minHeight: "120px",
        }}
      >
        <Cpu size={32} style={{ color: "var(--color-text-muted)" }} />
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          No GPU devices detected
        </p>
        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          Telemetry mode: {data?.mode ?? "unknown"}
        </p>
      </div>
    );
  }

  const isOffline = data.hardware_status === "offline";

  return (
    <div
      className="rounded-lg p-5 animate-slide-up"
      style={{
        backgroundColor: "var(--color-bg-card)",
        border: "1px solid var(--color-border-default)",
      }}
    >
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--color-text-primary)" }}>
          <Cpu size={16} style={{ color: "var(--color-accent)" }} />
          AMD Instinct™ GPU Telemetry
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono" style={{ color: "var(--color-text-muted)" }}>
            {data.hostname}
          </span>
          <span className="text-[10px] font-mono" style={{ color: "var(--color-text-muted)" }}>
            {new Date(data.timestamp).toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* ── Offline banner ─────────────────────────────────── */}
      {isOffline && (
        <div
          className="mb-4 rounded-lg px-4 py-2 text-xs flex items-center gap-2 animate-bounce-in"
          style={{
            backgroundColor: "var(--color-warning-dim)",
            border: "1px solid var(--color-warning)",
            color: "var(--color-warning)",
          }}
        >
          <AlertTriangle size={14} />
          <span>AMD pod is offline — GPU telemetry shows placeholder values. Connect hardware to view live stats.</span>
        </div>
      )}

      {/* ── Device Cards ────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.devices.map((device, idx) => {
          const vramPercent = device.vram_total_gb > 0
            ? Math.round((device.vram_used_gb / device.vram_total_gb) * 100)
            : 0;

          const tempColor = device.temperature_c > 80
            ? "var(--color-error)"
            : device.temperature_c > 60
              ? "var(--color-warning)"
              : "var(--color-success)";

          const utilColor = device.utilization_pct > 80
            ? "var(--color-warning)"
            : device.utilization_pct > 0
              ? "var(--color-accent)"
              : "var(--color-text-muted)";

          const isZero = device.temperature_c === 0 && device.utilization_pct === 0;

          return (
            <div
              key={device.device_id}
              className="rounded-lg p-4 animate-slide-up"
              style={{
                backgroundColor: "var(--color-bg-input)",
                border: `1px solid ${isOffline ? "var(--color-warning)" : "var(--color-border-default)"}`,
                animationDelay: `${idx * 80}ms`,
              }}
            >
              {/* Device name row */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "var(--color-text-primary)" }}>
                  <Activity size={12} style={{ color: "var(--color-accent)" }} />
                  {device.name}
                  {isZero && (
                    <span className="text-[10px] font-mono" style={{ color: "var(--color-warning)" }}>
                      (awaiting connection)
                    </span>
                  )}
                </span>
                <span className="text-[10px] font-mono" style={{ color: "var(--color-text-muted)" }}>
                  MI300X #{device.device_id}
                </span>
              </div>

              {/* Stat grid */}
              <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                {/* Temperature */}
                <div className="flex items-center gap-2">
                  <Thermometer size={13} style={{ color: tempColor }} />
                  <div>
                    <p className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>Temp</p>
                    <p className="text-sm font-semibold font-mono" style={{ color: tempColor }}>
                      {device.temperature_c}°C
                    </p>
                  </div>
                </div>

                {/* Utilization */}
                <div className="flex items-center gap-2">
                  <Gauge size={13} style={{ color: utilColor }} />
                  <div>
                    <p className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>Utilization</p>
                    <p className="text-sm font-semibold font-mono" style={{ color: utilColor }}>
                      {device.utilization_pct}%
                    </p>
                  </div>
                </div>

                {/* VRAM */}
                <div className="flex items-center gap-2">
                  <HardDrive size={13} style={{ color: "var(--color-accent-blue)" }} />
                  <div className="flex-1">
                    <p className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                      VRAM
                    </p>
                    <p className="text-sm font-semibold font-mono" style={{ color: "var(--color-text-primary)" }}>
                      {device.vram_used_gb.toFixed(0)} / {device.vram_total_gb.toFixed(0)} GB
                    </p>
                    {/* Mini bar */}
                    <div
                      className="mt-1 h-1.5 rounded-full overflow-hidden"
                      style={{ backgroundColor: "var(--color-bg-base)" }}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(vramPercent, 100)}%`,
                          backgroundColor: vramPercent > 80 ? "var(--color-warning)" : "var(--color-accent-blue)",
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Power */}
                <div className="flex items-center gap-2">
                  <Zap size={13} style={{ color: "var(--color-warning)" }} />
                  <div>
                    <p className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>Power</p>
                    <p className="text-sm font-semibold font-mono" style={{ color: "var(--color-text-primary)" }}>
                      {device.power_watts.toFixed(0)}
                      <span className="text-xs text-muted"> / {device.power_cap_watts.toFixed(0)} W</span>
                    </p>
                  </div>
                </div>

                {/* Core Clock */}
                <div className="flex items-center gap-2">
                  <Clock size={13} style={{ color: "var(--color-text-muted)" }} />
                  <div>
                    <p className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>Core Clock</p>
                    <p className="text-sm font-semibold font-mono" style={{ color: "var(--color-text-secondary)" }}>
                      {device.sclk_mhz > 0 ? `${device.sclk_mhz} MHz` : "N/A"}
                    </p>
                  </div>
                </div>

                {/* Memory Clock */}
                <div className="flex items-center gap-2">
                  <Clock size={13} style={{ color: "var(--color-text-muted)" }} />
                  <div>
                    <p className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>Mem Clock</p>
                    <p className="text-sm font-semibold font-mono" style={{ color: "var(--color-text-secondary)" }}>
                      {device.mclk_mhz > 0 ? `${device.mclk_mhz} MHz` : "N/A"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
