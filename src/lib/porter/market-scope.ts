export function validatePorterScopeForResearch(input: {
  tenantName: string;
  marketSector: string;
  offeringDescription: string;
  clientSegment: string;
  geoMarkets: string[];
}): { ok: true } | { ok: false; message: string } {
  const company = input.tenantName.trim().toLowerCase();
  const sector = input.marketSector.trim();
  const offering = input.offeringDescription.trim();
  const segment = input.clientSegment.trim();
  const geo = input.geoMarkets.map((g) => g.trim()).filter(Boolean);

  if (geo.length === 0) {
    return {
      ok: false,
      message: "Vul minstens één geografische markt in (bv. Kempen, België).",
    };
  }

  const sectorOk = sector.length >= 3 && sector.toLowerCase() !== company;
  if (!sectorOk) {
    return {
      ok: false,
      message:
        "Vul sector / markt in (niet de bedrijfsnaam) — bv. «marketing voor KMO's in de Kempen».",
    };
  }

  if (offering.length < 15 && segment.length < 15) {
    return {
      ok: false,
      message:
        "Beschrijf het aanbod of klantsegment (min. ~15 tekens) zodat de AI concurrentiedruk kan inschatten.",
    };
  }

  return { ok: true };
}

export function buildPorterIndustrySearchContext(input: {
  tenantName: string;
  marketSector: string;
  offeringDescription: string;
  clientSegment: string;
}): string {
  const company = input.tenantName.trim().toLowerCase();
  const sector = input.marketSector.trim();
  const safeSector =
    sector.length >= 2 && sector.toLowerCase() !== company ? sector : "";
  const parts = [safeSector, input.offeringDescription.trim(), input.clientSegment.trim()].filter(
    Boolean,
  );
  return parts.join(" · ").slice(0, 400);
}
