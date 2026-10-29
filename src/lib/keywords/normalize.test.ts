import { describe, expect, it } from "vitest";
import {
  COUNTRY_GEO,
  LANGUAGE_CONSTANT,
  microsToCurrency,
  normalizeDataforSeoKeyword,
  normalizeKeywordIdea,
  parseSeedTerms,
} from "@/lib/keywords/normalize";

describe("normalizeDataforSeoKeyword", () => {
  it("maps DataForSEO keyword rows", () => {
    const row = normalizeDataforSeoKeyword({
      keyword: "seo bureau",
      search_volume: 880,
      competition: "HIGH",
      low_top_of_page_bid: 1.2,
      high_top_of_page_bid: 4.5,
    });
    expect(row?.keyword).toBe("seo bureau");
    expect(row?.avgMonthlySearches).toBe(880);
    expect(row?.cpcLow).toBe(1.2);
    expect(row?.cpcHigh).toBe(4.5);
  });
});

describe("normalizeKeywordIdea", () => {
  it("maps API metrics to UI fields", () => {
    const row = normalizeKeywordIdea({
      text: "marketing automation",
      keyword_idea_metrics: {
        avg_monthly_searches: 1200,
        competition: "MEDIUM",
        low_top_of_page_bid_micros: 1_500_000,
        high_top_of_page_bid_micros: 3_200_000,
      },
    });
    expect(row?.keyword).toBe("marketing automation");
    expect(row?.avgMonthlySearches).toBe(1200);
    expect(row?.cpcLow).toBe(1.5);
    expect(row?.cpcHigh).toBe(3.2);
  });
});

describe("geo helpers", () => {
  it("knows BE and NL", () => {
    expect(COUNTRY_GEO.BE).toContain("2056");
    expect(COUNTRY_GEO.NL).toContain("2528");
    expect(LANGUAGE_CONSTANT.nl).toContain("1010");
  });
});

describe("parseSeedTerms", () => {
  it("dedupes and caps seeds", () => {
    expect(parseSeedTerms([" a ", "a", "b", ...Array.from({ length: 20 }, (_, i) => `k${i}`)])).toHaveLength(15);
  });
});

describe("microsToCurrency", () => {
  it("returns null for invalid", () => {
    expect(microsToCurrency(undefined)).toBeNull();
  });
});
