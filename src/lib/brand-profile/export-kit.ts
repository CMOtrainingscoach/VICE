import type { BrandAsset, BrandColor, BrandFontAsset, BrandProfilePublished, BrandProfileWorkbench, PromptTemplate, TypeStyle } from "@/lib/brand-profile/types";

type KitSource = {
  concept: boolean;
  tenantName: string;
  versionNumber: number;
  brandName: string;
  essence: string;
  positioning: string;
  promise: string;
  audience: string;
  valuesText: string;
  styles: TypeStyle[];
  colors: BrandColor[];
  fonts: BrandFontAsset[];
  assets: BrandAsset[];
  prompts: PromptTemplate[];
  voiceSummary: string;
  visualSummary: string;
};

export function kitSource(data: BrandProfileWorkbench | BrandProfilePublished): KitSource {
  const version = data.version;
  if (!version) throw new Error("Geen merkversie");
  return {
    concept: version.status === "draft",
    tenantName: data.tenantName,
    versionNumber: version.versionNumber,
    brandName: version.brandName,
    essence: version.essence,
    positioning: version.positioning,
    promise: version.promise,
    audience: version.audience,
    valuesText: version.valuesText,
    styles: data.styles.filter((style) => !style.archived),
    colors: data.colors.filter((color) => !color.archived),
    fonts: data.fonts,
    assets: data.assets,
    prompts: data.prompts.filter((prompt) => !prompt.archived),
    voiceSummary: version.voice.summary,
    visualSummary: version.visual.summary || version.visual.mood,
  };
}

export function brandKitFiles(source: KitSource): { name: string; data: Uint8Array }[] {
  const encoder = new TextEncoder();
  const prefix = source.concept ? "concept-" : "";
  const files = [
    { name: `${prefix}brand.json`, data: encoder.encode(brandJson(source)) },
    { name: `${prefix}brand.css`, data: encoder.encode(brandCss(source)) },
    { name: `${prefix}merkhandleiding.html`, data: encoder.encode(brandHtml(source)) },
    { name: `${prefix}prompts.txt`, data: encoder.encode(promptText(source)) },
    { name: "bestanden.txt", data: encoder.encode(fileList(source)) },
  ];
  return files;
}

function brandJson(source: KitSource): string {
  return JSON.stringify({
    concept: source.concept,
    tenant: source.tenantName,
    version: source.versionNumber,
    brandName: source.brandName,
    essence: source.essence,
    positioning: source.positioning,
    promise: source.promise,
    audience: source.audience,
    values: source.valuesText,
    voice: source.voiceSummary,
    visual: source.visualSummary,
    colors: source.colors.map((color) => ({ name: color.name, hex: color.hex, rgb: color.rgb, role: color.role, cmyk: color.cmyk, pantone: color.pantone })),
    typography: source.styles.map((style) => ({ role: style.role, family: style.family, weight: style.weight, size: style.size, unit: style.unit, fallback: style.fallback })),
    prompts: source.prompts.map((prompt) => ({ name: prompt.name, purpose: prompt.purpose, body: prompt.body })),
  }, null, 2);
}

export function brandCss(source: KitSource): string {
  const scope = `.vice-brand-v${source.versionNumber}`;
  const lines = [`${scope} {`];
  for (const color of source.colors) {
    if (!color.hex) continue;
    lines.push(`  --vb-${slug(color.name || color.role)}: ${color.hex};`);
  }
  lines.push("}");
  for (const style of source.styles) {
    const rules = [
      style.family ? `font-family: ${cssString(style.family)}${style.fallback ? `, ${style.fallback}` : ""};` : "",
      style.weight ? `font-weight: ${cssNumber(style.weight)};` : "",
      style.italic ? "font-style: italic;" : "",
      style.size && style.unit ? `font-size: ${cssNumber(style.size)}${style.unit};` : "",
      style.lineHeight ? `line-height: ${cssNumber(style.lineHeight)};` : "",
      style.letterSpacing ? `letter-spacing: ${cssNumber(style.letterSpacing)};` : "",
      style.transform ? `text-transform: ${cssIdent(style.transform)};` : "",
    ].filter(Boolean);
    if (rules.length === 0) continue;
    lines.push(`${scope} .vb-${slug(style.role)} {`, ...rules.map((rule) => `  ${rule}`), "}");
  }
  return `${lines.join("\n")}\n`;
}

function brandHtml(source: KitSource): string {
  const banner = source.concept ? "<p>Concept. Dit is geen goedgekeurde merkstandaard.</p>" : "";
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>${escapeHtml(source.brandName || source.tenantName)} — merkhandleiding</title></head><body>${banner}<h1>${escapeHtml(source.brandName || "Merk")}</h1><p>Versie ${source.versionNumber}</p>${field("Essentie", source.essence)}${field("Positionering", source.positioning)}${field("Belofte", source.promise)}${field("Doelgroep", source.audience)}${field("Waarden", source.valuesText)}${field("Stem", source.voiceSummary)}${field("Beeld", source.visualSummary)}<h2>Kleuren</h2><ul>${source.colors.map((color) => `<li>${escapeHtml(color.name)} ${escapeHtml(color.hex)} ${escapeHtml(color.rgb)}</li>`).join("")}</ul><h2>Typografie</h2><ul>${source.styles.map((style) => `<li>${escapeHtml(style.role)}: ${escapeHtml(style.family || "Font niet vastgelegd")}</li>`).join("")}</ul></body></html>`;
}

function promptText(source: KitSource): string {
  if (source.prompts.length === 0) return "Geen prompttemplates.\n";
  return source.prompts.map((prompt) => [`# ${prompt.name}`, prompt.purpose, prompt.body, ""].filter(Boolean).join("\n")).join("\n");
}

function fileList(source: KitSource): string {
  const included = source.assets.filter((asset) => asset.exportAllowed && asset.path);
  const excluded = source.assets.filter((asset) => asset.path && !asset.exportAllowed);
  const fonts = source.fonts.filter((font) => font.exportAllowed && font.path);
  const blockedFonts = source.fonts.filter((font) => font.path && !font.exportAllowed);
  return [
    `Versie ${source.versionNumber}${source.concept ? " · concept" : ""}`,
    "Logo's en beelden in deze export:",
    included.length ? included.map((asset) => asset.name).join("\n") : "Geen toegestane beeldbestanden.",
    "Niet opgenomen:",
    excluded.length ? excluded.map((asset) => `${asset.name} (rechten laten export niet toe)`).join("\n") : "Geen.",
    "Fonts in deze export:",
    fonts.length ? fonts.map((font) => font.name).join("\n") : "Geen fonts met vastgelegde exportrechten.",
    blockedFonts.length ? `Niet opgenomen: ${blockedFonts.map((font) => font.name).join(", ")}.` : "",
  ].filter(Boolean).join("\n");
}

function field(label: string, value: string): string {
  return `<h2>${escapeHtml(label)}</h2><p>${escapeHtml(value || "Nog niet vastgelegd")}</p>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char] ?? char);
}

function slug(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug || "item";
}

function cssString(value: string): string {
  return `"${value.replace(/["\\]/g, "").slice(0, 80)}"`;
}

function cssNumber(value: string): string {
  return value.replace(/[^0-9.-]/g, "") || "0";
}

function cssIdent(value: string): string {
  return ["none", "uppercase", "lowercase", "capitalize"].includes(value) ? value : "none";
}
