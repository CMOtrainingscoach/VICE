import { normalizeHex, roleFromText } from "@/lib/brand-profile/color";
import type { ColorRole, FieldOrigin, ReviewProposal } from "@/lib/brand-profile/types";

export type ImportedField = {
  key: string;
  value: string;
  sectionPath: string;
  passage: string;
  method: "heading" | "guideline";
};

export type ImportedReview = {
  section: string;
  label: string;
  origin: Exclude<FieldOrigin, "strategist">;
  sectionPath: string;
  passage: string;
  proposal: ReviewProposal | null;
};

export type ImportedColor = {
  name: string;
  hex: string;
  role: ColorRole;
  note: string;
  sectionPath: string;
  passage: string;
};

export type ImportedStyle = {
  role: string;
  family: string;
  size: string;
  unit: string;
  sectionPath: string;
  passage: string;
};

export type ImportedPrompt = {
  name: string;
  body: string;
  sectionPath: string;
  passage: string;
};

export type ImportedAssetNote = {
  name: string;
  sectionPath: string;
  passage: string;
};

export type AuditMarkdownImport = {
  brandName: ImportedField | null;
  fields: ImportedField[];
  reviews: ImportedReview[];
  colors: ImportedColor[];
  styles: ImportedStyle[];
  prompts: ImportedPrompt[];
  assetNotes: ImportedAssetNote[];
  warnings: string[];
  hasBrandSection: boolean;
};

const GUIDELINE_KINDS = new Set(["Brand guidelines", "Merkstrategie"]);
const FIELD_LINE = /^(merkessentie|essentie|positionering|kernbelofte|belofte|doelgroep|merkwaarden|tone of voice|merkstem|beeldstijl)\s*[:：]\s*(.+)$/i;
const FONT_LINE = /(?:lettertype|font-family|fontfamilie|font)\s*[:：]\s*([^,;\n]+)/i;
const SIZE = /(\d+(?:[.,]\d+)?)\s*(px|rem|em)\b/i;
const PROMPT_LINE = /^prompt\s*[:：]\s*(.+)$/i;
const ASSET_URL = /https?:\/\/\S+\.(?:svg|png|jpe?g|webp)\b/i;
const COLOR_LINE = /^kleur(?:en)?\s*[:：]\s*(.+)$/i;

const REVIEW_LABELS = new Set([
  "Beoogde positionering",
  "Conclusie",
  "Sterkste onderbouwde associaties",
  "Zwakste onderbouwde onderdelen",
  "Onderbouwde marktperceptie",
  "Verschil",
  "Aanvaarde onzekerheid",
  "Open vragen",
  "Beoogd",
  "Waargenomen",
  "Voorstel",
  "Observatie",
  "Betekenis",
]);

const OBSERVED: Record<string, { section: string; key?: string }> = {
  "Beoogde positionering": { section: "overview", key: "positioning" },
  Conclusie: { section: "overview" },
  "Sterkste onderbouwde associaties": { section: "overview" },
  "Zwakste onderbouwde onderdelen": { section: "overview" },
  "Onderbouwde marktperceptie": { section: "overview" },
  Verschil: { section: "overview" },
  "Aanvaarde onzekerheid": { section: "overview" },
  "Open vragen": { section: "overview" },
  Beoogd: { section: "overview" },
  Waargenomen: { section: "overview" },
  Voorstel: { section: "overview" },
};

