import type { BrandColor, BrandVisual, BrandVoice } from "@/lib/brand-profile/types";

export type PromptDraft = {
  subject: string;
  use: string;
  format: string;
  message: string;
  composition: string;
  camera: string;
  light: string;
  textSpace: boolean;
  exclusions: string;
};

export type ComposedPrompt = {
  assignment: string;
  style: string;
  full: string;
  missing: string[];
  label: string;
};

const STANDARD = "Genereer de basisvisual. Voeg echte logo's en tekst achteraf toe. Gebruik goedgekeurde merkassets voor exacte weergave. Een prompt garandeert geen exacte kleuren, logo's, lettertypes of tekstweergave.";

export function composeBrandPrompt(
  draft: PromptDraft,
  visual: BrandVisual,
  voice: BrandVoice,
  colors: BrandColor[],
): ComposedPrompt {
  const missing: string[] = [];
  if (!draft.subject.trim()) missing.push("Onderwerp");
  if (!draft.use.trim()) missing.push("Toepassing");
  if (!draft.format.trim()) missing.push("Formaat");

  const assignment = [
    draft.subject.trim() ? `Onderwerp: ${draft.subject.trim()}` : "",
    draft.use.trim() ? `Toepassing: ${draft.use.trim()}` : "",
    draft.format.trim() ? `Formaat: ${draft.format.trim()}` : "",
    draft.message.trim() ? `Boodschap, achteraf in tekst gezet: ${draft.message.trim()}` : "",
    draft.composition.trim() ? `Compositie: ${draft.composition.trim()}` : "",
    draft.camera.trim() ? `Camera: ${draft.camera.trim()}` : "",
    draft.light.trim() ? `Licht: ${draft.light.trim()}` : "",
    draft.textSpace ? "Houd vrije ruimte voor tekst." : "",
  ].filter(Boolean).join("\n");

  const styleLines = visualLines(visual);
  const voiceLine = voice.summary.trim() ? `Merkstem, alleen als sfeer: ${voice.summary.trim()}` : "";
  const colorLines = colors.filter((color) => !color.archived && color.hex).map((color) => `${color.name || "Kleur"} ${color.hex}${color.role !== "unknown" ? ` (${color.role})` : ""}`);
  if (styleLines.length === 0 && colorLines.length === 0) missing.push("Beeldstijl of merkkleuren");
  const style = [
    styleLines.length ? "Vastgelegde beeldstijl:" : "",
    ...styleLines,
    colorLines.length ? `Merkkleuren: ${colorLines.join(", ")}.` : "",
    voiceLine,
    draft.exclusions.trim() ? `Vermijd: ${draft.exclusions.trim()}` : "",
    visual.avoid.length ? `Vermijd volgens de merkrichtlijn: ${visual.avoid.join(", ")}.` : "",
  ].filter(Boolean).join("\n");

  const full = [assignment, style, STANDARD].filter((part) => part.trim()).join("\n\n");
  return {
    assignment,
    style,
    full,
    missing,
    label: styleLines.length || colorLines.length ? "Samengesteld uit merkrichtlijnen" : "Opdracht zonder vastgelegde beeldstijl",
  };
}

function visualLines(visual: BrandVisual): string[] {
  const pairs: [string, string][] = [
    ["Medium", visual.medium],
    ["Onderwerpen", visual.subjects],
    ["Compositie", visual.composition],
    ["Licht", visual.light],
    ["Kleurgebruik", visual.colorUse],
    ["Materialen", visual.materials],
    ["Texturen", visual.textures],
    ["Sfeer", visual.mood],
    ["Achtergrond", visual.backgrounds],
    ["Camera", visual.camera],
    ["Ruimte voor tekst", visual.textSpace],
    ["Samenvatting", visual.summary],
  ];
  const lines = pairs.filter(([, value]) => value.trim()).map(([label, value]) => `${label}: ${value.trim()}`);
  if (visual.wanted.length) lines.push(`Gewenst: ${visual.wanted.join(", ")}.`);
  return lines;
}
