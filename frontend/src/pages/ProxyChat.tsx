import { useState, useCallback } from "react";
import ProxyMonitor from "../components/ProxyMonitor";
import SecurePromptTerminal from "../components/SecurePromptTerminal";
import HardwareStatusBanner from "../components/HardwareStatusBanner";
import { classifyPrompt } from "../utils/contentClassifier";
import { encapsulatePrompt } from "../utils/pqc-client";
import { apiFetch } from "../utils/api";
import type { InspectRequest, InspectResponse } from "../types/api";

const SOVEREIGN_KEYWORDS = ["financial", "secret", "unreleased", "gdpr", "intellectual property"];

/* ── Quantum rule helpers ────────────────────────────────────────── */
const STORAGE_PREFIX = "great-aegis-quantum-rule-";

function getQuantumRule(label: string, defaultVal: boolean = true): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_PREFIX + label);
    if (stored !== null) return stored === "true";
  } catch {
    /* localStorage unavailable */
  }
  return defaultVal;
}

export default function ProxyChat() {
  const [route, setRoute] = useState<"idle" | "public" | "private">("idle");
  const [riskScore, setRiskScore] = useState(0);
  const [classification, setClassification] = useState("public");
  const [isDemo, setIsDemo] = useState(true);
  const [demoMode, setDemoMode] = useState<"casual" | "sovereign" | "fallback" | undefined>(
    "casual"
  );

  const [result, setResult] = useState<InspectResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ── Simulated demo response generator ─────────────────────────── */
  function generateDemoResponse(
    mode: "casual" | "sovereign" | "fallback",
  ): InspectResponse {
    const isConfidential = mode !== "casual";
    const verdict =
      mode === "casual"
        ? "SIMULATE AMD POD CRASH"
        : mode === "sovereign"
          ? "private_qwen_pod"
          : "secure_fallback_tunnel";

    return {
      routing_verdict: verdict,
      target_compute_node: mode === "casual" ? "fireworks-ai-dedicated" : "amd-instinct-private-pod",
      target_model: mode === "fallback" ? "Fireworks AI (Encrypted Tunnel Fallback)" : "Qwen3-0.6B",
      routing_reason:
        mode === "fallback"
          ? "AMD Secure Pod offline — autonomous zero-trust failover to encrypted tunnel."
          : isConfidential
            ? "Sensitive content detected — routed to private AMD Instinct™ pod."
            : "General prompt — routed to public endpoint.",
      encryption_status: isConfidential ? "active" : "bypassed",
      pqc_signature: isConfidential ? "ml-kem-768::sig_7a3f...c91e" : null,
      pqc_validation_flag: isConfidential,
      pqc_algorithm: "ML-KEM-768 + ML-DSA-65",
      pqc_public_key: null,
      streaming_endpoint: mode === "casual"
        ? "wss://gateway.greataegis.io/stream/public"
        : "wss://gateway.greataegis.io/stream/private",
      hardware_status: mode === "fallback" ? "offline" : "online",
      fallback_engaged: mode === "fallback",
    };
  }

  const handleSubmit = useCallback(
    async (prompt: string) => {
      setLoading(true);
      setError(null);
      const lowered = prompt.toLowerCase();
      const hasSovereignKeyword = SOVEREIGN_KEYWORDS.some((kw) => lowered.includes(kw));
      const mode = hasSovereignKeyword ? "sovereign" as const : "casual" as const;
      // Only update demoMode if user is in demo mode — don't override REAL toggle
      if (isDemo) {
        setDemoMode(mode);
      }

      // Run local content classifier immediately
      const classificationResult = classifyPrompt(prompt);
      setRiskScore(classificationResult.score);
      setClassification(classificationResult.classification);
      // Align route with the mode determined by keyword match (not classifier threshold)
      setRoute(mode === "sovereign" ? "private" : "public");

      if (isDemo) {
        // Demo simulation — generate a local fake response instead of hitting backend
        const fakeResult = generateDemoResponse(mode);
        setResult(fakeResult);
        setLoading(false);
        setError(null);
      } else {
        // REAL mode — hit the live backend gateway
        try {
          const quantumEncryption = getQuantumRule("Enforce Client-Side ML-KEM/Kyber Key Wrapping");
          const zeroTrust = getQuantumRule("Zero-Trust Data-in-Transit Payload Encapsulation");
          const podIsolation = getQuantumRule("Strict Safe-Compute Pod Isolation");

          // ── Client-side PQC: encrypt prompt before transit ──
          let encryptedPrompt: string | undefined;
          if (quantumEncryption) {
            try {
              const enc = await encapsulatePrompt(prompt);
              encryptedPrompt = enc.encrypted_prompt;
            } catch (e) {
              console.warn("Client-side PQC encapsulation failed:", e);
            }
          }

          const res = await apiFetch(`/api/v1/gateway/inspect`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt_payload: prompt,
              client_encryption_flag: quantumEncryption,
              routing_profile: "default",
              quantum_encryption_enabled: quantumEncryption,
              zero_trust_enabled: zeroTrust,
              pod_isolation_enabled: podIsolation,
              encrypted_prompt: encryptedPrompt,
            } satisfies InspectRequest),
          });
          if (!res.ok) {
            const body = await res.text().catch(() => "Unknown error");
            throw new Error(`Gateway returned ${res.status}: ${body}`);
          }
          const json: InspectResponse = await res.json();
          setResult(json);
          // Derive route from the live response verdict
          if (json.routing_verdict.includes("private") || json.fallback_engaged) {
            setRoute("private");
          } else {
            setRoute("public");
          }
        } catch (err) {
          const message =
            err instanceof TypeError && err.message === "Failed to fetch"
              ? "Cannot reach the GreatAegis API server — the backend is not running. Switch to demo mode to explore with simulated data."
              : err instanceof Error
                ? err.message
                : "Gateway inspection failed";
          setError(message);
        } finally {
          setLoading(false);
        }
      }
    },
    [isDemo]
  );

  const handleFileAttach = useCallback(() => {
    setDemoMode("sovereign");
  }, []);

  const handleToggleMode = useCallback(() => {
    setIsDemo((prev) => {
      const next = !prev;
      setDemoMode(next ? "casual" : undefined);
      // Tell the backend to switch between simulated and production mode so
      // the AMD pod status reflects the real probe result (online/offline)
      // instead of staying stuck on "simulated".
      apiFetch(`/api/v1/gateway/mode?mode=${next ? "simulated" : "production"}`, {
        method: "POST",
      }).catch(() => {
        // Backend may be unreachable — non-critical, health poll will retry
      });
      return next;
    });
  }, []);

  const handleToggleFallback = useCallback(() => {
    setDemoMode((prev) => (prev === "fallback" ? "casual" : "fallback"));
  }, []);

  return (
    <div className="flex flex-col gap-5 relative min-h-full">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Proxy &amp; Chat
        </h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
          Traffic routing visualisation &amp; secure prompt terminal
        </p>
      </div>

      {/* ── Floating Demo Simulation Controller ──────────────── */}
      {isDemo && (
        <div className="absolute top-4 right-4 z-50">
          <button
            onClick={handleToggleFallback}
            className="text-[10px] font-mono font-semibold px-2.5 py-1 rounded border cursor-pointer transition-all duration-150 active:scale-95 whitespace-nowrap"
            style={{
              backgroundColor:
                demoMode === "fallback"
                  ? "rgba(221, 107, 32, 0.15)"
                  : "var(--color-bg-input)",
              color:
                demoMode === "fallback"
                  ? "var(--color-warning)"
                  : "var(--color-text-muted)",
              borderColor:
                demoMode === "fallback"
                  ? "var(--color-warning)"
                  : "var(--color-border-default)",
            }}
          >
            SIMULATE AMD POD CRASH
          </button>
        </div>
      )}

      {/* ── Network & Hardware Status Widget ─────────────────── */}
      <HardwareStatusBanner
        inspectResponse={result as InspectResponse | null}
        demoMode={demoMode}
        onToggleMode={handleToggleMode}
      />

      {/* ── Split layout ──────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row gap-4" style={{ minHeight: "calc(100vh - 200px)" }}>
        {/* Left: Proxy Monitor */}
        <div style={{ flex: 1, minWidth: 0, animationDelay: "0ms" }} className="animate-slide-up">
          <ProxyMonitor
            route={route}
            riskScore={riskScore}
            classification={classification}
            demoMode={demoMode}
          />
        </div>

        {/* Right: Secure Prompt Terminal */}
        <div style={{ flex: 1, minWidth: 0, animationDelay: "100ms" }} className="animate-slide-up">
          <SecurePromptTerminal
            onSubmit={handleSubmit}
            loading={loading}
            result={result as InspectResponse | null}
            error={error}
            classification={classification}
            riskScore={riskScore}
            demoMode={demoMode}
            onFileAttach={handleFileAttach}
          />
        </div>
      </div>
    </div>
  );
}
