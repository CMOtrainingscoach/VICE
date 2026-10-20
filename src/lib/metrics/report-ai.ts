import OpenAI from "openai";
import { modelSupportsCustomTemperature, resolveBlogTextModel } from "@/lib/openai/models";

export async function generatePerformanceReport(input: {
  tenantName: string;
  brandVoice: string;
  factsMarkdown: string;
  language: string;
}): Promise<{ markdown: string; model: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY ontbreekt.");

  const model = resolveBlogTextModel();
  const openai = new OpenAI({ apiKey });
  const isDutch = input.language !== "en";

  const completion = await openai.chat.completions.create({
    model,
    ...(modelSupportsCustomTemperature(model) ? { temperature: 0.4 } : {}),
    messages: [
      {
        role: "system",
        content: [
          "Je schrijft een maandrapport over website-prestaties voor VICE.",
          isDutch
            ? "Schrijf in Belgisch Nederlands als markdown."
            : "Write natural English markdown.",
          "Gebruik alleen cijfers uit het feitenblok. Verzin geen statistieken.",
          "Structuur: ## Samenvatting, ## Wat ging goed, ## Wat daalde, ## Aanbevelingen (3-5 bullets).",
          input.brandVoice ? `Tone of voice:\n${input.brandVoice}` : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
      {
        role: "user",
        content: `Klant: ${input.tenantName}\n\nFeitenblok:\n${input.factsMarkdown}`,
      },
    ],
  });

  const markdown = completion.choices[0]?.message?.content?.trim();
  if (!markdown) throw new Error("Geen rapport van het model ontvangen.");
  return { markdown, model };
}
