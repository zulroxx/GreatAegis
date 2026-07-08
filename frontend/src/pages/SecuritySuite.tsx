import { useState } from "react";
import { ChevronDown, ChevronRight, FileSearch, Atom, Shield, Activity, AlertTriangle } from "lucide-react";
import QuantumRuleToggle from "../components/QuantumRuleToggle";
import useLogsPolling from "../hooks/useLogsPolling";
import useHealthPolling from "../hooks/useHealthPolling";

const RULES = [
  { label: "Enforce Client-Side ML-KEM/Kyber Key Wrapping", defaultEnabled: true },
  { label: "Zero-Trust Data-in-Transit Payload Encapsulation", defaultEnabled: true },
  { label: "Strict Safe-Compute Pod Isolation", defaultEnabled: true },
];

function formatSize(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function ClassificationBadge({ label }: { label: string }) {
  const isConfidential = label === "Highly Confidential";
  return (
    <span
      className="text-xs font-medium px-2 py-0.5 rounded-full"
      style={{
        backgroundColor: isConfidential ? "var(--color-error-dim)" : "var(--color-success-dim)",
        color: isConfidential ? "var(--color-error)" : "var(--color-success)",
        border: `1px solid ${isConfidential ? "var(--color-error)" : "var(--color-success)"}`,
      }}
    >
      {label}
    </span>
  );
}

export default function SecuritySuite() {
  const { logs, loading, error } = useLogsPolling();
  const { health } = useHealthPolling();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const isOnline = health?.hardware_status === "online";
  const isSimulated = health?.hardware_status === "simulated";

  const statusColor = isOnline
    ? "var(--color-success)"
    : isSimulated
      ? "var(--color-accent)"
      : "var(--color-warning)";

  const statusLabel = isOnline
    ? "ONLINE"
    : isSimulated
      ? "SIMULATED"
      : "OFFLINE";

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  });
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Security Suite
        </h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
          Post-quantum rule configuration &amp; threat capture log
        </p>
      </div>

      {/* ── Realtime AMD Secure Pod & vLLM Hub Status ────────────── */}
      <div
        className="flex items-center gap-4 px-4 py-2.5 rounded-lg text-xs animate-slide-up"
        style={{
          backgroundColor: "var(--color-bg-card)",
          border: "1px solid var(--color-border-default)",
        }}
      >
        <div className="flex items-center gap-1.5">
          <Shield size={14} style={{ color: "var(--color-text-muted)" }} />
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
            style={{ color: statusColor, fontSize: "0.65rem" }}
          >
            {statusLabel}
          </span>
        </div>

        <span style={{ color: "var(--color-border-light)" }}>|</span>

        <div className="flex items-center gap-1.5">
          <Activity size={14} style={{ color: "var(--color-text-muted)" }} />
          <span style={{ color: "var(--color-text-muted)" }}>vLLM Hub:</span>
          <span
            className="font-mono font-bold text-[10px]"
            style={{
              color: isOnline ? "var(--color-success)" : "var(--color-text-secondary)",
            }}
          >
            {health?.models_available?.join(", ") || "N/A"}
          </span>
        </div>

        <span style={{ color: "var(--color-border-light)" }}>|</span>

        <span style={{ color: "var(--color-text-muted)" }}>
          Mode: <span className="font-mono font-bold text-[10px] uppercase tracking-wider" style={{ color: "var(--color-text-secondary)" }}>{health?.app_mode ?? "unknown"}</span>
        </span>
      </div>

      {/* ── Quantum Rule Configuration ────────────────────────────── */}
      <div
        className="rounded-lg p-5"
        style={{
          backgroundColor: "var(--color-bg-card)",
          border: "1px solid var(--color-border-default)",
        }}
      >
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: "var(--color-text-primary)" }}>
          <Atom size={16} style={{ color: "var(--color-accent)" }} />
          Quantum Rule Configuration
        </h2>
        <div className="flex flex-col gap-2">
          {RULES.map((rule, idx) => (
            <div key={rule.label} className="animate-slide-up" style={{ animationDelay: `${idx * 80}ms` }}>
              <QuantumRuleToggle
                label={rule.label}
                defaultEnabled={rule.defaultEnabled}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── Threat Capture Log Explorer ──────────────────────────── */}
      <div
        className="rounded-lg overflow-hidden"
        style={{
          backgroundColor: "var(--color-bg-card)",
          border: "1px solid var(--color-border-default)",
        }}
      >
        <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--color-border-default)" }}>
          <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--color-text-primary)" }}>
            <Shield size={16} style={{ color: "var(--color-accent)" }} />
            Threat Capture Log Explorer
          </h2>
          {!loading && (
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              {logs.length} entries
            </span>
          )}
        </div>

        {error && (
          <div className="px-5 py-3 text-sm" style={{ color: "var(--color-error)" }}>
            <AlertTriangle size={14} style={{ color: "var(--color-error)" }} /> {error}
          </div>
        )}

        {loading && logs.length === 0 ? (
          <div className="p-8 flex flex-col items-center justify-center gap-3">
            <div
              className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: "var(--color-border-light)", borderTopColor: "var(--color-accent)" }}
            />
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              Loading threat logs…
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                  <th className="text-left font-medium px-4 py-2.5 w-8" style={{ color: "var(--color-text-muted)" }}></th>
                  <th className="text-left font-medium px-4 py-2.5" style={{ color: "var(--color-text-muted)" }}>Timestamp</th>
                  <th className="text-left font-medium px-4 py-2.5" style={{ color: "var(--color-text-muted)" }}>File Name</th>
                  <th className="text-left font-medium px-4 py-2.5" style={{ color: "var(--color-text-muted)" }}>Classification</th>
                  <th className="text-left font-medium px-4 py-2.5" style={{ color: "var(--color-text-muted)" }}>Size</th>
                  <th className="text-left font-medium px-4 py-2.5" style={{ color: "var(--color-text-muted)" }}>Ciphertext</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((entry, idx) => {
                  const isExpanded = expandedRows.has(entry.id);
                  return (
                    <tr key={entry.id} className="animate-slide-up" style={{ borderBottom: "1px solid var(--color-border-default)", animationDelay: `${idx * 30}ms` }}>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleRow(entry.id)}
                          className="focus:outline-none"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--color-text-primary)" }}>
                        {entry.timestamp}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--color-text-secondary)" }}>
                        {entry.file_name}
                      </td>
                      <td className="px-4 py-3">
                        <ClassificationBadge label={entry.classification} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--color-text-secondary)" }}>
                        {formatSize(entry.file_size)}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleRow(entry.id)}
                          className="flex items-center gap-1.5 text-xs font-medium transition-colors duration-150"
                          style={{
                            color: isExpanded ? "var(--color-accent)" : "var(--color-text-secondary)",
                          }}
                        >
                          <FileSearch size={12} />
                          {isExpanded ? "Hide" : "Inspect Ciphertext"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Expanded ciphertext rows rendered below the table */}
            {Array.from(expandedRows).map((id) => {
              const entry = logs.find((l) => l.id === id);
              if (!entry) return null;
              return (
                <div
                  key={`ct-${id}`}
                  className="px-10 py-3 animate-slide-down"
                  style={{
                    backgroundColor: "var(--color-bg-input)",
                    borderBottom: "1px solid var(--color-border-default)",
                  }}
                >
                  <p className="text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>
                    ML-KEM Ciphertext (hex)
                  </p>
                  <code
                    className="text-xs leading-relaxed break-all select-all"
                    style={{
                      color: "var(--color-accent)",
                      fontFamily: 'ui-monospace, "SF Mono", "Fira Code", monospace',
                    }}
                  >
                    {entry.ciphertext}
                  </code>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
