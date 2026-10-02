import OpenAI from "openai";
import { VC_CATEGORIES, VC_CATEGORY_LABELS, type VcBusinessType, type VcCategory, type VcEvidence } from "@/lib/value-chain/constants";
import type { VcCatalogEntry } from "@/lib/value-chain/input-catalog";

export type VcAiActivity = {
  activity_id: string | null;
  category: VcCategory;
  name: string;
  description: string;
  inputs_text: string;
  outputs_text: string;
  customer_value: string;
  execution: "internal" | "external" | "mixed" | "unknown";
  bottleneck_observation: string;
  bottleneck_explanation: string;
  bottleneck_improvement: string;
  open_question: string;
  evidence_level: VcEvidence;
  refs: { ref_type: string; ref_id: string | null; label: string; excerpt: string }[];
};

const EVIDENCE: VcEvidence[] = ["provided", "observed", "hypothesis"];
const EXEC = ["internal", "external", "mixed", "unknown"] as const;

function resolveModel(): string {
  return process.env.VICE_VALUE_CHAIN_MODEL?.trim() || process.env.VICE_VRIO_MODEL?.trim() || "gpt-4o";
}

function str(v: unknown, max: number): string {
  return v == null ? "" : String(v).trim().slice(0, max);
}

/** Bedragen die niet letterlijk in de aangehaalde bronnen staan, horen niet in de tekst. */
function stripUngroundedAmounts(text: string, sourceText: string): string {
  return text.replace(
    /€\s?\d[\d.\s]*|\b\d{1,3}(?:\.\d{3})+(?:,\d+)?\b|\b\d+[.,]\d{2}\b|\b\d+(?:[.,]\d+)?\s?%/g,
    (match) => (sourceText.includes(match) ? match : ""),
  );
}

/**
 * Stelt een activiteitenstructuur voor op basis van het dossier en eerdere analyses.
 * Bewust zonder tool-calls. Kosten, tijd, capaciteit en marge worden genegeerd,
 * ook als het model ze toch teruggeeft.
 */
