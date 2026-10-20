import type { KeywordResearchRow, KeywordResearchRun } from "@/lib/keywords/types";

export function formatKeywordSourceExcerpt(row: KeywordResearchRow, run: KeywordResearchRun | null) {
  const geo =
    run?.scope === "local" && run.city
      ? `${run.city}, ${run.countryCode}`
      : run?.countryCode ?? "BE/NL";
  return [
    `Keyword: ${row.keyword}`,
    `Gem. maandvolume: ${row.avgMonthlySearches}`,
    `Competitie: ${row.competition}`,
    row.cpcLow != null || row.cpcHigh != null
      ? `CPC (indicatie): €${row.cpcLow ?? "?"} – €${row.cpcHigh ?? "?"}`
      : "CPC: niet beschikbaar",
    `Geo: ${geo}`,
    "Gebruik deze zoekterm als hoofdonderwerp; verzin geen andere volumes.",
  ].join("\n");
}
