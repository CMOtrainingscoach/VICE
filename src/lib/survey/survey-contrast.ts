/** WCAG 2.x contrast helpers for public surveys — branding must never break readability. */

export const SURVEY_WCAG_TEXT = 4.5;
export const SURVEY_WCAG_UI = 3;

const BLACK = "#000000";
const WHITE = "#ffffff";

export type SurveyResolvedColors = {
  primary: string;
  text: string;
  textMuted: string;
  background: string;
  onPrimary: string;
  fieldBackground: string;
  fieldText: string;
  fieldBorder: string;
  errorText: string;
};

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const s = hex.trim().replace(/^#/, "");
  if (s.length === 3) {
    return {
      r: parseInt(s[0]! + s[0], 16),
      g: parseInt(s[1]! + s[1], 16),
      b: parseInt(s[2]! + s[2], 16),
    };
  }
  if (s.length === 6 && /^[0-9a-fA-F]+$/.test(s)) {
    return {
      r: parseInt(s.slice(0, 2), 16),
      g: parseInt(s.slice(2, 4), 16),
      b: parseInt(s.slice(4, 6), 16),
    };
  }
  return null;
}

function toHex({ r, g, b }: { r: number; g: number; b: number }): string {
  return `#${[r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("")}`;
}

function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const [rs, gs, bs] = [rgb.r, rgb.g, rgb.b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs! + 0.7152 * gs! + 0.0722 * bs!;
}

export function contrastRatio(foreground: string, background: string): number {
  const l1 = relativeLuminance(foreground);
  const l2 = relativeLuminance(background);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function pickReadableTextColor(backgroundHex: string): typeof BLACK | typeof WHITE {
  const lum = relativeLuminance(backgroundHex);
  return lum > 0.179 ? BLACK : WHITE;
}

export function mixHex(foreground: string, background: string, towardBackground: number): string {
  const fg = parseHex(foreground);
  const bg = parseHex(background);
  if (!fg || !bg) return foreground;
  const t = Math.max(0, Math.min(1, towardBackground));
  return toHex({
    r: fg.r * (1 - t) + bg.r * t,
    g: fg.g * (1 - t) + bg.g * t,
    b: fg.b * (1 - t) + bg.b * t,
  });
}

function ensureMinContrast(foreground: string, background: string, minRatio: number): string {
  if (contrastRatio(foreground, background) >= minRatio) return foreground;
  return pickReadableTextColor(background);
}

function mutedOnBackground(text: string, background: string, minRatio: number): string {
  if (contrastRatio(text, background) < minRatio) {
    return ensureMinContrast(text, background, minRatio);
  }
  for (let t = 0.05; t <= 0.75; t += 0.05) {
    const candidate = mixHex(text, background, t);
    if (contrastRatio(candidate, background) >= minRatio) return candidate;
  }
  return ensureMinContrast(text, background, minRatio);
}

function adjustPrimaryForUi(primary: string, background: string): string {
  if (contrastRatio(primary, background) >= SURVEY_WCAG_UI) return primary;
  const target = pickReadableTextColor(background) === BLACK ? BLACK : WHITE;
  for (let t = 0.05; t <= 0.95; t += 0.05) {
    const candidate = mixHex(primary, target, t);
    if (contrastRatio(candidate, background) >= SURVEY_WCAG_UI) return candidate;
  }
  return ensureMinContrast(primary, background, SURVEY_WCAG_UI);
}

function fieldSurface(pageBackground: string): string {
  const lift = pickReadableTextColor(pageBackground) === BLACK ? WHITE : BLACK;
  for (let t = 0.04; t <= 0.35; t += 0.02) {
    const candidate = mixHex(lift, pageBackground, t);
    if (contrastRatio(lift, candidate) >= SURVEY_WCAG_TEXT && contrastRatio(candidate, pageBackground) >= 1.2) {
      return candidate;
    }
  }
  return mixHex(lift, pageBackground, 0.12);
}

const ERROR_BASE = "#b91c1c";
const ERROR_ON_DARK = "#fca5a5";

export function resolveSurveyBrandColors(input: {
  primary?: string | null;
  text?: string | null;
  background?: string | null;
}): SurveyResolvedColors {
  const background = parseHex(input.background ?? "") ? input.background! : "#fafafa";
  const primaryRaw = parseHex(input.primary ?? "") ? input.primary! : "#c9a227";
  const textRaw = parseHex(input.text ?? "") ? input.text! : pickReadableTextColor(background);

  const text = ensureMinContrast(textRaw, background, SURVEY_WCAG_TEXT);
  const textMuted = mutedOnBackground(text, background, SURVEY_WCAG_TEXT);
  const primary = adjustPrimaryForUi(primaryRaw, background);
  const onPrimary = ensureMinContrast(pickReadableTextColor(primary), primary, SURVEY_WCAG_TEXT);

  const fieldBackground = fieldSurface(background);
  const fieldText = ensureMinContrast(text, fieldBackground, SURVEY_WCAG_TEXT);
  const fieldBorder = adjustPrimaryForUi(primary, fieldBackground);

  const errorText = ensureMinContrast(
    pickReadableTextColor(background) === WHITE ? ERROR_ON_DARK : ERROR_BASE,
    background,
    SURVEY_WCAG_TEXT,
  );

  return {
    primary,
    text,
    textMuted,
    background,
    onPrimary,
    fieldBackground,
    fieldText,
    fieldBorder,
    errorText,
  };
}
