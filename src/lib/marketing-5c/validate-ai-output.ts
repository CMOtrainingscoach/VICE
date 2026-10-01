import {
  FIVE_C_KEYS,
  FIVE_C_QUALIFIERS,
  type FiveCContentType,
  type FiveCEvidenceLevel,
  type FiveCKey,
} from "@/lib/marketing-5c/constants";
import { isEntryAllowedForC, type FiveCCatalogEntry } from "@/lib/marketing-5c/input-catalog";

export type RawAiItem = {
  title?: unknown;
  finding?: unknown;
  client_relevance?: unknown;
  content_type?: unknown;
  evidence_level?: unknown;
  qualifier?: unknown;
  refs?: unknown;
  open_question?: unknown;
  gap_reason?: unknown;
};

export type ValidatedRef = {
  ref_type: FiveCCatalogEntry["ref_type"];
  ref_id: string;
  label: string;
  excerpt: string;
};

export type ValidatedItem = {
  title: string;
  finding: string;
  client_relevance: string;
  content_type: FiveCContentType;
  evidence_level: FiveCEvidenceLevel;
  qualifier: string;
  open_question: string;
  gap_reason: string;
  unsupported: boolean;
  unsupported_reason: string;
  refs: ValidatedRef[];
};

const CONTENT_TYPES: FiveCContentType[] = ["adopted", "derived", "input_needed"];
const EVIDENCE_LEVELS: FiveCEvidenceLevel[] = ["provided", "observed", "hypothesis"];
const DOSSIER_REF_TYPES = new Set(["tenant_profile", "meeting", "pestel_input", "manual"]);

const STOPWORDS = new Set([
  "aanbod", "alleen", "andere", "binnen", "daarom", "deze", "dienen", "door", "eerst",
  "elkaar", "en", "geven", "hebben", "hierdoor", "kunnen", "maken", "meer", "minder",
  "moeten", "omdat", "onder", "tussen", "vanuit", "verder", "volgens", "waardoor",
  "wordt", "worden", "zijn", "zullen", "klant", "klanten", "bedrijf", "markt",
]);

function str(v: unknown, max: number): string {
  if (v == null) return "";
  return String(v).trim().slice(0, max);
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function significantTokens(text: string): string[] {
  return normalize(text)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 5 && !STOPWORDS.has(w));
}

/** Aandeel inhoudswoorden uit de bewering dat in de bronteksten voorkomt (stam-match). */
export function sourceSupportRatio(claim: string, sourceText: string): number {
  const tokens = [...new Set(significantTokens(claim))];
  if (tokens.length === 0) return 1;
  const haystack = normalize(sourceText);
  const hits = tokens.filter((t) => haystack.includes(t.slice(0, Math.max(5, t.length - 2))));
  return hits.length / tokens.length;
}

/** Cijfers/percentages in de bewering die niet letterlijk in de bronnen staan. */
export function unsupportedNumbers(claim: string, sourceText: string): string[] {
  const matches = claim.match(/\d+(?:[.,]\d+)?\s*%?/g) ?? [];
  const haystack = sourceText.replace(/\s+/g, "");
  return [...new Set(matches.map((m) => m.replace(/\s+/g, "")))].filter(
    (n) => !haystack.includes(n),
  );
}

