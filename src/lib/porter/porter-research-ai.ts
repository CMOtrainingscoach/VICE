import OpenAI from "openai";
import { z } from "zod";
import { PORTER_FORCE_META, type PorterForceKey } from "@/lib/porter/constants";
import {
  serializePorterContextForPrompt,
  type PorterResearchContext,
} from "@/lib/porter/build-research-context";
import {
  allowedPorterWebUrlSet,
  serializePorterWebEvidenceForPrompt,
  type PorterWebHit,
} from "@/lib/porter/porter-web-evidence";
import { resolvePorterResearchModel, porterResearchMaxOutputTokens } from "@/lib/openai/models";
import { formatZodIssue, zodString } from "@/lib/pestel/zod-form";
import { normalizeWebUrl } from "@/lib/pestel/pestel-web-evidence";

const INTENSITY_VALUES = ["low", "medium", "high", "unknown"] as const;
const EFFECT_VALUES = ["increases_pressure", "decreases_pressure", "unclear"] as const;
const EVIDENCE_VALUES = ["provided", "observed", "hypothesis"] as const;

const sourceSchema = z.object({
  source_type: z.enum(["website", "pestel", "manual"]),
  label: zodString(500, 1),
  url: z.preprocess(
    (v) => (v == null || v === "" ? undefined : String(v)),
    z.string().optional(),
  ),
  publisher: z.preprocess(
    (v) => (v == null || v === "" ? undefined : String(v)),
    z.string().optional(),
  ),
  pestel_insight_id: z.preprocess(
    (v) => (v == null || v === "" ? undefined : String(v)),
    z.string().uuid().optional(),
  ),
  excerpt: zodString(4000, 20),
});

const factorSchema = z.object({
  title: zodString(300, 3),
  observation: zodString(4000, 30),
  effect: z.enum(EFFECT_VALUES),
  effect_note: zodString(1000),
  evidence_level: z.enum(EVIDENCE_VALUES),
  pestel_insight_id: z.preprocess(
    (v) => (v == null || v === "" ? undefined : String(v)),
    z.string().uuid().optional(),
  ),
  sources: z.array(sourceSchema).min(1),
});

const forceResponseSchema = z.object({
  intensity: z.enum(INTENSITY_VALUES),
  headline_factor: zodString(500, 5),
  motivation: zodString(8000, 40),
  client_relevance: zodString(4000, 20),
  factors: z.array(factorSchema).min(1).max(4),
});

export type PorterAiForceAnalysis = z.infer<typeof forceResponseSchema>;

function normalizeIntensity(raw: unknown): (typeof INTENSITY_VALUES)[number] {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "laag" || s === "low") return "low";
  if (s === "middel" || s === "medium" || s === "gemiddeld") return "medium";
  if (s === "hoog" || s === "high") return "high";
  if (INTENSITY_VALUES.includes(s as (typeof INTENSITY_VALUES)[number])) {
    return s as (typeof INTENSITY_VALUES)[number];
  }
  return "medium";
}

function pickExcerptFromSnippet(excerpt: string, snippet: string): string {
  const e = excerpt.trim();
  if (e.length < 20) return snippet.slice(0, 400).trim();
  const norm = (t: string) => t.toLowerCase().replace(/\s+/g, " ");
  if (snippet.length > 0 && !norm(snippet).includes(norm(e).slice(0, Math.min(40, e.length)))) {
    return snippet.slice(0, 400).trim();
  }
  return e.slice(0, 4000);
}

