/**
 * Content classifier — analyzes prompt text for sensitivity keywords
 * and returns a risk score (0–100) and classification label.
 */

const SENSITIVE_KEYWORDS = [
  "financial", "revenue", "confidential", "secret", "password",
  "salary", "budget", "q4", "acquisition", "merger", "classified",
  "trade secret", "non-public", "insider", "proprietary",
  "nda", "embargo", "restricted", "internal only",
  "forecast", "earnings", "patent", "ip",
];

export interface ClassificationResult {
  score: number;
  classification: "public" | "highly_confidential";
}

export function classifyPrompt(prompt: string): ClassificationResult {
  if (!prompt.trim()) {
    return { score: 0, classification: "public" };
  }

  const lowered = prompt.toLowerCase();
  let score = 0;

  for (const kw of SENSITIVE_KEYWORDS) {
    if (lowered.includes(kw)) {
      score += 20;
    }
  }

  const matchCount = SENSITIVE_KEYWORDS.filter((kw) => lowered.includes(kw)).length;
  if (matchCount >= 3) score += 15;

  score = Math.min(score, 100);

  return {
    score,
    classification: score >= 40 ? "highly_confidential" : "public",
  };
}
