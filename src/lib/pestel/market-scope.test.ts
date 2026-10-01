import { describe, expect, it } from "vitest";
import { validateMarketScopeForResearch } from "@/lib/pestel/market-scope";

describe("validateMarketScopeForResearch", () => {
  it("rejects company name as sector", () => {
    const r = validateMarketScopeForResearch({
      tenantName: "Hardwig Aerts",
      marketSector: "Hardwig Aerts",
      servicesOfferings: "Coaching en training",
      offeringAudience: "",
      geoMarkets: ["België"],
    });
    expect(r.ok).toBe(false);
  });

  it("accepts sector and services", () => {
    const r = validateMarketScopeForResearch({
      tenantName: "Hardwig Aerts",
      marketSector: "Marketing coaching KMO",
      servicesOfferings: "Strategie workshops en 1-op-1 begeleiding",
      offeringAudience: "KMO Kempen",
      geoMarkets: ["België", "Kempen"],
    });
    expect(r.ok).toBe(true);
  });
});
