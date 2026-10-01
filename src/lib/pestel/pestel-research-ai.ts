import OpenAI from "openai";
import { z } from "zod";
import type { PestelDimension } from "@/lib/pestel/constants";
import { PESTEL_DIMENSION_META } from "@/lib/pestel/constants";
import {
  pestelResearchMaxOutputTokens,
  resolvePestelResearchModel,
} from "@/lib/openai/models";
import { serializeResearchContextForPrompt, type PestelResearchContext } from "@/lib/pestel/build-research-context";
import {
  normalizeWebUrl,
  serializeWebEvidenceForPrompt,
  type PestelWebHit,
} from "@/lib/pestel/pestel-web-evidence";
import { formatZodIssue, zodString } from "@/lib/pestel/zod-form";

const sourceSchema = z.object({
  source_type: z.enum(["website", "meeting", "manual", "document"]),
  label: zodString(500, 1),
  url: z.preprocess(
    (v) => (v == null || v === "" ? undefined : String(v)),
    z.string().optional(),
  ),
  publisher: z.preprocess(
    (v) => (v == null || v === "" ? undefined : String(v)),
    z.string().optional(),
  ),
  meeting_recording_id: z.preprocess(
    (v) => (v == null || v === "" ? undefined : String(v)),
    z.string().uuid().optional(),
  ),
  meeting_offset_ms: z.number().int().min(0).optional(),
  excerpt: zodString(4000, 20),
  is_ai_interpretation: z.boolean().optional(),
});

const insightSchema = z.object({
  title: zodString(300, 1),
  observation: zodString(8000, 20),
  client_relevance: zodString(4000, 10),
  opportunity_risk: z.enum(["opportunity", "risk", "both", "unclear"]),
  impact: z.enum(["low", "medium", "high", "unknown"]),
  impact_note: zodString(1000),
  insight_time_horizon: zodString(200),
  evidence_level: z.enum(["provided", "observed", "hypothesis"]),
  sources: z.array(sourceSchema).min(1, "Minstens één bron verplicht"),
});

const dimensionResponseSchema = z.object({
  insights: z.array(insightSchema).min(1).max(5),
});

export type PestelAiInsight = z.infer<typeof insightSchema>;

function findWebHit(url: string, hits: PestelWebHit[]): PestelWebHit | undefined {
  const key = normalizeWebUrl(url);
  return hits.find((h) => normalizeWebUrl(h.url) === key);
}

export async function generatePestelDimensionInsights(input: {
  dimension: PestelDimension;
  context: PestelResearchContext;
  allowedMeetingIds: Set<string>;
  webEvidence: PestelWebHit[];
  allowedWebUrls: Set<string>;
}): Promise<PestelAiInsight[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY ontbreekt");
  }

  const model = resolvePestelResearchModel();
  const openai = new OpenAI({ apiKey });
  const dimLabel = PESTEL_DIMENSION_META[input.dimension].label;
  const contextBlock = [
    serializeResearchContextForPrompt(input.context),
    serializeWebEvidenceForPrompt(input.webEvidence),
  ].join("\n\n");

  const completion = await openai.chat.completions.create({
    model,
    temperature: 0.2,
    max_tokens: pestelResearchMaxOutputTokens(),
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Je bent een strategisch onderzoeksassistent voor VICE (Hardwig Aerts). 
PESTEL = EXTERNE omgeving van het VAKGEBIED en de MARKT (politiek, economie, maatschappij, tech, ecologie, regelgeving) — niet de bedrijfsnaam als sector behandelen.
Zoek ontwikkelingen die gelden voor de branche, diensten en regio in de afbakening; koppel daarna relevantie voor deze klant.

Regels (strikt):
- Antwoord in het Nederlands.
- JSON: { "insights": [ ... ] }
- Per inzicht minstens 1 bron in "sources".
- Meeting-bron: meeting_recording_id MOET exact overeenkomen met een ID uit «Interne / gekoppelde bronnen»; excerpt = letterlijk citaat (max 400 tekens).
- Document/notitie (intern): source_type document; label + excerpt alleen uit gekoppelde fragmenten in de context.
- Website-bron (extern): url MOET exact voorkomen in «Live webonderzoek»; excerpt = letterlijk citaat uit het fragment daar (max 400 tekens).
- Per inzicht minstens één website-fact (is_ai_interpretation:false) voor externe omgevingsfeiten, naast eventuele meeting/document.
- Voeg per inzicht minstens één bron met is_ai_interpretation:true toe die uitlegt HOE je van feit naar conclusie gaat (raadpleegbaar voor Hardwig).
- evidence_level "hypothesis" als onzeker; nooit "provided" zonder meeting/document in sources.
- Geen percentages of resterende tijd.`,
      },
      {
        role: "user",
        content: `Perspectief: ${dimLabel} (${input.dimension})

${contextBlock}

Geef 2-4 concrete externe ontwikkelingen relevant voor deze klant en afbakening.`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("Lege AI-response");
  }

  const parsed = dimensionResponseSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(`AI-JSON ongeldig (${formatZodIssue(parsed.error)})`);
  }

  for (const ins of parsed.data.insights) {
    for (const src of ins.sources) {
      if (src.source_type === "meeting") {
        if (!src.meeting_recording_id || !input.allowedMeetingIds.has(src.meeting_recording_id)) {
          throw new Error(`Meeting-bron ongeldig voor inzicht "${ins.title}"`);
        }
      }
      if (src.source_type === "website" && src.url) {
        if (!src.url.startsWith("https://")) {
          throw new Error(`Website-bron moet HTTPS zijn voor "${ins.title}"`);
        }
        const normalized = normalizeWebUrl(src.url);
        if (!input.allowedWebUrls.has(normalized)) {
          throw new Error(
            `Website ${src.url} staat niet in live webonderzoek voor "${ins.title}"`,
          );
        }
        const hit = findWebHit(src.url, input.webEvidence);
        if (hit && src.excerpt) {
          const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
          const needle = norm(src.excerpt).slice(0, 48);
          if (needle.length >= 20 && !norm(hit.snippet).includes(needle)) {
            throw new Error(
              `Excerpt komt niet overeen met live fragment voor "${ins.title}" (${src.url})`,
            );
          }
        }
      }
    }
    const hasFact = ins.sources.some((s) => !s.is_ai_interpretation);
    const hasInterpretation = ins.sources.some((s) => s.is_ai_interpretation);
    if (!hasFact || !hasInterpretation) {
      throw new Error(
        `Inzicht "${ins.title}" moet zowel feitelijke bron als duidingsbron bevatten`,
      );
    }
    const hasExternalWebFact = ins.sources.some(
      (s) =>
        s.source_type === "website"
        && !s.is_ai_interpretation
        && Boolean(s.url?.startsWith("https://")),
    );
    if (!hasExternalWebFact) {
      throw new Error(
        `Inzicht "${ins.title}" vereist minstens één externe website-bron (https) als marktbewijs`,
      );
    }
  }

  return parsed.data.insights;
}
