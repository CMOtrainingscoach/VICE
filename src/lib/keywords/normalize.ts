export type NormalizedKeywordIdea = {
  keyword: string;
  avgMonthlySearches: number;
  competition: string;
  cpcLow: number | null;
  cpcHigh: number | null;
};

export function microsToCurrency(micros: number | null | undefined): number | null {
  if (micros == null || !Number.isFinite(micros)) return null;
  return Math.round((micros / 1_000_000) * 100) / 100;
}

export function normalizeDataforSeoKeyword(raw: Record<string, unknown>): NormalizedKeywordIdea | null {
  const keyword = String(raw.keyword ?? "").trim();
  if (!keyword) return null;

  const searchVolume = Number(raw.search_volume ?? 0);
  const competition = raw.competition == null ? "UNSPECIFIED" : String(raw.competition);

  const lowBid = raw.low_top_of_page_bid;
  const highBid = raw.high_top_of_page_bid;
  const cpc = raw.cpc;

  let cpcLow: number | null = null;
  let cpcHigh: number | null = null;
  if (typeof lowBid === "number" && Number.isFinite(lowBid)) cpcLow = Math.round(lowBid * 100) / 100;
  if (typeof highBid === "number" && Number.isFinite(highBid)) cpcHigh = Math.round(highBid * 100) / 100;
  if (cpcLow == null && typeof cpc === "number" && Number.isFinite(cpc)) {
    cpcLow = Math.round(cpc * 100) / 100;
    cpcHigh = cpcLow;
  }
  if (cpcHigh == null && cpcLow != null) cpcHigh = cpcLow;

  return {
    keyword,
    avgMonthlySearches: Number.isFinite(searchVolume) ? searchVolume : 0,
    competition,
    cpcLow,
    cpcHigh,
  };
}

export function normalizeKeywordIdea(raw: {
  text?: string | null;
  keyword?: string | null;
  keyword_idea_metrics?: {
    avg_monthly_searches?: number | null;
    competition?: string | number | null;
    low_top_of_page_bid_micros?: number | null;
    high_top_of_page_bid_micros?: number | null;
  } | null;
  avgMonthlySearches?: number | null;
  competition?: string | null;
  lowTopOfPageBidMicros?: number | null;
  highTopOfPageBidMicros?: number | null;
}): NormalizedKeywordIdea | null {
  const keyword = String(raw.text ?? raw.keyword ?? "").trim();
  if (!keyword) return null;

  const metrics = raw.keyword_idea_metrics;
  const avgMonthlySearches = Number(
    metrics?.avg_monthly_searches ?? raw.avgMonthlySearches ?? 0,
  );
  const competitionRaw = metrics?.competition ?? raw.competition;
  const competition =
    competitionRaw == null
      ? "UNSPECIFIED"
      : typeof competitionRaw === "number"
        ? String(competitionRaw)
        : String(competitionRaw);

  return {
    keyword,
    avgMonthlySearches: Number.isFinite(avgMonthlySearches) ? avgMonthlySearches : 0,
    competition,
    cpcLow: microsToCurrency(
      metrics?.low_top_of_page_bid_micros ?? raw.lowTopOfPageBidMicros ?? null,
    ),
    cpcHigh: microsToCurrency(
      metrics?.high_top_of_page_bid_micros ?? raw.highTopOfPageBidMicros ?? null,
    ),
  };
}

export const COUNTRY_GEO: Record<string, string> = {
  BE: "geoTargetConstants/2056",
  NL: "geoTargetConstants/2528",
};

export const LANGUAGE_CONSTANT: Record<string, string> = {
  nl: "languageConstants/1010",
  en: "languageConstants/1000",
  fr: "languageConstants/1002",
};

export function parseSeedTerms(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((item) => String(item).trim()).filter(Boolean))].slice(0, 15);
}
