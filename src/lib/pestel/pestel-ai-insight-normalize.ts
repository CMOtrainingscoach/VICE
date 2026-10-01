import { normalizeWebUrl, type PestelWebHit } from "@/lib/pestel/pestel-web-evidence";

/**
 * Aligns AI JSON with the manual insight form (pestelInsightSchema / Inzicht bewerken):
 * title, observation, client_relevance, opportunity_risk, impact, impact_note,
 * insight_time_horizon, evidence_level, sources (+ advisor_note only on manual save).
 */

export const OPPORTUNITY_RISK_VALUES = ["opportunity", "risk", "both", "unclear"] as const;
export const IMPACT_VALUES = ["low", "medium", "high", "unknown"] as const;
export const EVIDENCE_LEVEL_VALUES = ["provided", "observed", "hypothesis"] as const;
export const SOURCE_TYPE_VALUES = ["website", "meeting", "manual", "document"] as const;

export type OpportunityRisk = (typeof OPPORTUNITY_RISK_VALUES)[number];
export type ImpactLevel = (typeof IMPACT_VALUES)[number];
export type EvidenceLevel = (typeof EVIDENCE_LEVEL_VALUES)[number];
export type SourceType = (typeof SOURCE_TYPE_VALUES)[number];

export const AI_MIN_OBSERVATION = 20;
export const AI_MIN_RELEVANCE = 10;
export const AI_MIN_EXCERPT = 20;

