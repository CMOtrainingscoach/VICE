import OpenAI from "openai";
import type { BcgCatalogEntry } from "@/lib/bcg/input-catalog";
import { catalogKey } from "@/lib/bcg/input-catalog";
import { BCG_REF_TYPES, type BcgEvidence, type BcgMeasureBasis, type BcgRefType } from "@/lib/bcg/constants";
import { keepGrounded, stripUngroundedFigures } from "@/lib/bcg/grounding";
import { canonicalBcgNumber, parseBcgNumber } from "@/lib/bcg/math";
import type { BcgAiPayload, BcgRef } from "@/lib/bcg/types";

export type BcgAiItem = {
  item_id: string;
  apply: boolean;
  payload: BcgAiPayload;
};

function resolveModel(): string {
  return process.env.VICE_BCG_MODEL?.trim() || process.env.VICE_VRIO_MODEL?.trim() || process.env.VICE_FIVE_C_MODEL?.trim() || "gpt-4o";
}

function str(v: unknown, max: number): string {
  return v == null ? "" : String(v).trim().slice(0, max);
}

function groundedText(value: unknown, corpus: string, max: number): string {
  return stripUngroundedFigures(str(value, max), corpus);
}

function groundedNum(value: unknown, corpus: string): string {
  if (value == null || value === "") return "";
  const parsed = typeof value === "number" && Number.isFinite(value) ? value : parseBcgNumber(String(value));
  const kept = keepGrounded(parsed, corpus);
  return kept == null ? "" : String(kept);
}

function evidenceOf(value: unknown, hasNumber: boolean): BcgEvidence | "" {
  const raw = str(value, 40);
  if (!hasNumber) return "";
  if (raw === "measured" || raw === "provided" || raw === "forecast" || raw === "estimate") return raw;
  return "provided";
}

/**
 * Koppelt bestaande bronnen aan portfolio-items.
 * Bewust zonder tool-calls. Cijfers die niet letterlijk in de bronnen staan, vallen weg.
 * De AI kiest geen kwadrant.
 */
