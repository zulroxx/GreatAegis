/**
 * GreatAegis Routing Simulator
 *
 * Pure client-side replica of the hybrid router's decision logic (from
 * backend/hybrid_router.py).  Runs entirely in the browser so the Routing
 * Lab works without a running backend.
 */

// ── Sensitivity keywords (exact copy from hybrid_router.py) ────────────────

export const SENSITIVE_KEYWORDS = [
  "financial", "revenue", "confidential", "secret", "password",
  "salary", "budget", "acquisition", "merger", "classified",
  "trade secret", "non-public", "insider", "proprietary",
  "nda", "embargo", "restricted", "internal only",
  "forecast", "earnings", "patent",
  "intellectual property",
];

export const COMPLIANCE_KEYWORDS = [
  "compliance", "policy", "audit", "regulation", "gdpr",
  "soc2", "iso27001", "hipaa", "pci", "governance",
  "review", "summarise", "summarize", "classify", "check",
  "validate", "verify", "moderate", "flag", "screening",
  "triage", "routing rule", "cost estimate", "quick",
  "lightweight", "simple query", "faq",
];

export const DEEP_INFERENCE_KEYWORDS = [
  "generate", "write", "draft", "compose", "create",
  "analyse", "analyze", "deep dive", "complex", "detailed",
  "reasoning chain", "step by step", "explain in detail",
  "long form", "research", "report", "strategy",
];

function keywordHits(text: string, keywords: string[]): number {
  let hits = 0;
  for (const kw of keywords) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(text)) hits += 1;
  }
  return hits;
}

// ── Types ───────────────────────────────────────────────────────────────────

export type Verdict =
  | "public_fireworks"
  | "private_gemma"
  | "private_mixtral"
  | "secure_fallback";

export type ModelName =
  | "mixtral-8x7b"
  | "gemma-7b"
  | "Fireworks AI (Encrypted Tunnel Fallback)"
  | "accounts/fireworks/models/gemma-4-26b-a4b-it";

export type WorkloadType = "compliance" | "deep-inference" | "general" | null;

export type RoutingProfile = "auto" | "compliance" | "deep-inference";

export interface QuantumRuleState {
  quantumEncryptionEnabled: boolean; // Rule 1 — ML-KEM/Kyber key wrapping
  zeroTrustEnabled: boolean;         // Rule 2 — Zero-Trust payload encapsulation
  podIsolationEnabled: boolean;      // Rule 3 — Strict pod isolation
}

export interface ConditionEvaluation {
  label: string;
  value: boolean;
  passed: boolean;
}

export interface RoutingResult {
  riskScore: number;
  matchedKeywords: string[];
  forcePrivate: boolean;
  effectiveEncryption: boolean;
  scoreBelowThreshold: boolean;
  verdict: Verdict;
  modelName: string;
  reason: string;
  fallbackEngaged: boolean;
  workloadType: WorkloadType;
  routingProfile: RoutingProfile;
  conditionEvaluations: ConditionEvaluation[];
}

// ── Risk scoring ───────────────────────────────────────────────────────────

/**
 * Return a score 0–100 indicating how sensitive the prompt is.
 * Exact replica of hybrid_router._compute_risk_score().
 */
export function computeRiskScore(prompt: string): { score: number; matchedKeywords: string[] } {
  const lowered = prompt.toLowerCase();
  let score = 0;
  const matchedKeywords: string[] = [];

  for (const kw of SENSITIVE_KEYWORDS) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(lowered)) {
      score += 20;
      matchedKeywords.push(kw);
    }
  }

  const matchCount = matchedKeywords.length;
  if (matchCount >= 3) {
    score += 15;
  }

  return { score: Math.min(score, 100), matchedKeywords };
}

// ── Workload classification ────────────────────────────────────────────────

/**
 * Classify the prompt workload type to decide between Gemma and Mixtral.
 * Exact replica of hybrid_router._classify_workload().
 */
export function classifyWorkload(prompt: string): WorkloadType {
  const lowered = prompt.toLowerCase();
  const complianceHits = keywordHits(lowered, COMPLIANCE_KEYWORDS);
  const deepHits = keywordHits(lowered, DEEP_INFERENCE_KEYWORDS);

  if (deepHits >= 2 || (deepHits >= 1 && complianceHits === 0)) {
    return "deep-inference";
  }
  if (complianceHits >= 1) {
    return "compliance";
  }
  return "general";
}

// ── Full routing simulation ────────────────────────────────────────────────

/**
 * Simulate the full hybrid router decision chain.
 *
 * @param prompt        Raw user prompt text.
 * @param rules         Current quantum rule state (read from localStorage).
 * @param routingProfile "auto" | "compliance" | "deep-inference"
 * @param appMode       "simulated" | "production" (simulated = no health check,
 *                      so fallback is never engaged)
 */
