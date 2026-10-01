import type { PestelResearchContext } from "@/lib/pestel/build-research-context";

/** Terms for web search — never the client company name alone. */
export function buildIndustrySearchContext(ctx: PestelResearchContext): string {
  const company = ctx.tenant.name.trim().toLowerCase();
  const sector = ctx.scope.market_sector.trim();
  const services = ctx.scope.services_offerings.trim();
  const audience = ctx.scope.offering_audience.trim();

  const safeSector =
    sector.length >= 2 && sector.toLowerCase() !== company ? sector : "";
  const parts = [safeSector, services, audience].filter(Boolean);
  if (parts.length > 0) {
    return parts.join(" · ").slice(0, 400);
  }
  const goal = ctx.tenant.audit_goal.trim();
  if (goal.length >= 10) {
    return goal.slice(0, 400);
  }
  return "";
}

export function validateMarketScopeForResearch(input: {
  tenantName: string;
  marketSector: string;
  servicesOfferings: string;
  offeringAudience: string;
  geoMarkets: string[];
}): { ok: true } | { ok: false; message: string } {
  const company = input.tenantName.trim().toLowerCase();
  const sector = input.marketSector.trim();
  const services = input.servicesOfferings.trim();
  const audience = input.offeringAudience.trim();
  const geo = input.geoMarkets.map((g) => g.trim()).filter(Boolean);

  if (geo.length === 0) {
    return {
      ok: false,
      message: "Vul minstens één geografische markt in (bv. België, Kempen).",
    };
  }

  const sectorOk =
    sector.length >= 3 && sector.toLowerCase() !== company;
  if (!sectorOk) {
    return {
      ok: false,
      message:
        "Vul vakgebied / branche in (niet de bedrijfsnaam) — bv. «marketing & sales coaching voor KMO’s».",
    };
  }

  if (services.length < 15 && audience.length < 15) {
    return {
      ok: false,
      message:
        "Beschrijf de diensten & producten (min. ~15 tekens) of de doelgroep, zodat de AI markttrends kan zoeken.",
    };
  }

  return { ok: true };
}
