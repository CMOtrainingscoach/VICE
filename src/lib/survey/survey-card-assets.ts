export const SURVEY_ASSETS_BUCKET = "survey-assets";

export function surveyCardImagePublicUrl(path: string | undefined | null): string | null {
  if (!path?.trim()) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!base) return null;
  const encoded = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${base}/storage/v1/object/public/${SURVEY_ASSETS_BUCKET}/${encoded}`;
}

/** Accepts http(s) links for card CTAs; empty input clears the field. */
export function normalizeSurveyCardLinkUrl(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  const value = String(raw).trim();
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export function surveyCardLinkLabel(url: string, label: string | undefined): string {
  const trimmed = label?.trim();
  if (trimmed) return trimmed;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Open link";
  }
}