export function simulateRoute(
  prompt: string,
  rules: QuantumRuleState,
  routingProfile: RoutingProfile = "auto",
  appMode: "simulated" | "production" = "simulated",
): RoutingResult {
  const { score: riskScore, matchedKeywords } = computeRiskScore(prompt);

  // ── Apply quantum rule overrides ─────────────────────────────────
  // Rule 1: if ML-KEM wrapping is disabled, force encryption flag off
  // (client_encryption_flag is always true for simulation purposes)
  const effectiveEncryption = true && rules.quantumEncryptionEnabled;
  // Rule 2: if zero-trust is enabled, force all traffic through private routes
  const forcePrivate = rules.zeroTrustEnabled;

  const scoreBelowThreshold = riskScore < 40;

  const conditionEvaluations: ConditionEvaluation[] = [
    {
      label: "force_private (Zero-Trust ON)",
      value: forcePrivate,
      passed: !forcePrivate, // passes when force_private is false (allows public routing)
    },
    {
      label: "risk_score < 40",
      value: scoreBelowThreshold,
      passed: scoreBelowThreshold,
    },
    {
      label: "effective_encryption (ML-KEM ON)",
      value: effectiveEncryption,
      passed: !effectiveEncryption, // passes when encryption is OFF (allows public routing)
    },
  ];

  // ── Step 1: public vs private ──────────────────────────────────
  if (!forcePrivate && riskScore < 40 && !effectiveEncryption) {
    return {
      riskScore,
      matchedKeywords,
      forcePrivate,
      effectiveEncryption,
      scoreBelowThreshold,
      verdict: "public_fireworks",
      modelName: "accounts/fireworks/models/gemma-4-26b-a4b-it",
      reason:
        "Low-risk content; routed to public Fireworks endpoint via Gemma 4 26B for cost efficiency.",
      fallbackEngaged: false,
      workloadType: classifyWorkload(prompt),
      routingProfile,
      conditionEvaluations,
    };
  }

  // ── Step 2: which private model? ───────────────────────────────
  let workload = classifyWorkload(prompt);

  // Respect explicit routing profile overrides
  if (routingProfile === "compliance") {
    workload = "compliance";
  } else if (routingProfile === "deep-inference") {
    workload = "deep-inference";
  }

  let verdict: Verdict;
  let modelName: ModelName;
  let reason: string;

  if (workload === "compliance") {
    verdict = "private_gemma";
    modelName = "gemma-7b";
    reason =
      "Lightweight compliance / policy verification task; " +
      "routed to AMD-hosted Gemma-7B via vLLM for optimal cost-performance.";
  } else {
    verdict = "private_mixtral";
    modelName = "mixtral-8x7b";
    reason =
      "Sensitive or complex inference task; " +
      "routed to AMD Instinct MI300X Pod running Mixtral-8x7B via vLLM " +
      "with client-side ML-KEM encryption.";
  }

  // ── Step 3: hardware health check (production only) ────────────
  if (appMode === "production") {
    // Simulating health check failure when pod isolation is active
    // (for demo purposes, treat production mode as having an offline endpoint)
    if (rules.podIsolationEnabled) {
      return {
        riskScore: Math.max(riskScore, 80),
        matchedKeywords,
        forcePrivate,
        effectiveEncryption,
        scoreBelowThreshold,
        verdict: "secure_fallback",
        modelName: "Fireworks AI (Encrypted Tunnel Fallback)",
        reason:
          "STRICT POD ISOLATION POLICY BLOCKED: AMD Private Pod unreachable " +
          "and fallback to external providers is disabled by pod isolation. " +
          "Disable pod isolation in Security Suite to allow emergency " +
          "zero-trust routing via Fireworks AI, or restore AMD pod connectivity.",
        fallbackEngaged: true,
        workloadType: workload,
        routingProfile,
        conditionEvaluations,
      };
    }

    return {
      riskScore: Math.max(riskScore, 80),
      matchedKeywords,
      forcePrivate,
      effectiveEncryption,
      scoreBelowThreshold,
      verdict: "secure_fallback",
      modelName: "Fireworks AI (Encrypted Tunnel Fallback)",
      reason:
        "AMD Private Pod status is currently OFFLINE or INITIALIZING. " +
        "Automatically engaged emergency zero-trust fallback routing via " +
        "client-side encrypted PQC tunnel to Fireworks AI to prevent data disruption.",
      fallbackEngaged: true,
      workloadType: workload,
      routingProfile,
      conditionEvaluations,
    };
  }

  return {
    riskScore,
    matchedKeywords,
    forcePrivate,
    effectiveEncryption,
    scoreBelowThreshold,
    verdict,
    modelName,
    reason,
    fallbackEngaged: false,
    workloadType: workload,
    routingProfile,
    conditionEvaluations,
  };
}