function normalizePayload(
  raw: unknown,
  allowedWebUrls: Set<string>,
  allowedPestelIds: Set<string>,
  urlSnippets: Map<string, string>,
): PorterAiForceAnalysis {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const pre = {
    ...obj,
    intensity: normalizeIntensity(obj.intensity),
    headline_factor: String(obj.headline_factor ?? obj.headline ?? "").trim() || "Factor",
    motivation: String(obj.motivation ?? "").trim(),
    client_relevance: String(obj.client_relevance ?? "").trim(),
    factors: Array.isArray(obj.factors) ? obj.factors : [],
  };

  const parsed = forceResponseSchema.safeParse(pre);
  if (!parsed.success) {
    throw new Error(formatZodIssue(parsed.error));
  }

  const factors = parsed.data.factors.map((f) => {
    let pestelId = f.pestel_insight_id;
    if (pestelId && !allowedPestelIds.has(pestelId)) pestelId = undefined;

    const sources = f.sources.map((s) => {
      if (s.source_type === "pestel") {
        const pid = s.pestel_insight_id;
        if (!pid || !allowedPestelIds.has(pid)) {
          throw new Error("PESTEL-bron vereist geldig pestel_insight_id uit de context");
        }
        return { ...s, pestel_insight_id: pid, url: undefined };
      }
      if (s.source_type === "website") {
        const url = s.url ? normalizeWebUrl(s.url) : "";
        if (!url || !allowedWebUrls.has(url)) {
          throw new Error(`Website-bron URL niet toegestaan: ${s.url ?? "(leeg)"}`);
        }
        return {
          ...s,
          url,
          excerpt: pickExcerptFromSnippet(s.excerpt, urlSnippets.get(url) ?? ""),
        };
      }
      return s;
    });

    return { ...f, pestel_insight_id: pestelId, sources };
  });

  return { ...parsed.data, factors };
}

export async function generatePorterForceAnalysis(input: {
  forceKey: PorterForceKey;
  context: PorterResearchContext;
  webEvidence: PorterWebHit[];
  allowedWebUrls: Set<string>;
}): Promise<PorterAiForceAnalysis> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY ontbreekt");
  }

  const allowedPestelIds = new Set(input.context.pestelInsights.map((i) => i.id));
  const meta = PORTER_FORCE_META[input.forceKey];
  const model = resolvePorterResearchModel();
  const openai = new OpenAI({ apiKey });

  const allowedWebUrls = allowedPorterWebUrlSet(input.webEvidence);
  const urlSnippets = new Map(
    input.webEvidence.map((h) => [normalizeWebUrl(h.url), h.snippet]),
  );

  const completion = await openai.chat.completions.create({
    model,
    temperature: 0.2,
    max_tokens: porterResearchMaxOutputTokens(),
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Je bent strategisch onderzoeksassistent voor VICE (Porter Five Forces).
Analyseer ÉÉN kracht: ${meta.label}.
Antwoord in het Nederlands. JSON-only.

Regels:
- intensity: low|medium|high (concurrentiedruk van deze kracht voor de klant in deze markt)
- headline_factor: korte titel voor het overzicht (max 1 zin)
- motivation: waarom deze inschatting (feiten + marktlogica)
- client_relevance: wat dit betekent voor de klant
- factors: 1–4 concrete factoren met bronnen
- Koppel waar relevant PESTEL-inzichten via source_type "pestel" + pestel_insight_id uit de context
- Website-bronnen: alleen URLs uit live webonderzoek; excerpt uit fragment
- effect: increases_pressure | decreases_pressure | unclear`,
      },
      {
        role: "user",
        content: [
          serializePorterContextForPrompt(input.context),
          serializePorterWebEvidenceForPrompt(input.webEvidence),
          "",
          `Analyseer nu de kracht: ${meta.shortLabel} (${input.forceKey}).`,
          "",
          `JSON-vorm: {"intensity":"low|medium|high","headline_factor":"…","motivation":"…","client_relevance":"…","factors":[{"title":"…","observation":"…","effect":"increases_pressure","effect_note":"","evidence_level":"observed","pestel_insight_id":"uuid-optioneel","sources":[{"source_type":"website","label":"…","url":"https://…","excerpt":"…"}]}]}`,
        ].join("\n"),
      },
    ],
  });

  const text = completion.choices[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("Leeg AI-antwoord");
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("AI-antwoord is geen geldige JSON");
  }

  return normalizePayload(json, allowedWebUrls, allowedPestelIds, urlSnippets);
}