export function parseAuditMarkdown(markdown: string): AuditMarkdownImport {
  const result: AuditMarkdownImport = {
    brandName: null,
    fields: [],
    reviews: [],
    colors: [],
    styles: [],
    prompts: [],
    assetNotes: [],
    warnings: [],
    hasBrandSection: false,
  };
  const established = new Map<string, ImportedField[]>();
  let h2 = "";
  let h3 = "";
  let inBrand = false;
  let sourceName = "";
  let sourceKind = "";
  let sourceText = "";
  let recognized = 0;

  const flushSource = () => {
    if (!sourceName) return;
    const path = `## 10. Brand audit / ### Bron · ${sourceName}`;
    if (GUIDELINE_KINDS.has(sourceKind) && sourceText.trim()) {
      recognized += extractGuideline(sourceText, path, result, established);
    } else if (sourceText.trim()) {
      result.reviews.push({
        section: "overview",
        label: `Bron · ${sourceName}`,
        origin: "observed",
        sectionPath: path,
        passage: sourceText.trim(),
        proposal: null,
      });
      recognized += 1;
    }
    sourceName = "";
    sourceKind = "";
    sourceText = "";
  };

  for (const line of markdown.split(/\r?\n/)) {
    const h1 = line.match(/^#\s+Strategische audit\s+[—–-]\s+(.+)$/);
    if (h1) {
      const name = h1[1].trim();
      if (name) {
        result.brandName = {
          key: "brandName",
          value: name,
          sectionPath: "#",
          passage: line.trim(),
          method: "heading",
        };
      }
      continue;
    }
    const nextH2 = line.match(/^##\s+(.+)$/);
    if (nextH2) {
      flushSource();
      h2 = nextH2[1].trim();
      h3 = "";
      inBrand = h2.startsWith("10. Brand audit");
      if (inBrand) result.hasBrandSection = true;
      continue;
    }
    if (!inBrand) continue;
    const nextH3 = line.match(/^###\s+(.+)$/);
    if (nextH3) {
      flushSource();
      h3 = nextH3[1].trim();
      if (h3.startsWith("Bron · ")) sourceName = h3.slice("Bron · ".length).trim();
      continue;
    }
    const bullet = line.match(/^-\s+([^:]+):\s*(.*)$/);
    if (bullet) {
      const label = bullet[1].trim();
      const value = bullet[2].trim();
      if (label === "Soort") sourceKind = value;
      if (label === "URL" && GUIDELINE_KINDS.has(sourceKind) && ASSET_URL.test(value)) {
        const name = decodeURIComponent(value.split("/").pop() ?? "Asset");
        result.assetNotes.push({ name, sectionPath: sectionPath(h2, h3), passage: line.trim() });
        recognized += 1;
      }
      if (label === "Prioriteit" && value) {
        result.reviews.push(review("overview", "Prioriteit", "recommended", sectionPath(h2, h3), line.trim(), null));
        recognized += 1;
      }
      continue;
    }
    const labeled = line.match(/^\*\*([^*]+)\.\*\*\s*(.*)$/);
    if (labeled && sourceName && labeled[1].trim() === "Tekst") {
      sourceText = labeled[2].trim();
      continue;
    }
    if (labeled && !sourceName) {
      const label = labeled[1].trim();
      const value = labeled[2].trim();
      if (!value || !REVIEW_LABELS.has(label)) continue;
      const hypothesis = /\(hypothese\)/i.test(value) || /\(hypothese\)/i.test(h3);
      const origin: ImportedReview["origin"] = label === "Voorstel" ? "recommended" : hypothesis ? "hypothesis" : "observed";
      const known = OBSERVED[label];
      const path = sectionPath(h2, h3);
      const display = label === "Beoogd" || label === "Waargenomen" ? `${label} · ${h3 || "merk"}` : label;
      const proposal = proposalFor(label, value, h3, known?.key);
      result.reviews.push(review(known?.section ?? "overview", display, origin, path, line.trim(), origin === "hypothesis" ? null : proposal));
      recognized += 1;
    }
    if (sourceName && line.trim() && !line.startsWith("- ") && !line.startsWith("#")) {
      sourceText = [sourceText, line.trim()].filter(Boolean).join("\n");
    }
  }
  flushSource();

  for (const [key, items] of established) {
    if (items.length === 1) result.fields.push(items[0]);
    else {
      result.warnings.push(`Tegenstrijdige richtlijnen voor ${key}.`);
      for (const item of items) {
        result.reviews.push(review("overview", `Tegenstrijdige richtlijn · ${key}`, "unknown", item.sectionPath, item.passage, {
          kind: "field",
          key,
          value: item.value,
        }));
      }
    }
  }

  if (!result.hasBrandSection) result.warnings.push("Dit document heeft geen merksectie.");
  else if (recognized === 0 && result.fields.length === 0 && result.colors.length === 0 && result.styles.length === 0) {
    result.warnings.push("De merksectie bevat geen herkenbare merkgegevens.");
  }
  return result;
}

function proposalFor(label: string, value: string, heading: string, key?: string): ReviewProposal | null {
  if (key) return { kind: "field", key, value: value.replace(/\s*\(hypothese\)\s*/gi, "").trim() };
  if (label === "Beoogd" && /imago|beeld/i.test(heading)) return { kind: "visual", value };
  if (label === "Beoogd" && /gevoel|stem|associatie/i.test(heading)) return { kind: "voice", value };
  return null;
}

function review(
  section: string,
  label: string,
  origin: ImportedReview["origin"],
  sectionPath: string,
  passage: string,
  proposal: ReviewProposal | null,
): ImportedReview {
  return { section, label, origin, sectionPath, passage, proposal };
}

function sectionPath(h2: string, h3: string): string {
  return [`## ${h2}`, h3 ? `### ${h3}` : ""].filter(Boolean).join(" / ");
}

function extractGuideline(
  text: string,
  path: string,
  result: AuditMarkdownImport,
  established: Map<string, ImportedField[]>,
): number {
  let found = 0;
  const fence = text.match(/```[\s\S]*?```/);
  if (fence) {
    const body = fence[0].replace(/```/g, "").trim();
    if (body) {
      result.prompts.push({ name: "Prompt uit richtlijn", body, sectionPath: path, passage: fence[0] });
      found += 1;
    }
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("```")) continue;
    const field = line.match(FIELD_LINE);
    if (field) {
      const key = fieldKey(field[1]);
      const value = field[2].trim();
      if (key && value) {
        const bucket = established.get(key) ?? [];
        bucket.push({ key, value, sectionPath: path, passage: line, method: "guideline" });
        established.set(key, bucket);
        found += 1;
      }
    }
    const prompt = line.match(PROMPT_LINE);
    if (prompt?.[1].trim()) {
      result.prompts.push({ name: "Prompt uit richtlijn", body: prompt[1].trim(), sectionPath: path, passage: line });
      found += 1;
    }
    const font = line.match(FONT_LINE);
    if (font?.[1].trim()) {
      const size = line.match(SIZE);
      result.styles.push({
        role: styleRole(line),
        family: font[1].trim(),
        size: size ? size[1].replace(",", ".") : "",
        unit: size ? size[2].toLowerCase() : "",
        sectionPath: path,
        passage: line,
      });
      found += 1;
    }
    const colorName = line.match(COLOR_LINE);
    const hexes = [...line.matchAll(/#([0-9a-f]{3}|[0-9a-f]{6})\b/gi)];
    if (hexes.length > 0) {
      for (const hex of hexes) {
        const normalized = normalizeHex(hex[0]);
        if (!normalized || result.colors.some((color) => color.hex === normalized)) continue;
        const name = line.replace(hex[0], "").replace(/[:#]/g, " ").replace(/\s+/g, " ").trim() || "Kleur";
        result.colors.push({
          name: name.slice(0, 80),
          hex: normalized,
          role: roleFromText(line),
          note: "",
          sectionPath: path,
          passage: line,
        });
        found += 1;
      }
    } else if (colorName?.[1].trim()) {
      result.reviews.push(review("color", "Kleur genoemd zonder code", "unknown", path, line, null));
      found += 1;
    }
    const asset = line.match(ASSET_URL);
    if (asset) {
      const name = decodeURIComponent(asset[0].split("/").pop() ?? "Asset");
      result.assetNotes.push({ name, sectionPath: path, passage: line });
      found += 1;
    }
  }
  if (found === 0) {
    result.reviews.push(review("overview", "Richtlijntekst", "established", path, text.trim(), null));
    found = 1;
  }
  return found;
}

function fieldKey(label: string): string | null {
  const value = label.toLowerCase();
  if (value === "merkessentie" || value === "essentie") return "essence";
  if (value === "positionering") return "positioning";
  if (value === "kernbelofte" || value === "belofte") return "promise";
  if (value === "doelgroep") return "audience";
  if (value === "merkwaarden") return "values";
  if (value === "tone of voice" || value === "merkstem") return "voice";
  if (value === "beeldstijl") return "visual";
  return null;
}

function styleRole(line: string): string {
  const text = line.toLowerCase();
  if (/\bh1\b|kop\b|display/.test(text)) return "H1";
  if (/\bh2\b/.test(text)) return "H2";
  if (/\bh3\b/.test(text)) return "H3";
  if (/broodtekst|body/.test(text)) return "Body";
  if (/caption|klein/.test(text)) return "Caption";
  return "Merkfont";
}
