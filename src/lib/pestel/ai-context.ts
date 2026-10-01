import type { PestelWorkbench } from "@/lib/pestel/types";
import { PESTEL_DIMENSION_META } from "@/lib/pestel/constants";

/** Compacte, gestructureerde snapshot voor toekomstige AI-consultatie (RAG / prompts). */
export function buildPestelAiContextSnapshot(workbench: PestelWorkbench): string {
  const { version, insights } = workbench;
  const lines: string[] = [
    "# PESTEL context",
    `version: ${version.version_number}`,
    `status: ${version.status}`,
    `market_sector: ${version.market_sector}`,
    `geo_markets: ${version.geo_markets.join(", ")}`,
    `time_horizon: ${version.time_horizon}`,
    `offering_audience: ${version.offering_audience}`,
    `research_question: ${version.research_question}`,
    "",
    "## Insights",
  ];

  for (const ins of insights) {
    const dim = PESTEL_DIMENSION_META[ins.dimension]?.label ?? ins.dimension;
    lines.push(
      `### ${dim} · ${ins.title || "Zonder titel"}`,
      `observation: ${ins.observation}`,
      `client_relevance: ${ins.client_relevance}`,
      `opportunity_risk: ${ins.opportunity_risk}`,
      `impact: ${ins.impact}`,
      `evidence: ${ins.evidence_level}`,
      `sources: ${ins.sources.map((s) => s.label || s.url || s.source_type).join("; ") || "—"}`,
      "",
    );
  }

  if (version.synthesis_text.trim()) {
    lines.push("## Synthesis", version.synthesis_text.trim());
  }

  return lines.join("\n");
}
