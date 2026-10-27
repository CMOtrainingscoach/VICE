/**
 * Representative cases for comparing legacy Leadgen vs Salesbrain workflows.
 * Used in tests and admin diagnostics — not live production data.
 */

export type BaselineEvalCase = {
  id: string;
  label: string;
  category: "good_match" | "poor_match" | "duplicate" | "outdated_ad" | "unknown_geo";
  legacyRisk: string;
  salesbrainExpectation: string;
};

export const BASELINE_EVAL_CASES: BaselineEvalCase[] = [
  {
    id: "good-1",
    label: "KMO met vacature eerste marketeer in regio",
    category: "good_match",
    legacyRisk: "Brede zoekquery + snippet-only AI",
    salesbrainExpectation: "Job-ad evidence + ICP filter + verified fetch",
  },
  {
    id: "poor-1",
    label: "Directory site op .be zonder locatie",
    category: "poor_match",
    legacyRisk: "Soft geo (.be) zonder coördinaten",
    salesbrainExpectation: "Geo strict of expliciet onbekend bucket",
  },
  {
    id: "dup-1",
    label: "Zelfde host, verschillende merknamen",
    category: "duplicate",
    legacyRisk: "Host-dedupe op shared domain",
    salesbrainExpectation: "Normalize met bron-IDs, conservatief merge",
  },
  {
    id: "ad-1",
    label: "Verlopen vacature nog in zoekresultaat",
    category: "outdated_ad",
    legacyRisk: "Geen ad-status check",
    salesbrainExpectation: "Job node: active/expired/unknown + checked_at",
  },
  {
    id: "geo-1",
    label: "Naamgenoot buiten straal",
    category: "unknown_geo",
    legacyRisk: "Geocoding first hit buiten radius",
    salesbrainExpectation: "Haversine reject + waarschuwing",
  },
];

export function baselineEvalSummary(): { caseCount: number; categories: Record<string, number> } {
  const categories: Record<string, number> = {};
  for (const c of BASELINE_EVAL_CASES) {
    categories[c.category] = (categories[c.category] ?? 0) + 1;
  }
  return { caseCount: BASELINE_EVAL_CASES.length, categories };
}
