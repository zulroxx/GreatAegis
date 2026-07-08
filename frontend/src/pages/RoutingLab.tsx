import { useState, useCallback, useEffect, useRef } from "react";
import {
  FlaskConical,
  Beaker,
  AlertTriangle,
  Shield,
  Loader2,
  ChevronDown,
  CheckCircle2,
  XCircle,
  ArrowRight,
} from "lucide-react";
import QuantumRuleToggle from "../components/QuantumRuleToggle";
import {
  simulateRoute,
  type RoutingResult,
  type RoutingProfile,
} from "../utils/routingSimulator";

/* ── Constants ──────────────────────────────────────────────────────── */

const RULES = [
  { label: "Enforce Client-Side ML-KEM/Kyber Key Wrapping", defaultEnabled: true },
  { label: "Zero-Trust Data-in-Transit Payload Encapsulation", defaultEnabled: true },
  { label: "Strict Safe-Compute Pod Isolation", defaultEnabled: true },
];

const ROUTING_PROFILES: { value: RoutingProfile; label: string }[] = [
  { value: "auto", label: "Auto (classify from prompt)" },
  { value: "compliance", label: "Compliance (force Gemma)" },
  { value: "deep-inference", label: "Deep Inference (force Mixtral)" },
];

const EXAMPLE_PROMPT = "What is the Q4 financial forecast for the merger acquisition?";

/* ── Helpers ────────────────────────────────────────────────────────── */

function getRiskColor(score: number): string {
  if (score >= 80) return "var(--color-error)";
  if (score >= 40) return "var(--color-warning)";
  return "var(--color-success)";
}

function getRiskLabel(score: number): string {
  if (score >= 80) return "CRITICAL";
  if (score >= 40) return "ELEVATED";
  return "LOW";
}

function getVerdictColor(verdict: string): { bg: string; border: string; text: string } {
  switch (verdict) {
    case "public_fireworks":
      return { bg: "var(--color-success-dim)", border: "color-mix(in srgb, var(--color-success) 30%, transparent)", text: "var(--color-success)" };
    case "private_gemma":
      return { bg: "rgba(0, 230, 118, 0.08)", border: "color-mix(in srgb, var(--color-accent) 30%, transparent)", text: "var(--color-accent)" };
    case "private_mixtral":
      return { bg: "var(--color-accent-dim)", border: "color-mix(in srgb, var(--color-accent) 30%, transparent)", text: "var(--color-accent)" };
    case "secure_fallback":
      return { bg: "rgba(243, 128, 32, 0.1)", border: "rgba(243, 128, 32, 0.3)", text: "var(--color-warning)" };
    default:
      return { bg: "var(--color-accent-dim)", border: "color-mix(in srgb, var(--color-accent) 30%, transparent)", text: "var(--color-text-secondary)" };
  }
}

/* ── Risk Score Ring ────────────────────────────────────────────────── */

function RiskScoreRing({ score }: { score: number }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const color = getRiskColor(score);
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="104" height="104" viewBox="0 0 104 104" className="drop-shadow-lg">
        {/* Background ring */}
        <circle
          cx="52"
          cy="52"
          r={radius}
          fill="none"
          stroke="var(--color-border-light)"
          strokeWidth="6"
          opacity={0.3}
        />
        {/* Foreground arc */}
        <circle
          cx="52"
          cy="52"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 52 52)"
          style={{ transition: "stroke-dashoffset 600ms ease-out, stroke 300ms" }}
        />
        {/* Center text */}
        <text
          x="52"
          y="48"
          textAnchor="middle"
          dominantBaseline="central"
          fill={color}
          fontSize="28"
          fontWeight="700"
          fontFamily="'Fira Code', monospace"
          style={{ transition: "fill 300ms" }}
        >
          {score}
        </text>
        <text
          x="52"
          y="68"
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--color-text-muted)"
          fontSize="9"
          fontWeight="500"
          fontFamily="'Space Grotesk', sans-serif"
        >
          / 100
        </text>
      </svg>
      <span
        className="text-[10px] font-bold uppercase tracking-widest"
        style={{ color }}
      >
        {getRiskLabel(score)}
      </span>
    </div>
  );
}

/* ── Keyword Badge ──────────────────────────────────────────────────── */