export async function prepareValueChainWithAi(input: {
  tenantName: string;
  businessType: VcBusinessType;
  offering: string;
  market: string;
  periodLabel: string;
  goal: string;
  catalog: VcCatalogEntry[];
  activities: { id: string; name: string; category: string }[];
  onlyActivityId?: string | null;
}): Promise<{ activities: VcAiActivity[]; synthesis: string; missing: string[] }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY ontbreekt");
  if (input.catalog.length === 0) {
    throw new Error("Er is nog geen procesbeschrijving of eerdere analyse. Stel gerichte vragen; we verzinnen geen activiteiten.");
  }

  const labels = VC_CATEGORY_LABELS[input.businessType];
  const shortKeys = new Map<string, VcCatalogEntry>();
  input.catalog.forEach((e, i) => shortKeys.set(`S${i + 1}`, e));
  const sources = [...shortKeys].map(([sk, e]) => `[${sk}] ${e.label}\n${e.text}`).join("\n\n");
  const existing = input.activities.map((a) => `- id=${a.id} · ${a.category} · ${a.name}`).join("\n");

  const openai = new OpenAI({ apiKey });
  const completion = await openai.chat.completions.create({
    model: resolveModel(),
    temperature: 0.1,
    max_tokens: 6000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "Je structureert een waardeketen voor een strategisch adviseur.",
          "Gebruik alleen de meegegeven bronnen. Verzin geen activiteiten, kosten, uren, capaciteit, marges of besparingen.",
          "Een VRIO- of SWOT-classificatie is geen bewijs van proceskosten of marge.",
          "Ontbreekt iets, zet het in open_question en evidence_level hypothesis.",
          "Houd waarneming, verklaring en verbetering uit elkaar.",
          "Geef geen pijlen of verplichte volgorde. Categorieën zijn een indeling, geen procesflow.",
          `Toegestane category-waarden: ${VC_CATEGORIES.join(", ")}.`,
          "Antwoord als JSON: {\"activities\":[...],\"synthesis\":\"\",\"missing\":[]}.",
          "Elke activity: activity_id (bestaand id of null), category, name, description, inputs_text, outputs_text, customer_value, execution, bottleneck_observation, bottleneck_explanation, bottleneck_improvement, open_question, evidence_level, refs (lijst van S-codes).",
          "Neem geen velden op voor kosten, tijd, tarief of marge.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `Klant: ${input.tenantName}`,
          `Aanbod: ${input.offering || "(nog niet afgebakend)"}`,
          `Bedrijfstype: ${input.businessType}`,
          `Markt: ${input.market || "onbekend"}`,
          `Periode: ${input.periodLabel || "onbekend"}`,
          `Doel: ${input.goal || "onbekend"}`,
          `Passende labels: ${VC_CATEGORIES.map((c) => `${c}=${labels[c]}`).join("; ")}`,
          input.onlyActivityId ? `Werk alleen activiteit ${input.onlyActivityId} bij.` : "Bereid de keten voor. Hergebruik bestaande activiteiten op id.",
          existing ? `Bestaande activiteiten:\n${existing}` : "Nog geen activiteiten.",
          `Bronnen:\n${sources}`,
        ].join("\n\n"),
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: { activities?: unknown; synthesis?: unknown; missing?: unknown };
  try {
    parsed = JSON.parse(raw) as { activities?: unknown; synthesis?: unknown; missing?: unknown };
  } catch {
    throw new Error("De AI-voorbereiding gaf geen leesbaar voorstel terug.");
  }

  const allowedIds = new Set(input.activities.map((a) => a.id));
  const activities: VcAiActivity[] = [];
  const rows = Array.isArray(parsed.activities) ? parsed.activities : [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const category = str(rec.category, 40);
    if (!VC_CATEGORIES.includes(category as VcCategory)) continue;
    const name = str(rec.name, 160);
    if (name.length < 2) continue;
    const activityId = str(rec.activity_id, 80);
    if (input.onlyActivityId && activityId !== input.onlyActivityId) continue;

    const refCodes = Array.isArray(rec.refs) ? rec.refs : [];
    const refs = refCodes
      .map((code) => shortKeys.get(str(code, 12)))
      .filter((e): e is VcCatalogEntry => Boolean(e))
      .map((e) => ({
        ref_type: e.ref_type,
        ref_id: e.ref_id,
        label: e.label,
        excerpt: e.text.slice(0, 400),
      }));
    const sourceText = refs.map((r) => `${r.label}\n${r.excerpt}`).join("\n");
    const evidence = EVIDENCE.includes(rec.evidence_level as VcEvidence) ? (rec.evidence_level as VcEvidence) : "hypothesis";
    const execution = EXEC.includes(rec.execution as (typeof EXEC)[number]) ? (rec.execution as (typeof EXEC)[number]) : "unknown";

    activities.push({
      activity_id: activityId && allowedIds.has(activityId) ? activityId : null,
      category: category as VcCategory,
      name,
      description: stripUngroundedAmounts(str(rec.description, 2000), sourceText),
      inputs_text: stripUngroundedAmounts(str(rec.inputs_text, 1000), sourceText),
      outputs_text: stripUngroundedAmounts(str(rec.outputs_text, 1000), sourceText),
      customer_value: stripUngroundedAmounts(str(rec.customer_value, 1000), sourceText),
      execution,
      bottleneck_observation: stripUngroundedAmounts(str(rec.bottleneck_observation, 1000), sourceText),
      bottleneck_explanation: stripUngroundedAmounts(str(rec.bottleneck_explanation, 1000), sourceText),
      bottleneck_improvement: stripUngroundedAmounts(str(rec.bottleneck_improvement, 1000), sourceText),
      open_question: str(rec.open_question, 500) || (refs.length === 0 ? "Welke bron beschrijft deze activiteit?" : ""),
      evidence_level: refs.length === 0 ? "hypothesis" : evidence,
      refs,
    });
  }

  if (activities.length === 0) {
    throw new Error("De AI vond geen onderbouwde activiteiten. Voeg een procesbeschrijving toe of formuleer de activiteiten zelf.");
  }

  const missing = Array.isArray(parsed.missing) ? parsed.missing.map((m) => str(m, 240)).filter(Boolean).slice(0, 8) : [];
  return {
    activities,
    synthesis: stripUngroundedAmounts(str(parsed.synthesis, 4000), sources),
    missing,
  };
}