export async function prepareBcgWithAi(input: {
  tenantName: string;
  catalog: BcgCatalogEntry[];
  items: { id: string; title: string; market: string; locked: boolean }[];
  onlyItemId?: string | null;
}): Promise<{ items: BcgAiItem[]; questions: string[] }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY ontbreekt");
  const targets = input.onlyItemId ? input.items.filter((item) => item.id === input.onlyItemId) : input.items;
  if (targets.length === 0) {
    throw new Error("Er is nog geen aanbod. De voorbereiding verzint geen portfolio-items.");
  }
  if (input.catalog.length === 0) {
    throw new Error("Er zijn nog geen bronnen. Ontbrekende marktcijfers worden een vraag, geen verzonnen getal.");
  }

  const short = new Map<string, BcgCatalogEntry>();
  input.catalog.forEach((entry, index) => short.set(`S${index + 1}`, entry));
  const corpus = [...short.values()].map((entry) => entry.text).join("\n");
  const sources = [...short].map(([key, entry]) => `[${key}] ${entry.label}\n${entry.text}`).join("\n\n");
  const lines = targets.map((item) => `- id=${item.id} · ${item.title} · markt: ${item.market || "nog leeg"} · ${item.locked ? "handmatig beschermd" : "open"}`).join("\n");

  const openai = new OpenAI({ apiKey });
  const completion = await openai.chat.completions.create({
    model: resolveModel(),
    temperature: 0.1,
    max_tokens: 3500,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          `Je bereidt een BCG-matrix voor voor ${input.tenantName}. Antwoord in het Nederlands, als JSON.`,
          "Gebruik alleen de bronnen en de gegeven item-id's. Verzin geen aanbod, markten, concurrenten of cijfers.",
          "Eigen omzetgroei is geen marktgroei. Een SWOT-sterkte of VRIO-uitkomst bewijst geen marktaandeel.",
          "Een grote concurrent bij Porter is niet automatisch de grootste op de gekozen meetbasis.",
          "Een jaarrekening levert niet vanzelf marktgroei of concurrentieaandelen.",
          "Zet een getal alleen als het letterlijk in een bron staat. Anders null en een gerichte vraag.",
          "Kies geen kwadrant en geen investerings- of stopzettingsbeslissing.",
          "JSON: { items: [{ item_id, market_definition, geography, segment, period_label, measure_basis, growth_percent, size_previous, size_current, own_share, leader_share, own_amount, leader_amount, leader_name, open_question, conflict, growth_evidence, share_evidence, refs: [S1] }], questions: [] }",
          "measure_basis is value, volume of leeg. growth_evidence en share_evidence zijn measured, provided, forecast, estimate of leeg.",
        ].join("\n"),
      },
      { role: "user", content: `Bronnen:\n${sources}\n\nPortfolio:\n${lines}` },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: { items?: unknown; questions?: unknown };
  try {
    parsed = JSON.parse(raw) as { items?: unknown; questions?: unknown };
  } catch {
    throw new Error("De AI-voorbereiding gaf geen leesbaar voorstel terug.");
  }

  const allowed = new Set(targets.map((item) => item.id));
  const items: BcgAiItem[] = [];
  for (const row of Array.isArray(parsed.items) ? parsed.items : []) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const itemId = str(record.item_id, 80);
    if (!allowed.has(itemId)) continue;
    const growthPercent = groundedNum(record.growth_percent, corpus);
    const sizePrev = groundedNum(record.size_previous, corpus);
    const sizeCurr = groundedNum(record.size_current, corpus);
    const ownShare = groundedNum(record.own_share, corpus);
    const leaderShare = groundedNum(record.leader_share, corpus);
    const ownAmount = groundedNum(record.own_amount, corpus);
    const leaderAmount = groundedNum(record.leader_amount, corpus);
    let growthMethod: BcgAiPayload["growth_method"] = "none";
    let conflict = groundedText(record.conflict, corpus, 1000);
    if (growthPercent && (sizePrev || sizeCurr)) {
      growthMethod = "direct";
      conflict = [conflict, "Zowel een groeipercentage als marktomvang is voorgesteld; alleen het percentage blijft staan."].filter(Boolean).join(" ");
    } else if (growthPercent) {
      growthMethod = "direct";
    } else if (sizePrev || sizeCurr) {
      growthMethod = "from_size";
    }
    let shareMethod: BcgAiPayload["share_method"] = "none";
    if (ownShare || leaderShare) shareMethod = "from_shares";
    else if (ownAmount || leaderAmount) shareMethod = "from_amounts";
    const basis = str(record.measure_basis, 20);
    const measure = basis === "value" || basis === "volume" ? (basis as BcgMeasureBasis) : "";
    const refs = refsOf(record.refs, short);
    const target = targets.find((item) => item.id === itemId);
    items.push({
      item_id: itemId,
      apply: !target?.locked,
      payload: {
        market_definition: groundedText(record.market_definition, corpus, 500),
        geography: groundedText(record.geography, corpus, 200),
        segment: groundedText(record.segment, corpus, 200),
        period_label: groundedText(record.period_label, corpus, 120),
        measure_basis: measure,
        growth_method: growthMethod,
        growth_percent: growthMethod === "direct" ? growthPercent : "",
        size_previous: growthMethod === "from_size" ? sizePrev : "",
        size_current: growthMethod === "from_size" ? sizeCurr : "",
        share_method: shareMethod,
        own_share: shareMethod === "from_shares" ? ownShare : "",
        leader_share: shareMethod === "from_shares" ? leaderShare : "",
        own_amount: shareMethod === "from_amounts" ? ownAmount : "",
        leader_amount: shareMethod === "from_amounts" ? leaderAmount : "",
        leader_name: groundedText(record.leader_name, corpus, 200),
        open_question: str(record.open_question, 1000),
        conflict,
        growth_evidence: evidenceOf(record.growth_evidence, Boolean(growthPercent || (sizePrev && sizeCurr))),
        share_evidence: evidenceOf(record.share_evidence, Boolean((ownShare && leaderShare) || (ownAmount && leaderAmount))),
        refs,
      },
    });
  }

  const questions = (Array.isArray(parsed.questions) ? parsed.questions : [])
    .map((q) => stripUngroundedFigures(str(q, 500), corpus))
    .filter((q) => q.length >= 8)
    .slice(0, 12);

  if (items.length === 0 && questions.length === 0) {
    throw new Error("De AI vond geen koppelbare gegevens. Ontbrekende cijfers blijven een open vraag.");
  }
  return { items, questions };
}