function KeywordBadge({ keyword }: { keyword: string }) {
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-medium transition-all duration-150"
      style={{
        backgroundColor: "rgba(255, 82, 82, 0.1)",
        border: "1px solid rgba(255, 82, 82, 0.3)",
        color: "var(--color-error)",
      }}
    >
      {keyword}
    </span>
  );
}

/* ── Workload Badge ─────────────────────────────────────────────────── */

function WorkloadBadge({ type }: { type: string | null }) {
  if (!type) return null;

  const styles: Record<string, { bg: string; border: string; color: string }> = {
    compliance: {
      bg: "rgba(0, 230, 118, 0.08)",
      border: "color-mix(in srgb, var(--color-accent) 30%, transparent)",
      color: "var(--color-accent)",
    },
    "deep-inference": {
      bg: "rgba(243, 128, 32, 0.1)",
      border: "rgba(243, 128, 32, 0.3)",
      color: "var(--color-warning)",
    },
    general: {
      bg: "var(--color-accent-dim)",
      border: "color-mix(in srgb, var(--color-accent) 20%, transparent)",
      color: "var(--color-text-secondary)",
    },
  };

  const s = styles[type] ?? styles.general;

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium"
      style={{ backgroundColor: s.bg, border: `1px solid ${s.border}`, color: s.color }}
    >
      <Beaker size={12} />
      {type === "deep-inference" ? "Deep Inference" : type.charAt(0).toUpperCase() + type.slice(1)}
    </span>
  );
}

/* ── Condition Evaluation Row ───────────────────────────────────────── */

function ConditionRow({
  label,
  value,
  passes,
  isFinal,
}: {
  label: string;
  value: string | boolean;
  passes?: boolean;
  isFinal?: boolean;
}) {
  const displayValue = typeof value === "boolean" ? (value ? "true" : "false") : value;

  return (
    <tr
      className="animate-slide-right"
      style={{
        borderBottom: "1px solid var(--color-border-light)",
        opacity: isFinal ? 0.85 : 1,
      }}
    >
      <td
        className="py-2 pr-3 text-xs"
        style={{
          color: isFinal ? "var(--color-accent)" : "var(--color-text-secondary)",
          fontFamily: isFinal ? "'Fira Code', monospace" : "inherit",
          fontWeight: isFinal ? 600 : 400,
        }}
      >
        {label}
      </td>
      <td
        className="py-2 px-3 text-xs font-mono text-right"
        style={{ color: "var(--color-text-primary)" }}
      >
        {displayValue}
      </td>
      <td className="py-2 pl-3 text-right">
        {passes !== undefined ? (
          passes ? (
            <CheckCircle2 size={14} style={{ color: "var(--color-success)" }} />
          ) : (
            <XCircle size={14} style={{ color: "var(--color-error)" }} />
          )
        ) : isFinal ? (
          <ArrowRight size={14} style={{ color: "var(--color-accent)" }} />
        ) : null}
      </td>
    </tr>
  );
}

/* ── Main Component ─────────────────────────────────────────────────── */

