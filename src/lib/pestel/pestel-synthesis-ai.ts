import OpenAI from "openai";
import {
  PESTEL_DIMENSION_META,
  type PestelDimension,
} from "@/lib/pestel/constants";
import { resolveMeetingAnalysisModel } from "@/lib/openai/models";

export type PestelSynthesisScope = {
  market_sector: string;
  geo_markets: string[];
  time_horizon: string;
  services_offerings: string;
  offering_audience: string;
  research_question: string;
};

export type PestelSynthesisInsight = {
  dimension: PestelDimension;
  title: string;
  observation: string;
  client_relevance: string;
  opportunity_risk: string;
  impact: string;
};

function resolvePestelSynthesisModel(): string {
  return (
    process.env.VICE_PESTEL_SYNTHESIS_MODEL?.trim() ||
    resolveMeetingAnalysisModel()
  );
}

export async function generatePestelVersionSynthesis(input: {
  tenantName: string;
  scope: PestelSynthesisScope;
  insights: PestelSynthesisInsight[];
}): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY ontbreekt");
  }

  if (input.insights.length === 0) {
    throw new Error("Geen PESTEL-inzichten om te synthetiseren");
  }

  const openai = new OpenAI({ apiKey });
  const model = resolvePestelSynthesisModel();

  const insightBlock = input.insights
    .map((ins) => {
      const dim = PESTEL_DIMENSION_META[ins.dimension].label;
      return [
        `### ${dim} — ${ins.title}`,
        `Waarneming: ${ins.observation}`,
        ins.client_relevance ? `Betekenis klant: ${ins.client_relevance}` : "",
        `Kans/risico: ${ins.opportunity_risk} · Impact: ${ins.impact}`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const scopeBlock = [
    `Vakgebied/branche: ${input.scope.market_sector}`,
    `Regio: ${input.scope.geo_markets.join(", ")}`,
    `Horizon: ${input.scope.time_horizon}`,
    `Diensten: ${input.scope.services_offerings}`,
    `Doelgroep: ${input.scope.offering_audience}`,
    input.scope.research_question ?
      `Onderzoeksvraag: ${input.scope.research_question}`
    : "",
  ]
    .filter(Boolean)
    .join("\n");

  const completion = await openai.chat.completions.create({
    model,
    temperature: 0.3,
    max_tokens: 2000,
    messages: [
      {
        role: "system",
        content: `Je schrijft een strategische PESTEL-synthese voor VICE (adviseur) en ${input.tenantName}.
Schrijf in het Nederlands, concreet en zonder marketingtaal.
Structuur (markdown-light, geen titels met #):
1) Belangrijkste externe kansen voor ${input.tenantName}
2) Belangrijkste risico's en druk op de markt
3) Wat dit betekent voor positionering, diensten en prioriteiten (komende periode)
4) Open vragen / onzekerheden
Geen percentages of fictieve cijfers. Baseer je alleen op de meegegeven inzichten en afbakening.`,
      },
      {
        role: "user",
        content: `Afbakening:\n${scopeBlock}\n\nPESTEL-inzichten:\n${insightBlock}`,
      },
    ],
  });

  const text = completion.choices[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("Lege AI-synthese");
  }
  return text.slice(0, 12_000);
}

export async function generatePestelInsightClientRelevance(input: {
  tenantName: string;
  scope: PestelSynthesisScope;
  dimension: PestelDimension;
  title: string;
  observation: string;
  sourceExcerpts?: string[];
}): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY ontbreekt");
  }

  const openai = new OpenAI({ apiKey });
  const model = resolvePestelSynthesisModel();
  const dimLabel = PESTEL_DIMENSION_META[input.dimension].label;

  const sources =
    input.sourceExcerpts?.filter(Boolean).slice(0, 4).join("\n---\n") || "—";

  const completion = await openai.chat.completions.create({
    model,
    temperature: 0.25,
    max_tokens: 900,
    messages: [
      {
        role: "system",
        content: `Je vertaalt een externe PESTEL-waarneming naar betekenis voor ${input.tenantName}.
Schrijf 2–4 zinnen in het Nederlands: waarom dit relevant is voor hun diensten, doelgroep en regio.
Geen herhaling van de volledige waarneming; focus op "dus wat voor ${input.tenantName}".`,
      },
      {
        role: "user",
        content: `Perspectief: ${dimLabel}
Titel: ${input.title}
Waarneming: ${input.observation}

Afbakening — vakgebied: ${input.scope.market_sector}; diensten: ${input.scope.services_offerings}; doelgroep: ${input.scope.offering_audience}; regio: ${input.scope.geo_markets.join(", ")}

Bronfragmenten (indien van toepassing):
${sources}`,
      },
    ],
  });

  const text = completion.choices[0]?.message?.content?.trim();
  if (!text || text.length < 10) {
    throw new Error("AI kon geen betekenis voor klant formuleren");
  }
  return text.slice(0, 4000);
}
