import OpenAI from "openai";
import { z } from "zod";
import { modelSupportsCustomTemperature, resolveMeetingAnalysisModel } from "@/lib/openai/models";
import type { TenantIcpProfileData } from "@/lib/strategy/icp-types";
import type { BuyerPersonaDraft } from "@/lib/brand/buyer-persona-types";

const personaSchema = z.object({
  displayName: z.string().max(80),
  roleTitle: z.string().max(200),
  summary: z.string().max(800),
  decisionRoles: z.array(z.string().max(60)).max(6),
  goals: z.string().max(800),
  pains: z.string().max(800),
  triggers: z.string().max(500),
  decisionCriteria: z.string().max(800),
  objections: z.string().max(800),
  infoNeeded: z.string().max(800),
  channels: z.string().max(400),
  assumptions: z.string().max(800),
  openQuestion: z.string().max(400),
});

const batchSchema = z.object({
  personas: z.array(personaSchema).min(1).max(5),
});

function icpBlock(icp: TenantIcpProfileData): string {
  return [
    icp.headline ? `ICP: ${icp.headline}` : "",
    icp.summary,
    icp.offer ? `Aanbod: ${icp.offer}` : "",
    icp.activity ? `Activiteit: ${icp.activity}` : "",
    icp.region ? `Regio: ${icp.region}` : "",
    icp.mainProblem ? `Probleem: ${icp.mainProblem}` : "",
    icp.desiredOutcome ? `Gewenste uitkomst: ${icp.desiredOutcome}` : "",
    icp.positioning ? `Positionering: ${icp.positioning}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generateBuyerPersonasFromIcp(input: {
  tenantName: string;
  icp: TenantIcpProfileData;
  extraContext?: string;
  existingRoleTitles?: string[];
}): Promise<BuyerPersonaDraft[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY ontbreekt.");

  const model = resolveMeetingAnalysisModel();
  const openai = new OpenAI({ apiKey });

  const completion = await openai.chat.completions.create({
    model,
    ...(modelSupportsCustomTemperature(model) ? { temperature: 0.45 } : {}),
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "Je maakt buyer persona's voor B2B-marketing in VICE.",
          "Elke persona is een fictieve maar realistische beslisser of beïnvloeder binnen het ICP — geen echte persoon, geen PII.",
          "Genereer 2–4 complementaire persona's (verschillende rollen, bv. zaakvoerder, marketing, finance).",
          "Baseer je op het ICP; extra context is optioneel.",
          "decisionRoles: korte tags zoals Beslisser, Beïnvloeder, Gebruiker.",
          "Antwoord JSON: { personas: [...] } met camelCase velden per persona.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `Klant: ${input.tenantName}`,
          "--- ICP ---",
          icpBlock(input.icp),
          input.existingRoleTitles?.length
            ? `Bestaande rollen (niet dupliceren):\n${input.existingRoleTitles.map((r) => `- ${r}`).join("\n")}`
            : "",
          input.extraContext?.trim() ? `Extra context:\n${input.extraContext.trim()}` : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Geen persona-voorstel ontvangen.");
  const parsed = batchSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) throw new Error("Persona-antwoord voldeed niet aan het formaat.");
  return parsed.data.personas;
}
