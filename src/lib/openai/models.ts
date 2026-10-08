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

/** Porter Five Forces AI-onderzoek (1 call per kracht). */
export function resolvePorterResearchModel(): string {
  return (
    process.env.VICE_PORTER_RESEARCH_MODEL?.trim() ||
    process.env.VICE_PESTEL_RESEARCH_MODEL?.trim() ||
    process.env.VICE_RESEARCH_MODEL?.trim() ||
    "gpt-4o"
  );
}

export function porterResearchMaxOutputTokens(): number {
  const raw =
    process.env.VICE_PORTER_RESEARCH_MAX_TOKENS?.trim()
    || process.env.VICE_PESTEL_RESEARCH_MAX_TOKENS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 4096;
  return Number.isFinite(n) && n > 256 ? Math.min(n, 16_384) : 4096;
}

export function resolveBlogTextModel(): string {
  return (
    process.env.VICE_BLOG_MODEL?.trim()
    || process.env.VICE_CONTENT_MODEL?.trim()
    || "gpt-5.6-sol"
  );
}

/** Sommige GPT-5 / reasoning-modellen laten alleen de standaard temperature toe. */
export function modelSupportsCustomTemperature(model: string): boolean {
  const id = model.trim().toLowerCase();
  if (!id) return true;
  if (id.includes("gpt-5") || id.includes("sol")) return false;
  if (/^o[0-9]/.test(id)) return false;
  return true;
}

export function resolveBlogImageModel(): string {
  return process.env.VICE_BLOG_IMAGE_MODEL?.trim() || "gpt-image-1";
}