function refsOf(value: unknown, short: Map<string, BcgCatalogEntry>): BcgRef[] {
  if (!Array.isArray(value)) return [];
  const refs: BcgRef[] = [];
  for (const entry of value) {
    const key = str(entry, 20);
    const source = short.get(key);
    if (!source || !BCG_REF_TYPES.includes(source.ref_type)) continue;
    refs.push({
      ref_type: source.ref_type as BcgRefType,
      ref_id: source.ref_id,
      label: source.label.slice(0, 300),
      excerpt: source.text.slice(0, 500),
      slot: "general",
    });
  }
  return refs.slice(0, 12);
}

export function restrainBcgSynthesis(text: string): string {
  return text
    .trim()
    .replace(/moet(en)? worden stopgezet/gi, "vraagt een aparte beoordeling")
    .replace(/moet(en)? (?:je |u )?investeren/gi, "kan verder onderzocht worden")
    .replace(/is (?:zeker )?winstgevend/gi, "heeft geen bewezen winstgevendheid in deze matrix")
    .replace(/genereert (?:zeker )?cash/gi, "heeft geen bewezen cashgeneratie in deze matrix");
}

/**
 * Schrijft de portfoliotoelichting uit de al berekende posities.
 * Bewust zonder tool-calls. De klasse wordt meegegeven en niet gekozen door het model.
 */
export async function composeBcgSynthesis(input: {
  tenantName: string;
  lines: { title: string; market: string; position: string; note: string }[];
}): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY ontbreekt");
  if (input.lines.length === 0) {
    throw new Error("Er is nog geen portfolio om te duiden. De synthese verzint geen marktpositie.");
  }
  const block = input.lines.map((line, index) => `${index + 1}. ${line.title}\nMarkt: ${line.market || "niet vastgelegd"}\nPositie: ${line.position}\n${line.note}`).join("\n\n");
  const openai = new OpenAI({ apiKey });
  const completion = await openai.chat.completions.create({
    model: resolveModel(),
    temperature: 0.2,
    max_tokens: 1200,
    messages: [
      {
        role: "system",
        content: [
          `Je schrijft voor ${input.tenantName} wat dit portfolio betekent, in het Nederlands, twee tot vier alinea's.`,
          "Gebruik alleen de posities hieronder. Verzin geen cijfers, markten of besluiten.",
          "Een Star is niet automatisch winstgevend. Een Cash cow genereert niet bewezen cash. Een Dog hoeft niet te verdwijnen.",
          "Een Question mark is geen investeringsopdracht. Benoem waar bewijs ontbreekt.",
          "Geen percentages die niet in de positie staan, en geen advies om te stoppen of te investeren.",
        ].join("\n"),
      },
      { role: "user", content: block },
    ],
  });
  const text = restrainBcgSynthesis(completion.choices[0]?.message?.content ?? "");
  if (text.length < 20) throw new Error("De AI-synthese was te kort om te bewaren.");
  return text.slice(0, 12000);
}

export function catalogRefKey(ref: BcgRef): string {
  return catalogKey(ref.ref_type, ref.ref_id);
}

export function emptyNumber(raw: string | null | undefined): string {
  return canonicalBcgNumber(raw ?? "") ?? "";
}
