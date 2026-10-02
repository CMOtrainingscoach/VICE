import { parseBcgNumber, round4 } from "@/lib/bcg/math";

function escapeReg(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function numberForms(value: number): string[] {
  const rounded = round4(value);
  const abs = Math.abs(rounded);
  const dot = String(abs);
  const comma = dot.replace(".", ",");
  const forms = new Set<string>([dot, comma]);
  if (Number.isInteger(abs) && abs >= 1000) {
    const digits = String(abs);
    forms.add(digits.replace(/\B(?=(\d{3})+(?!\d))/g, "."));
    forms.add(digits.replace(/\B(?=(\d{3})+(?!\d))/g, ","));
  }
  if (rounded < 0) {
    return [...forms].flatMap((form) => [`-${form}`, `−${form}`]);
  }
  return [...forms];
}

/** Een cijfer telt alleen als het zo in de brontekst staat, niet als deel van een groter getal. */
export function corpusHasNumber(corpus: string, value: number): boolean {
  if (!Number.isFinite(value)) return false;
  const compact = corpus.replace(/\s+/g, "");
  return numberForms(value).some((form) => {
    const re = new RegExp(`(?:^|[^0-9])${escapeReg(form)}(?![0-9]|[.,][0-9])`);
    return re.test(compact);
  });
}

export function keepGrounded(value: number | null, corpus: string): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return corpusHasNumber(corpus, value) ? round4(value) : null;
}

/** Haalt bedragen en percentages uit vrije tekst wanneer ze niet in de bronnen staan. */
export function stripUngroundedFigures(text: string, corpus: string): string {
  return text
    .replace(/[€$]\s?\d[\d.\s,]*|\d[\d.\s,]*(?:%|×)/g, (match) => {
      const n = parseBcgNumber(match);
      if (n == null) return "";
      return corpusHasNumber(corpus, n) ? match : "";
    })
    .replace(/[ ]{2,}/g, " ")
    .trim();
}
