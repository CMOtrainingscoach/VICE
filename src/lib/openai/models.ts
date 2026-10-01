/**
 * OpenAI model defaults — override per taak via env (Vercel + .env.local).
 *
 * PESTEL: 6 API-calls per volledig onderzoek → kies hier bewust kwaliteit vs. kosten.
 * Meetings/analyse: lagere frequentie → mini is meestal voldoende.
 */

export function resolveSttModel(): string {
  return process.env.VICE_STT_MODEL?.trim() || "whisper-1";
}

export function resolveMeetingAnalysisModel(): string {
  return process.env.VICE_ANALYSIS_MODEL?.trim() || "gpt-4o-mini";
}

/** Strategische PESTEL-onderzoek (externe omgeving + bronnen). */
export function resolvePestelResearchModel(): string {
  return (
    process.env.VICE_PESTEL_RESEARCH_MODEL?.trim() ||
    process.env.VICE_RESEARCH_MODEL?.trim() ||
    "gpt-4o"
  );
}

/** Max output tokens per PESTEL-perspectief (kostenplafond). */
export function pestelResearchMaxOutputTokens(): number {
  const raw = process.env.VICE_PESTEL_RESEARCH_MAX_TOKENS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 4096;
  return Number.isFinite(n) && n > 256 ? Math.min(n, 16_384) : 4096;
}
