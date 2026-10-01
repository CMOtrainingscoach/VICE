import OpenAI from "openai";
import { z } from "zod";
import { resolveMeetingAnalysisModel } from "@/lib/openai/models";

export const actionItemSchema = z.object({
  text: z.string(),
});

export const meetingAnalysisSchema = z.object({
  summary: z.string(),
  actionItems: z.array(actionItemSchema).min(1).max(8),
});

export type MeetingAnalysisResult = z.infer<typeof meetingAnalysisSchema>;

export async function generateMeetingAnalysis(input: {
  title: string;
  subject: string;
  notes: string;
  transcript: string;
}): Promise<MeetingAnalysisResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY ontbreekt in .env.local");
  }

  const model = resolveMeetingAnalysisModel();
  const openai = new OpenAI({ apiKey });

  const transcript = input.transcript.slice(0, 48_000);

  const completion = await openai.chat.completions.create({
    model,
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Je bent een strategisch assistent voor Hardwig Aerts (VICE). Antwoord in het Nederlands. Geef compacte, bruikbare output voor intern gebruik (demo/synthetisch). JSON met keys: summary (string, max 1200 tekens), actionItems (array van {text}, 3-8 items, concrete vervolgstappen).",
      },
      {
        role: "user",
        content: [
          `Titel: ${input.title || "Meeting"}`,
          `Onderwerp: ${input.subject || "—"}`,
          input.notes ? `Notities: ${input.notes}` : "",
          "",
          "Transcript:",
          transcript,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("Geen analyse van het model ontvangen");
  }

  const json = JSON.parse(raw) as Record<string, unknown>;
  const normalized = {
    summary: json.summary ?? json.samenvatting,
    actionItems: json.actionItems ?? json.action_items ?? json.actiepunten,
  };
  const parsed = meetingAnalysisSchema.safeParse(normalized);
  if (!parsed.success) {
    throw new Error("Analyse-JSON ongeldig");
  }

  return parsed.data;
}
