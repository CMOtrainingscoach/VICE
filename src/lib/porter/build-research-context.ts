import type { PorterPestelInsightSummary } from "@/lib/porter/types";

export type PorterResearchContext = {
  tenant: {
    name: string;
    website: string | null;
    audit_goal: string;
  };
  scope: {
    market_sector: string;
    offering_description: string;
    geo_markets: string[];
    client_segment: string;
    time_horizon: string;
    research_question: string;
    known_competitors: { name: string; url?: string }[];
  };
  pestelInsights: PorterPestelInsightSummary[];
};

export function serializePorterContextForPrompt(ctx: PorterResearchContext): string {
  const lines = [
    "# Klant",
    `Naam: ${ctx.tenant.name}`,
    ctx.tenant.website ? `Website: ${ctx.tenant.website}` : "",
    ctx.tenant.audit_goal ? `Auditdoel: ${ctx.tenant.audit_goal}` : "",
    "",
    "# Marktafbakening (Porter)",
    `Sector/markt: ${ctx.scope.market_sector}`,
    `Aanbod: ${ctx.scope.offering_description}`,
    `Geografie: ${ctx.scope.geo_markets.join(", ")}`,
    `Klantsegment: ${ctx.scope.client_segment}`,
    `Tijdshorizon: ${ctx.scope.time_horizon}`,
    ctx.scope.research_question ? `Onderzoeksvraag: ${ctx.scope.research_question}` : "",
  ].filter(Boolean);

  if (ctx.scope.known_competitors.length > 0) {
    lines.push("", "# Bekende concurrenten");
    for (const c of ctx.scope.known_competitors) {
      lines.push(c.url ? `- ${c.name} (${c.url})` : `- ${c.name}`);
    }
  }

  if (ctx.pestelInsights.length > 0) {
    lines.push("", "# Goedgekeurde PESTEL-inzichten (externe omgeving)");
    for (const ins of ctx.pestelInsights) {
      lines.push(
        `## [${ins.id}] ${ins.title} (${ins.dimension})`,
        ins.observation,
        ins.client_relevance ? `Relevantie klant: ${ins.client_relevance}` : "",
        "",
      );
    }
  }

  return lines.join("\n");
}
