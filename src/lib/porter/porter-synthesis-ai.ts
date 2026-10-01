import OpenAI from "openai";
import { PORTER_FORCE_META, PORTER_INTENSITY_LABELS, type PorterForceKey } from "@/lib/porter/constants";
import { resolveMeetingAnalysisModel } from "@/lib/openai/models";

export type PorterSynthesisForce = {
  force_key: PorterForceKey;
  intensity: string;
  headline_factor: string;
  motivation: string;
  client_relevance: string;
};

export type PorterSynthesisScope = {
  market_sector: string;
  offering_description: string;
  geo_markets: string[];
  client_segment: string;
  time_horizon: string;
  research_question: string;
};

function resolvePorterSynthesisModel(): string {
  return (
    process.env.VICE_PORTER_SYNTHESIS_MODEL?.trim()
    || process.env.VICE_PESTEL_SYNTHESIS_MODEL?.trim()
    || resolveMeetingAnalysisModel()
  );
}

export async function generatePorterVersionSynthesis(input: {
  tenantName: string;
  scope: PorterSynthesisScope;
  forces: PorterSynthesisForce[];
}): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY ontbreekt");
  }

  if (input.forces.length === 0) {
    throw new Error("Geen Porter-krachten om te synthetiseren");
  }

  const openai = new OpenAI({ apiKey });
  const model = resolvePorterSynthesisModel();

  const forcesBlock = input.forces
    .map((f) => {
      const meta = PORTER_FORCE_META[f.force_key];
      const intensity = PORTER_INTENSITY_LABELS[f.intensity as keyof typeof PORTER_INTENSITY_LABELS] ?? f.intensity;
      return [
        `### ${meta.shortLabel} (${intensity})`,
        f.headline_factor ? `Kern: ${f.headline_factor}` : "",
        f.motivation ? `Motivatie: ${f.motivation}` : "",
        f.client_relevance ? `Betekenis voor ${input.tenantName}: ${f.client_relevance}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const scopeBlock = [
    `Sector/markt: ${input.scope.market_sector}`,
    `Aanbod: ${input.scope.offering_description}`,
    `Regio: ${input.scope.geo_markets.join(", ")}`,
    `Klantsegment: ${input.scope.client_segment}`,
    `Horizon: ${input.scope.time_horizon}`,
    input.scope.research_question ? `Onderzoeksvraag: ${input.scope.research_question}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const completion = await openai.chat.completions.create({
    model,
    temperature: 0.3,
    max_tokens: 2200,
    messages: [
      {
        role: "system",
        content: `Je schrijft een strategische Porter-synthese voor VICE (adviseur) en ${input.tenantName}.
Schrijf in het Nederlands, concreet, zonder marketingjargon.
Structuur (plain text, korte alinea's):
1) Overall concurrentiebeeld en sterkste druk op de markt
2) Wat dit betekent voor de positie van ${input.tenantName}
3) Implicaties voor keuzes in aanbod, prijs, differentiatie en partnerships
4) Prioriteiten en open vragen
Baseer je alleen op de meegegeven krachten en afbakening.`,
      },
      {
        role: "user",
        content: `Afbakening:\n${scopeBlock}\n\nVijf krachten:\n${forcesBlock}`,
      },
    ],
  });

  const text = completion.choices[0]?.message?.content?.trim();
  if (!text || text.length < 20) {
    throw new Error("AI-synthese te kort of leeg");
  }
  return text;
}