export default function RoutingLab() {
  const [prompt, setPrompt] = useState(EXAMPLE_PROMPT);
  const [routingProfile, setRoutingProfile] = useState<RoutingProfile>("auto");
  const [profileOpen, setProfileOpen] = useState(false);
  const [result, setResult] = useState<RoutingResult | null>(null);
  const [stale, setStale] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  // Flag results as stale when toggles change
  const handleStaleToggle = useCallback(() => {
    if (result) setStale(true);
  }, [result]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }
  }, [prompt]);

  const handleSimulate = useCallback(() => {
    const trimmed = prompt.trim();
    if (!trimmed) return;

    setSimulating(true);
    setStale(false);

    // Small delay for UX feedback
    setTimeout(() => {
      // Read current quantum rule state from localStorage
      const getRule = (label: string, defaultVal = true): boolean => {
        try {
          const stored = localStorage.getItem("great-aegis-quantum-rule-" + label);
          if (stored !== null) return stored === "true";
        } catch {
          /* ignore */
        }
        return defaultVal;
      };

      const quantumEncryptionEnabled = getRule("Enforce Client-Side ML-KEM/Kyber Key Wrapping");
      const zeroTrustEnabled = getRule("Zero-Trust Data-in-Transit Payload Encapsulation");
      const podIsolationEnabled = getRule("Strict Safe-Compute Pod Isolation");

      const simulationResult = simulateRoute(
        trimmed,
        { quantumEncryptionEnabled, zeroTrustEnabled, podIsolationEnabled },
        routingProfile,
      );

      setResult(simulationResult);
      setSimulating(false);

      // Scroll result into view on mobile
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }, 200);
  }, [prompt, routingProfile]);

  const selectedProfile = ROUTING_PROFILES.find((p) => p.value === routingProfile) ?? ROUTING_PROFILES[0];

  return (
    <div className="flex flex-col gap-5">
      {/* ── Page Header ────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2" style={{ color: "var(--color-text-primary)" }}>
          <FlaskConical size={22} style={{ color: "var(--color-accent)" }} />
          Routing Lab
        </h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
          Simulate the hybrid router's decision logic — test how quantum rules, risk scoring, and workload classification affect routing
        </p>
      </div>

      {/* ── Grid: Inputs + Results ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── Left Column — Inputs ──────────────────────────── */}
        <div className="flex flex-col gap-4">
          {/* Quantum Rules Card */}
          <div
            className="rounded-lg p-5"
            style={{
              backgroundColor: "var(--color-bg-card)",
              border: "1px solid var(--color-border-default)",
            }}
          >
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: "var(--color-text-primary)" }}>
              <Shield size={16} style={{ color: "var(--color-accent)" }} />
              Quantum Rule Configuration
            </h2>
            <div className="flex flex-col gap-2">
              {RULES.map((rule, idx) => (
                <div key={rule.label} className="animate-slide-up" style={{ animationDelay: `${idx * 60}ms` }}>
                  <QuantumRuleToggle
                    label={rule.label}
                    defaultEnabled={rule.defaultEnabled}
                    onChange={handleStaleToggle}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Routing Profile */}
          <div
            className="rounded-lg p-5"
            style={{
              backgroundColor: "var(--color-bg-card)",
              border: "1px solid var(--color-border-default)",
            }}
          >
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: "var(--color-text-primary)" }}>
              <Beaker size={16} style={{ color: "var(--color-accent)" }} />
              Routing Profile
            </h2>
            <div className="relative">
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="w-full flex items-center justify-between px-4 py-2.5 rounded-md text-sm transition-all duration-150 cursor-pointer active:scale-[0.98]"
                style={{
                  backgroundColor: "var(--color-bg-input)",
                  border: "1px solid var(--color-border-default)",
                  color: "var(--color-text-primary)",
                }}
              >
                <span>{selectedProfile.label}</span>
                <ChevronDown
                  size={14}
                  style={{ color: "var(--color-text-muted)" }}
                  className={`transition-transform duration-200 ${profileOpen ? "rotate-180" : ""}`}
                />
              </button>
              {profileOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setProfileOpen(false)} />
                  <div
                    className="absolute top-full left-0 right-0 mt-1 z-20 rounded-lg py-1 shadow-xl"
                    style={{
                      backgroundColor: "var(--color-bg-card)",
                      border: "1px solid var(--color-border-default)",
                    }}
                  >
                    {ROUTING_PROFILES.map((profile) => (
                      <button
                        key={profile.value}
                        onClick={() => {
                          setRoutingProfile(profile.value);
                          setProfileOpen(false);
                          if (result) setStale(true);
                        }}
                        className="w-full text-left px-3 py-2 text-xs transition-all duration-100 cursor-pointer"
                        style={{
                          backgroundColor:
                            routingProfile === profile.value
                              ? "var(--color-accent-glow)"
                              : "transparent",
                          color:
                            routingProfile === profile.value
                              ? "var(--color-accent)"
                              : "var(--color-text-secondary)",
                        }}
                        onMouseEnter={(e) => {
                          if (routingProfile !== profile.value) {
                            e.currentTarget.style.backgroundColor = "var(--color-bg-input)";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (routingProfile !== profile.value) {
                            e.currentTarget.style.backgroundColor = "transparent";
                          }
                        }}
                      >
                        {profile.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Prompt Input */}
          <div
            className="rounded-lg p-5"
            style={{
              backgroundColor: "var(--color-bg-card)",
              border: "1px solid var(--color-border-default)",
            }}
          >
            <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--color-text-primary)" }}>
              Prompt
            </h2>
            <label htmlFor="routing-lab-prompt" className="sr-only">
              Enter your prompt text to simulate routing
            </label>
            <textarea
              id="routing-lab-prompt"
              ref={textareaRef}
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                if (result) setStale(true);
              }}
              placeholder="Try: 'What is the Q4 financial forecast?'"
              rows={4}
              className="w-full text-sm rounded-md px-4 py-3 resize-none transition-all duration-150"
              style={{
                backgroundColor: "var(--color-bg-input)",
                border: "1px solid var(--color-border-default)",
                color: "var(--color-text-primary)",
                fontFamily: "'Space Grotesk', sans-serif",
                minHeight: "96px",
              }}
            />

            <button
              onClick={handleSimulate}
              disabled={!prompt.trim() || simulating}
              className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-semibold transition-all duration-150 active:scale-[0.97]"
              style={{
                backgroundColor:
                  prompt.trim() && !simulating
                    ? "var(--color-accent)"
                    : "var(--color-border-light)",
                color:
                  prompt.trim() && !simulating
                    ? "var(--color-on-primary)"
                    : "var(--color-text-muted)",
                cursor: prompt.trim() && !simulating ? "pointer" : "not-allowed",
              }}
            >
              {simulating ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Simulating…
                </>
              ) : (
                <>
                  <FlaskConical size={16} />
                  Simulate Route
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── Right Column — Results ─────────────────────────── */}
        <div ref={resultRef} className="flex flex-col gap-4">
          {!result && !simulating ? (
            /* Empty state */
            <div
              className="rounded-lg flex flex-col items-center justify-center text-center p-10 min-h-[400px]"
              style={{
                backgroundColor: "var(--color-bg-card)",
                border: "1px solid var(--color-border-default)",
              }}
            >
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
                style={{
                  backgroundColor: "var(--color-accent-dim)",
                  color: "var(--color-accent)",
                }}
              >
                <FlaskConical size={28} />
              </div>
              <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--color-text-primary)" }}>
                No simulation yet
              </h3>
              <p className="text-xs max-w-xs" style={{ color: "var(--color-text-muted)" }}>
                Configure the quantum rules and routing profile on the left, type a prompt, then hit{" "}
                <span className="font-semibold" style={{ color: "var(--color-accent)" }}>Simulate Route</span>{" "}
                to see the hybrid router's decision breakdown.
              </p>
            </div>
          ) : simulating ? (
            /* Loading state */
            <div
              className="rounded-lg flex flex-col items-center justify-center text-center p-10 min-h-[400px]"
              style={{
                backgroundColor: "var(--color-bg-card)",
                border: "1px solid var(--color-border-default)",
              }}
            >
              <div
                className="w-12 h-12 rounded-full border-2 border-t-transparent animate-spin mb-4"
                style={{
                  borderColor: "var(--color-border-light)",
                  borderTopColor: "var(--color-accent)",
                }}
              />
              <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                Running routing simulation…
              </p>
            </div>
          ) : result ? (
            /* ── Results Panel ──────────────────────────────────── */
            <div
              className="rounded-lg animate-fade-scale"
              style={{
                backgroundColor: "var(--color-bg-card)",
                border: `1px solid ${
                  stale
                    ? "var(--color-warning)"
                    : result.fallbackEngaged
                      ? "rgba(243, 128, 32, 0.3)"
                      : "var(--color-border-default)"
                }`,
              }}
            >
              {/* Stale banner */}
              {stale && (
                <div
                  className="flex items-center gap-2 px-5 py-2.5 text-xs rounded-t-lg"
                  style={{
                    backgroundColor: "var(--color-warning-dim)",
                    borderBottom: "1px solid rgba(243, 128, 32, 0.2)",
                    color: "var(--color-warning)",
                  }}
                >
                  <AlertTriangle size={13} />
                  <span>
                    Results are out of date — re-run simulation with updated configuration.
                  </span>
                </div>
              )}

              {/* Fallback banner */}
              {result.fallbackEngaged && (
                <div
                  className="flex items-center gap-2 px-5 py-2.5 text-xs"
                  style={{
                    backgroundColor: "rgba(243, 128, 32, 0.08)",
                    borderBottom: "1px solid rgba(243, 128, 32, 0.2)",
                    color: "var(--color-warning)",
                  }}
                >
                  <AlertTriangle size={13} />
                  <span>
                    <span className="font-semibold">FALLBACK ENGAGED</span> — AMD Private Pod is
                    unreachable; traffic routed through emergency zero-trust tunnel.
                  </span>
                </div>
              )}

              <div className="p-5 flex flex-col gap-5">
                {/* ── Risk Score Row ────────────────────────── */}
                <div className="flex items-center gap-6">
                  <RiskScoreRing score={result.riskScore} />
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-medium" style={{ color: "var(--color-text-secondary)" }}>
                      Matched Keywords
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {result.matchedKeywords.length > 0 ? (
                        result.matchedKeywords.map((kw) => <KeywordBadge key={kw} keyword={kw} />)
                      ) : (
                        <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          None detected
                        </span>
                      )}
                    </div>
                    <div className="mt-1">
                      <p className="text-xs font-medium mb-1" style={{ color: "var(--color-text-secondary)" }}>
                        Workload Classification
                      </p>
                      <WorkloadBadge type={result.workloadType} />
                    </div>
                  </div>
                </div>

                {/* ── Condition Evaluation Table ────────────── */}
                <div>
                  <h3 className="text-xs font-semibold mb-2" style={{ color: "var(--color-text-primary)" }}>
                    Condition Evaluation
                  </h3>
                  <div
                    className="rounded-md overflow-hidden"
                    style={{
                      backgroundColor: "var(--color-bg-input)",
                      border: "1px solid var(--color-border-default)",
                    }}
                  >
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                          <th className="text-left font-medium px-3 py-2" style={{ color: "var(--color-text-muted)" }}>Condition</th>
                          <th className="text-right font-medium px-3 py-2" style={{ color: "var(--color-text-muted)" }}>Value</th>
                          <th className="text-right font-medium px-3 py-2 w-8" style={{ color: "var(--color-text-muted)" }}>Pass?</th>
                        </tr>
                      </thead>
                      <tbody>
                        <ConditionRow
                          label="force_private"
                          value={result.forcePrivate}
                          passes={!result.forcePrivate}
                        />
                        <ConditionRow
                          label="risk_score < 40"
                          value={result.scoreBelowThreshold}
                          passes={result.scoreBelowThreshold}
                        />
                        <ConditionRow
                          label="effective_encryption"
                          value={result.effectiveEncryption}
                          passes={!result.effectiveEncryption}
                        />
                        {/* Divider row */}
                        <tr>
                          <td colSpan={3} style={{ height: "6px" }} />
                        </tr>
                        <ConditionRow
                          label="→ verdict"
                          value={result.verdict.replace(/_/g, " ")}
                          isFinal
                        />
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* ── Final Verdict ─────────────────────────── */}
                <div>
                  <h3 className="text-xs font-semibold mb-2" style={{ color: "var(--color-text-primary)" }}>
                    Final Verdict
                  </h3>
                  <div className="flex items-center gap-3">
                    <span
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold animate-bounce-in"
                      style={{
                        backgroundColor: getVerdictColor(result.verdict).bg,
                        border: `1px solid ${getVerdictColor(result.verdict).border}`,
                        color: getVerdictColor(result.verdict).text,
                      }}
                    >
                      <Shield size={12} />
                      {result.verdict.replace(/_/g, " ")}
                    </span>
                    <span
                      className="text-xs font-mono"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      → {result.modelName}
                    </span>
                  </div>
                </div>

                {/* ── Routing Reason ──────────────────────────── */}
                <div>
                  <h3 className="text-xs font-semibold mb-2" style={{ color: "var(--color-text-primary)" }}>
                    Routing Reason
                  </h3>
                  <div
                    className="rounded-md p-3 text-xs leading-relaxed select-all"
                    style={{
                      backgroundColor: "var(--color-bg-base)",
                      border: "1px solid var(--color-border-light)",
                      color: "var(--color-text-secondary)",
                      fontFamily: "'Fira Code', monospace",
                      fontSize: "11px",
                      lineHeight: "1.6",
                    }}
                  >
                    {result.reason}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