export function asTrimmed(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

export function mergeTextParts(...parts: string[]): string {
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstNonEmptyString(...values: unknown[]): string {
  for (const v of values) {
    const s = asTrimmed(v);
    if (s) return s.toLowerCase();
  }
  return "";
}

export function asBoolean(v: unknown, fallback = false): boolean {
  if (typeof v === "boolean") return v;
  if (v == null) return fallback;
  const s = String(v).trim().toLowerCase();
  if (["true", "1", "yes", "ja"].includes(s)) return true;
  if (["false", "0", "no", "nee"].includes(s)) return false;
  return fallback;
}

export function mapOpportunityRisk(ins: Record<string, unknown>): OpportunityRisk {
  const s = firstNonEmptyString(
    ins.opportunity_risk,
    ins.opportunityRisk,
    ins.opportunity_or_risk,
    ins.opportunityOrRisk,
    ins.kans_risico,
  );
  if (!s) return "unclear";
  if (OPPORTUNITY_RISK_VALUES.includes(s as OpportunityRisk)) {
    return s as OpportunityRisk;
  }
  if (
    s.includes("both")
    || s.includes("beide")
    || s.includes("kans en risico")
    || s.includes("opportunity and risk")
  ) {
    return "both";
  }
  if (
    s.includes("kans")
    || s.includes("opportun")
    || s.includes("chance")
    || s === "positief"
  ) {
    return "opportunity";
  }
  if (
    s.includes("risico")
    || s.includes("risk")
    || s.includes("bedreig")
    || s.includes("threat")
    || s === "negatief"
  ) {
    return "risk";
  }
  return "unclear";
}

export function mapImpact(ins: Record<string, unknown>): ImpactLevel {
  const s = firstNonEmptyString(ins.impact, ins.impact_level, ins.impactLevel);
  if (!s) return "unknown";
  if (IMPACT_VALUES.includes(s as ImpactLevel)) return s as ImpactLevel;
  if (s.includes("hoog") || s.includes("high") || s.includes("groot")) return "high";
  if (s.includes("laag") || s.includes("low") || s.includes("klein")) return "low";
  if (s.includes("gemiddeld") || s.includes("medium") || s.includes("mid")) {
    return "medium";
  }
  return "unknown";
}

export function mapEvidenceLevel(ins: Record<string, unknown>): EvidenceLevel {
  const s = firstNonEmptyString(
    ins.evidence_level,
    ins.evidenceLevel,
    ins.evidence,
    ins.onderbouwing,
  );
  if (!s) return "observed";
  if (EVIDENCE_LEVEL_VALUES.includes(s as EvidenceLevel)) return s as EvidenceLevel;
  if (s.includes("hypoth") || s.includes("vermoed") || s.includes("onzeker")) {
    return "hypothesis";
  }
  if (s.includes("provided") || s.includes("intern") || s.includes("meeting")) {
    return "provided";
  }
  if (s.includes("observe") || s.includes("waargenomen")) return "observed";
  return "observed";
}

export function mapSourceType(src: Record<string, unknown>): SourceType {
  const url = asTrimmed(src.url);
  const s = firstNonEmptyString(src.source_type, src.sourceType, src.type);
  if (SOURCE_TYPE_VALUES.includes(s as SourceType)) return s as SourceType;
  if (s.includes("web") || s.includes("site") || url) return "website";
  if (s.includes("meeting") || src.meeting_recording_id) return "meeting";
  if (s.includes("doc")) return "document";
  return url ? "website" : "manual";
}

export function deriveInsightTitle(observation: string): string {
  const trimmed = observation.trim();
  if (!trimmed) return "Extern PESTEL-inzicht";
  const firstLine = (trimmed.split(/\n/)[0] ?? trimmed).trim();
  const sentence =
    firstLine.match(/^[^.!?…]+[.!?…]?/)?.[0]?.trim() ?? firstLine;
  const candidate = sentence.length > 0 ? sentence : firstLine;
  if (candidate.length <= 300) return candidate;
  return `${candidate.slice(0, 297).trim()}…`;
}

function findWebHit(url: string, hits: PestelWebHit[]): PestelWebHit | undefined {
  const key = normalizeWebUrl(url);
  return hits.find((h) => normalizeWebUrl(h.url) === key);
}

export function webSnippetExcerpt(url: string, webEvidence: PestelWebHit[]): string {
  const hit = findWebHit(url, webEvidence);
  const snippet = hit?.snippet?.trim() ?? "";
  if (snippet.length < AI_MIN_EXCERPT) return "";
  return snippet.slice(0, 400);
}

/** Feitelijke website-bron: altijd live snippet (AI parafraseert te vaak voor excerpt-check). */
export function websiteFactExcerpt(
  url: string,
  webEvidence: PestelWebHit[],
  aiExcerpt: string,
): string {
  const fromWeb = webSnippetExcerpt(url, webEvidence);
  if (fromWeb) return fromWeb;
  return aiExcerpt.slice(0, 400);
}

export function repairSourceRow(
  s: unknown,
  webEvidence: PestelWebHit[],
  observationFallback: string,
): Record<string, unknown> | null {
  if (!s || typeof s !== "object" || Array.isArray(s)) return null;
  const src = s as Record<string, unknown>;
  let label = asTrimmed(src.label);
  const url = asTrimmed(src.url);
  if (!label && url) label = url.slice(0, 500);
  if (!label) label = "Bron";

  let excerpt = asTrimmed(src.excerpt);
  const sourceType = mapSourceType(src);
  const isInterpretation = asBoolean(src.is_ai_interpretation, false);
  if (sourceType === "website" && url) {
    if (!isInterpretation) {
      excerpt = websiteFactExcerpt(url, webEvidence, excerpt);
    } else if (excerpt.length < AI_MIN_EXCERPT) {
      const fromWeb = webSnippetExcerpt(url, webEvidence);
      if (fromWeb) excerpt = fromWeb;
    }
    if (excerpt.length < AI_MIN_EXCERPT) return null;
  } else if (excerpt.length < AI_MIN_EXCERPT) {
    excerpt = mergeTextParts(excerpt, label, observationFallback.slice(0, 280));
  }
  if (excerpt.length < AI_MIN_EXCERPT) {
    excerpt = `${label}: onderbouwing uit gekoppelde bron (modeloutput incompleet).`;
  }

  return {
    source_type: sourceType,
    label,
    url: url || undefined,
    publisher: asTrimmed(src.publisher) || undefined,
    meeting_recording_id: asTrimmed(src.meeting_recording_id) || undefined,
    meeting_offset_ms:
      typeof src.meeting_offset_ms === "number"
        ? src.meeting_offset_ms
        : undefined,
    excerpt: excerpt.slice(0, 4000),
    is_ai_interpretation: asBoolean(src.is_ai_interpretation, false),
  };
}

/** Ensure fact + interpretation flags when the model omits or mis-sets them. */
export function balanceInterpretationSources(
  sources: Record<string, unknown>[],
): Record<string, unknown>[] {
  if (sources.length === 0) return sources;

  const normalized: Record<string, unknown>[] = sources.map((s) => ({
    ...s,
    is_ai_interpretation: asBoolean(s.is_ai_interpretation, false),
  }));

  const hasFact = normalized.some((s) => !asBoolean(s.is_ai_interpretation, false));
  const hasInterp = normalized.some((s) => asBoolean(s.is_ai_interpretation, false));
  if (hasFact && hasInterp) return normalized;

  if (normalized.length === 1) {
    return [{ ...normalized[0], is_ai_interpretation: false }];
  }

  return normalized.map((s, i) => {
    const isWebsite = asTrimmed(s.source_type) === "website";
    if (!hasFact && isWebsite && i === 0) {
      return { ...s, is_ai_interpretation: false };
    }
    if (!hasInterp && i === normalized.length - 1) {
      return { ...s, is_ai_interpretation: true };
    }
    return s;
  });
}

export type NormalizeAiInsightOptions = {
  webEvidence: PestelWebHit[];
  defaultTimeHorizon: string;
};

/** One insight object → canonical snake_case fields ready for Zod. Returns null if unusable. */
export function normalizeAiInsightRecord(
  item: unknown,
  options: NormalizeAiInsightOptions,
): Record<string, unknown> | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const ins = item as Record<string, unknown>;
  const { webEvidence, defaultTimeHorizon } = options;

  const rawObservation = mergeTextParts(
    asTrimmed(ins.observation),
    asTrimmed(ins.waarneming),
    asTrimmed(ins.description),
    asTrimmed(ins.fact),
    asTrimmed(ins.summary),
    asTrimmed(ins.development),
  );

  let sources = Array.isArray(ins.sources)
    ? ins.sources
        .map((s) => repairSourceRow(s, webEvidence, rawObservation))
        .filter((s): s is Record<string, unknown> => s != null)
    : [];

  const excerptPool = sources
    .map((s) => asTrimmed(s.excerpt))
    .filter(Boolean);

  let observation = mergeTextParts(rawObservation, ...excerptPool.slice(0, 2));
  if (observation.length < AI_MIN_OBSERVATION) {
    observation = mergeTextParts(
      observation,
      asTrimmed(ins.title),
      asTrimmed(ins.titel),
      asTrimmed(ins.client_relevance),
      asTrimmed(ins.clientRelevance),
      asTrimmed(ins.relevance),
      asTrimmed(ins.betekenis_voor_klant),
    );
  }

  let clientRelevance = mergeTextParts(
    asTrimmed(ins.client_relevance),
    asTrimmed(ins.clientRelevance),
    asTrimmed(ins.relevance),
    asTrimmed(ins.betekenis_voor_klant),
  );
  if (clientRelevance.length < AI_MIN_RELEVANCE) {
    clientRelevance = mergeTextParts(clientRelevance, observation.slice(0, 400));
  }

  let title = mergeTextParts(asTrimmed(ins.title), asTrimmed(ins.titel));
  if (!title) title = deriveInsightTitle(observation);

  if (observation.length < AI_MIN_OBSERVATION) return null;

  sources = balanceInterpretationSources(
    sources
      .map((s) => repairSourceRow(s, webEvidence, observation))
      .filter((s): s is Record<string, unknown> => s != null),
  );

  if (sources.length === 0) return null;

  sources = sources.map((s) => {
    const url = asTrimmed(s.url);
    if (
      asTrimmed(s.source_type) === "website"
      && url
      && !asBoolean(s.is_ai_interpretation, false)
    ) {
      return {
        ...s,
        excerpt: websiteFactExcerpt(
          url,
          webEvidence,
          asTrimmed(s.excerpt),
        ),
      };
    }
    return s;
  });

  const impactNote = mergeTextParts(
    asTrimmed(ins.impact_note),
    asTrimmed(ins.impactNote),
    asTrimmed(ins.impact_toelichting),
  );

  let insightTimeHorizon = mergeTextParts(
    asTrimmed(ins.insight_time_horizon),
    asTrimmed(ins.insightTimeHorizon),
    asTrimmed(ins.tijdshorizon),
  );
  if (!insightTimeHorizon) insightTimeHorizon = defaultTimeHorizon;

  return {
    title: title.slice(0, 300),
    observation: observation.slice(0, 8000),
    client_relevance: clientRelevance.slice(0, 4000),
    opportunity_risk: mapOpportunityRisk(ins),
    impact: mapImpact(ins),
    impact_note: impactNote.slice(0, 1000),
    insight_time_horizon: insightTimeHorizon.slice(0, 200),
    evidence_level: mapEvidenceLevel(ins),
    sources,
  };
}

export function normalizeAiDimensionPayload(
  raw: unknown,
  options: NormalizeAiInsightOptions,
): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.insights)) return raw;

  const insights = obj.insights
    .map((item) => normalizeAiInsightRecord(item, options))
    .filter(Boolean);

  return { ...obj, insights };
}
