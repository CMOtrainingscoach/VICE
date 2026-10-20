import OpenAI from "openai";
import { modelSupportsCustomTemperature, resolveBlogTextModel } from "@/lib/openai/models";
import { parseSeedTerms } from "@/lib/keywords/normalize";

export async function generateKeywordSeedTerms(input: {
  tenantName: string;
  website: string;
  auditGoal: string;
  auditContext: string;
  brandName: string;
  brandVoice: string;
  gscQueries: string[];
  language: string;
}): Promise<{ seeds: string[]; model: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY ontbreekt.");

  const model = resolveBlogTextModel();
  const openai = new OpenAI({ apiKey });
  const isDutch = input.language !== "en";

  const completion = await openai.chat.completions.create({
    model,
    ...(modelSupportsCustomTemperature(model) ? { temperature: 0.5 } : {}),
    messages: [
      {
        role: "system",
        content: [
          "Je helpt bij keywordonderzoek voor VICE.",
          isDutch
            ? "Geef 8–15 seed-zoektermen in het Nederlands (BE/NL), één per regel, geen nummering."
            : "Return 8–15 seed search phrases, one per line, no numbering.",
          "Termen moeten passen bij de klant, diensten en doelgroep.",
          "Geen zoekvolumes verzinnen — alleen termen die Google Keyword Planner kan uitbreiden.",
          "Mix head terms en long-tail; vermijd merknamen van concurrenten.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `Klant: ${input.tenantName}`,
          input.brandName ? `Merk: ${input.brandName}` : "",
          input.website ? `Website: ${input.website}` : "",
          input.auditGoal ? `Doel audit: ${input.auditGoal}` : "",
          input.brandVoice ? `Tone of voice:\n${input.brandVoice.slice(0, 2000)}` : "",
          input.auditContext ? `Auditcontext:\n${input.auditContext.slice(0, 6000)}` : "",
          input.gscQueries.length
            ? `Bestaande Search Console-queries (inspiratie):\n${input.gscQueries.slice(0, 15).join("\n")}`
            : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  });

  const text = completion.choices[0]?.message?.content ?? "";
  const seeds = parseSeedTerms(text.split(/\r?\n/));
  if (seeds.length === 0) throw new Error("Geen seed-termen van het model ontvangen.");
  return { seeds, model };
}