/** Eigennamen (hoofdletter midden in zin) die nergens in de bronnen voorkomen. */
export function unsupportedProperNames(claim: string, sourceText: string): string[] {
  const haystack = normalize(sourceText);
  const names = new Set<string>();
  for (const sentence of claim.split(/[.!?:\n]+/)) {
    const words = sentence.trim().split(/\s+/).slice(1);
    for (const raw of words) {
      const w = raw.replace(/[^\p{L}\p{N}&'-]/gu, "");
      if (w.length >= 3 && /^\p{Lu}/u.test(w) && !haystack.includes(normalize(w))) {
        names.add(w);
      }
    }
  }
  return [...names];
}

function resolveQualifier(
  cKey: FiveCKey,
  proposed: string,
  refs: FiveCCatalogEntry[],
): string {
  const options = FIVE_C_QUALIFIERS[cKey];
  if (!options) return "";
  const dossierRefs = refs.filter((r) => DOSSIER_REF_TYPES.has(r.ref_type));
  const porterRefs = refs.filter((r) => r.ref_type === "porter_force" || r.ref_type === "porter_factor");
  let q = proposed in options ? proposed : "";

  if (cKey === "customers") {
    if (dossierRefs.length === 0) return "hypothesis";
    const distinctSources = new Set(dossierRefs.map((r) => r.key)).size;
    if (q === "pattern" && distinctSources < 2) q = "single_statement";
    return q || (distinctSources >= 2 ? "pattern" : "single_statement");
  }

  if (cKey === "competitors") {
    const forceKeys = new Set(porterRefs.map((r) => r.force_key));
    const hasDirectBasis = forceKeys.has("rivalry") || refs.some((r) => r.ref_type === "porter_scope");
    if (!hasDirectBasis && forceKeys.has("substitutes")) return "substitute";
    if (!hasDirectBasis && forceKeys.has("new_entrants")) return "new_entrant";
    if (q === "direct" && !hasDirectBasis) return forceKeys.has("substitutes") ? "substitute" : "new_entrant";
    return q || "direct";
  }

  if (cKey === "collaborators") {
    if (dossierRefs.length === 0 && porterRefs.length > 0) return "market_supplier";
    if (q === "market_supplier" && dossierRefs.length > 0 && porterRefs.length === 0) return "mentioned";
    if (dossierRefs.length === 0 && q !== "needed_type") return "needed_type";
    return q || "mentioned";
  }

  return q;
}

export function validateAiItem(
  raw: RawAiItem,
  cKey: FiveCKey,
  refMap: Map<string, FiveCCatalogEntry>,
): ValidatedItem | null {
  const title = str(raw.title, 300);
  const finding = str(raw.finding, 6000);
  const clientRelevance = str(raw.client_relevance, 3000);
  if (!title && !finding) return null;

  let contentType: FiveCContentType =
    CONTENT_TYPES.includes(raw.content_type as FiveCContentType) ?
      (raw.content_type as FiveCContentType)
    : "input_needed";

  const reasons: string[] = [];
  const refKeys = Array.isArray(raw.refs) ? raw.refs.map((r) => String(r).trim()) : [];
  const refs: FiveCCatalogEntry[] = [];
  for (const key of refKeys) {
    const entry = refMap.get(key);
    if (!entry) {
      reasons.push(`Onbekende bronverwijzing ${key} genegeerd`);
      continue;
    }
    if (!isEntryAllowedForC(entry, cKey)) {
      reasons.push(`Bron "${entry.label}" hoort niet bij dit onderdeel`);
      continue;
    }
    if (!refs.some((r) => r.key === entry.key)) refs.push(entry);
  }

  const sourceText = refs.map((r) => `${r.label}\n${r.text}`).join("\n\n");
  let unsupported = false;

  if (contentType !== "input_needed") {
    if (refs.length === 0) {
      unsupported = true;
      reasons.push("Geen geldige bron in het dossier");
    } else {
      const claim = `${title}. ${finding}`;
      const ratio = sourceSupportRatio(claim, sourceText);
      const threshold = contentType === "adopted" ? 0.3 : 0.15;
      if (ratio < threshold) {
        unsupported = true;
        reasons.push("De gekoppelde bron ondersteunt deze bewering onvoldoende");
      }
      const numbers = unsupportedNumbers(`${claim} ${clientRelevance}`, sourceText);
      if (numbers.length > 0) {
        unsupported = true;
        reasons.push(`Cijfer(s) niet in bron: ${numbers.join(", ")}`);
      }
      if (cKey === "collaborators" || cKey === "competitors") {
        const names = unsupportedProperNames(claim, sourceText);
        if (names.length > 0) {
          unsupported = true;
          reasons.push(`Naam niet in bron: ${names.join(", ")}`);
        }
      }
    }
  }

  let evidence: FiveCEvidenceLevel =
    EVIDENCE_LEVELS.includes(raw.evidence_level as FiveCEvidenceLevel) ?
      (raw.evidence_level as FiveCEvidenceLevel)
    : "hypothesis";
  if (contentType === "derived" || unsupported) evidence = "hypothesis";
  if (refs.some((r) => r.evidence_level === "hypothesis")) evidence = "hypothesis";

  const qualifier = resolveQualifier(cKey, str(raw.qualifier, 50), refs);
  if (cKey === "customers" && qualifier === "hypothesis") evidence = "hypothesis";

  let openQuestion = str(raw.open_question, 1000);
  if (contentType === "input_needed" && !openQuestion) {
    openQuestion = `Wat kunnen we bevestigen over: ${title || finding.slice(0, 80)}?`;
  }
  if (unsupported && contentType === "adopted") contentType = "derived";

  return {
    title: title || finding.slice(0, 80),
    finding,
    client_relevance: clientRelevance,
    content_type: contentType,
    evidence_level: evidence,
    qualifier,
    open_question: openQuestion,
    gap_reason: str(raw.gap_reason, 1000),
    unsupported,
    unsupported_reason: reasons.join(" · ").slice(0, 500),
    refs: refs.map((r) => ({
      ref_type: r.ref_type,
      ref_id: r.ref_id,
      label: r.label,
      excerpt: r.text.slice(0, 600),
    })),
  };
}

export type ValidatedContradiction = {
  title: string;
  description: string;
  source_a: { ref_type: string; ref_id: string; label: string; date: string | null };
  source_b: { ref_type: string; ref_id: string; label: string; date: string | null };
  affected_keys: FiveCKey[];
};

export function validateAiContradiction(
  raw: Record<string, unknown>,
  refMap: Map<string, FiveCCatalogEntry>,
): ValidatedContradiction | null {
  const a = refMap.get(String(raw.source_a ?? "").trim());
  const b = refMap.get(String(raw.source_b ?? "").trim());
  if (!a || !b || a.key === b.key) return null;
  const affected = Array.isArray(raw.affected_keys) ?
      raw.affected_keys.filter((k): k is FiveCKey => FIVE_C_KEYS.includes(k as FiveCKey))
    : [];
  const description = str(raw.description, 2000);
  if (!description) return null;
  const toRef = (e: FiveCCatalogEntry) => ({
    ref_type: e.ref_type,
    ref_id: e.ref_id,
    label: e.label,
    date: e.date,
  });
  return {
    title: str(raw.title, 300) || "Tegenstrijdige informatie",
    description,
    source_a: toRef(a),
    source_b: toRef(b),
    affected_keys: affected.length ? [...new Set(affected)] : ["company"],
  };
}

export type ValidatedCoherencePoint = {
  statement: string;
  refs: { ref_type: string; ref_id: string; label: string; date: string | null }[];
};

export function validateAiCoherencePoint(
  raw: Record<string, unknown>,
  refMap: Map<string, FiveCCatalogEntry>,
): ValidatedCoherencePoint | null {
  const statement = str(raw.statement, 1500);
  if (statement.length < 15) return null;
  const refs = (Array.isArray(raw.refs) ? raw.refs : [])
    .map((k) => refMap.get(String(k).trim()))
    .filter((e): e is FiveCCatalogEntry => Boolean(e));
  if (refs.length === 0) return null;
  const sourceText = refs.map((r) => r.text).join("\n");
  if (unsupportedNumbers(statement, sourceText).length > 0) return null;
  return {
    statement,
    refs: [...new Map(refs.map((r) => [r.key, r])).values()].map((e) => ({
      ref_type: e.ref_type,
      ref_id: e.ref_id,
      label: e.label,
      date: e.date,
    })),
  };
}
