import OpenAI from "openai";
import { z } from "zod";
import { modelSupportsCustomTemperature, resolveMeetingAnalysisModel } from "@/lib/openai/models";
import type { TenantIcpProfileData } from "@/lib/strategy/icp-types";
import { emptyTenantIcpProfile } from "@/lib/strategy/icp-types";

const icpSchema = z.object({
  headline: z.string().max(200),
  summary: z.string().max(1200),
  offer: z.string().max(400),
  activity: z.string().max(300),
  region: z.string().max(300),
  phase: z.string().max(300),
  teamSize: z.string().max(300),
  teamSizeNeedsValidation: z.boolean(),
  extraCharacteristics: z.string().max(800),
  criteriaMust: z.array(z.string().max(400)).max(8),
  criteriaPlus: z.array(z.string().max(400)).max(8),
  criteriaExclude: z.array(z.string().max(400)).max(8),
  mainProblem: z.string().max(800),
  mainProblemSource: z.string().max(80),
  desiredOutcome: z.string().max(800),
  trigger: z.string().max(500),
  triggerLabel: z.string().max(80),
  budget: z.string().max(300),
  capacity: z.string().max(300),
  openQuestions: z.array(z.string().max(400)).max(12),
  positioning: z.string().max(1200),
  sourcesAndAssumptions: z.string().max(2000),
});

function trimMarkdownForIcp(markdown: string, maxChars = 90_000): { text: string; truncated: boolean } {
  const trimmed = markdown.trim();
  if (trimmed.length <= maxChars) return { text: trimmed, truncated: false };
  return {
    text: `${trimmed.slice(0, maxChars)}\n\n[… document ingekort voor analyse …]`,
    truncated: true,
  };
}

export async function extractTenantIcpFromMarkdown(input: {
  tenantName: string;
  markdown: string;
  otherIcpHeadlines?: string[];
}): Promise<TenantIcpProfileData> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY ontbreekt. Vraag een beheerder om de configuratie.");

  const { text, truncated } = trimMarkdownForIcp(input.markdown);
  const model = resolveMeetingAnalysisModel();
  const openai = new OpenAI({ apiKey });

  const completion = await openai.chat.completions.create({
    model,
    ...(modelSupportsCustomTemperature(model) ? { temperature: 0.35 } : {}),
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "Je bent strategisch analist voor VICE. Lees het markdown-auditdocument en formuleer één primair ICP (Ideal Customer Profile) voor de klant.",
          "Regels:",
          "- Baseer je uitsluitend op het document. Geen externe kennis of aannames over de markt.",
          "- Onbekend of niet onderbouwd: korte neutrale tekst of leeg; zet teamSizeNeedsValidation true als teamgrootte onduidelijk is.",
          "- criteriaMust / criteriaPlus / criteriaExclude: korte zinnen in het Nederlands (max 3–5 per lijst).",
          "- openQuestions: punten die een admin nog moet valideren (0–6).",
          "- mainProblemSource en triggerLabel: korte bron-tag, bv. Audit, Hypothese, Meeting — alleen als het document dat suggereert.",
          "- positioning: hoe deze klant zich positioneert t.o.v. het ICP (aanbod + belofte), niet generieke marketingtaal.",
          "- Geen PII van personen; wel bedrijfscontext uit de audit.",
          "- Als er al andere ICP's bestaan voor deze klant: formuleer een afgebakend, aanvullend segment — geen herhaling van bestaande profielen.",
          "Antwoord als JSON met exact deze keys (camelCase): headline, summary, offer, activity, region, phase, teamSize, teamSizeNeedsValidation, extraCharacteristics, criteriaMust, criteriaPlus, criteriaExclude, mainProblem, mainProblemSource, desiredOutcome, trigger, triggerLabel, budget, capacity, openQuestions, positioning, sourcesAndAssumptions.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `Klant: ${input.tenantName}`,
          input.otherIcpHeadlines?.length
            ? `Bestaande ICP-titels (niet dupliceren):\n${input.otherIcpHeadlines.map((h) => `- ${h}`).join("\n")}`
            : "",
          truncated ? "Let op: het document is ingekort; werk vooral met wat zichtbaar is." : "",
          "---",
          text,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Geen ICP-voorstel ontvangen van het model.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("ICP-antwoord was geen geldige JSON.");
  }

  const result = icpSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("ICP-antwoord voldeed niet aan het verwachte formaat.");
  }

  return { ...emptyTenantIcpProfile(), ...result.data };
}

export function icpProfileToMarkdown(tenantName: string, profile: TenantIcpProfileData, version: string): string {
  const lines: string[] = [
    `# ICP — ${tenantName}`,
    "",
    `Versie: ${version}`,
    "",
    `## ${profile.headline || "Ideale klant"}`,
    "",
    profile.summary,
    "",
    profile.offer ? `**Aanbod:** ${profile.offer}` : "",
    "",
    "## Bedrijfsprofiel",
    `- Activiteit: ${profile.activity || "—"}`,
    `- Werkgebied: ${profile.region || "—"}`,
    `- Bedrijfsfase: ${profile.phase || "—"}`,
    `- Teamgrootte: ${profile.teamSize || "—"}`,
    profile.extraCharacteristics ? `- Overige kenmerken: ${profile.extraCharacteristics}` : "",
    "",
    "## Past deze klant bij ons?",
  ];
  for (const item of profile.criteriaMust) lines.push(`- Moet: ${item}`);
  for (const item of profile.criteriaPlus) lines.push(`- Plus: ${item}`);
  for (const item of profile.criteriaExclude) lines.push(`- Past niet: ${item}`);
  lines.push("", "## Behoefte & kooptrigger");
  lines.push(`- Probleem: ${profile.mainProblem || "—"}`);
  lines.push(`- Gewenste uitkomst: ${profile.desiredOutcome || "—"}`);
  lines.push(`- Aanleiding: ${profile.trigger || "—"}`);
  lines.push("", "## Voorwaarden");
  lines.push(`- Budget: ${profile.budget || "—"}`);
  lines.push(`- Capaciteit: ${profile.capacity || "—"}`);
  if (profile.openQuestions.length) {
    lines.push("", "## Open vragen");
    for (const q of profile.openQuestions) lines.push(`- ${q}`);
  }
  lines.push("", "## Positionering", profile.positioning || "—");
  if (profile.sourcesAndAssumptions.trim()) {
    lines.push("", "## Bronnen & aannames", profile.sourcesAndAssumptions);
  }
  return lines.filter((line) => line !== undefined).join("\n");
}
