import OpenAI from "openai";
import type { StpSource } from "@/lib/stp/catalog";
import type { StpRef } from "@/lib/stp/types";

function resolveModel(): string {
  return process.env.VICE_STP_MODEL?.trim() || process.env.VICE_BCG_MODEL?.trim() || process.env.VICE_VRIO_MODEL?.trim() || "gpt-4o";
}

function str(value: unknown, max: number): string {
  return value == null ? "" : String(value).trim().slice(0, max);
}

function stripUngroundedAmounts(text: string, corpus: string): string {
  return text.replace(/€\s?\d[\d.\s]*|\b\d{1,3}(?:\.\d{3})+(?:,\d+)?\b|\b\d+[.,]\d{2}\b|\b\d+(?:[.,]\d+)?\s?%/g, (match) => (corpus.includes(match) ? match : ""));
}

function refsOf(raw: unknown, byKey: Map<string, StpSource>): StpRef[] {
  if (!Array.isArray(raw)) return [];
  const refs: StpRef[] = [];
  for (const key of raw) {
    const source = byKey.get(String(key));
    if (source) refs.push(source.ref);
  }
  return refs;
}

async function ask(system: string, user: string): Promise<Record<string, unknown>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY ontbreekt");
  const openai = new OpenAI({ apiKey });
  const completion = await openai.chat.completions.create({
    model: resolveModel(),
    temperature: 0.1,
    max_tokens: 3500,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  const raw = completion.choices[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("De AI gaf geen leesbaar voorstel terug. Je bestaande tekst blijft staan.");
  }
}

function corpusOf(sources: StpSource[]): { text: string; byKey: Map<string, StpSource> } {
  const byKey = new Map(sources.map((source) => [source.key, source]));
  return { text: sources.map((source) => source.text).join("\n"), byKey };
}

const RULES = [
  "Je werkt voor een strategisch adviseur. Antwoord in het Nederlands, als JSON.",
  "Gebruik alleen de meegegeven bronnen. Verzin geen segmenten, behoeften, budgetten, marktomvang, concurrenten of klantkenmerken.",
  "Ontbreekt iets, laat het veld leeg en zet hypothesis op true of de beoordeling op unknown.",
  "Een SWOT-sterkte, een VRIO-uitkomst of een BCG-kwadrant is geen bewijs van een klantbehoefte.",
  "Geen buyer persona, geen naam, leeftijd of privékenmerken. Dit gaat over een klantbedrijf.",
  "Bewust zonder tool-calls.",
].join("\n");

export async function proposeStpSegments(input: {
  tenantName: string;
  offering: string;
  geography: string;
  sources: StpSource[];
}): Promise<{ segments: Record<string, unknown>[] }> {
  if (input.sources.length === 0) {
    throw new Error("Er zijn nog geen klantinzichten. Voeg informatie toe; de AI verzint geen segmenten.");
  }
  const { text, byKey } = corpusOf(input.sources);
  const parsed = await ask(
    [
      RULES,
      "Stel 0 tot 5 segmenten voor, alleen zoveel als de bronnen dragen. Forceer geen minimum.",
      "JSON: {\"segments\":[{\"name\":\"\",\"description\":\"\",\"need\":\"\",\"traits\":\"\",\"geography\":\"\",\"trigger_text\":\"\",\"offering\":\"\",\"include_criteria\":\"\",\"exclude_criteria\":\"\",\"assumptions\":\"\",\"open_question\":\"\",\"hypothesis\":true,\"refs\":[\"S1\"]}]}",
    ].join("\n"),
    `Klant: ${input.tenantName}\nAanbod: ${input.offering || "onbekend"}\nGeografie: ${input.geography || "onbekend"}\n\nBronnen:\n${input.sources.map((source) => `[${source.key}] ${source.ref.label}\n${source.text}`).join("\n\n")}`,
  );
  const rows = Array.isArray(parsed.segments) ? parsed.segments.slice(0, 5) : [];
  return {
    segments: rows.flatMap((row) => {
      if (!row || typeof row !== "object") return [];
      const item = row as Record<string, unknown>;
      const name = stripUngroundedAmounts(str(item.name, 200), text);
      if (name.length < 2) return [];
      return [{
        name,
        description: stripUngroundedAmounts(str(item.description, 2000), text),
        need: stripUngroundedAmounts(str(item.need, 1000), text),
        traits: stripUngroundedAmounts(str(item.traits, 1000), text),
        geography: str(item.geography, 200),
        trigger_text: str(item.trigger_text, 500),
        offering: str(item.offering, 300) || input.offering,
        include_criteria: str(item.include_criteria, 1000),
        exclude_criteria: str(item.exclude_criteria, 1000),
        assumptions: str(item.assumptions, 1000),
        open_question: str(item.open_question, 1000),
        hypothesis: item.hypothesis !== false,
        refs: refsOf(item.refs, byKey),
      }];
    }),
  };
}

export async function proposeStpTarget(input: {
  tenantName: string;
  segments: { name: string; need: string }[];
  sources: StpSource[];
}): Promise<Record<string, unknown>> {
  if (input.segments.length === 0) throw new Error("Er zijn nog geen segmenten om te vergelijken.");
  const { text } = corpusOf(input.sources);
  const parsed = await ask(
    [
      RULES,
      "Beoordeel elk segment op need, offer, capability, reach, delivery, commercial.",
      "Waarden: strong, mixed, weak, unknown. unknown is niet zwak.",
      "Geen totaalscore en geen automatische winnaar.",
      "JSON: {\"scores\":[{\"segment_name\":\"\",\"dimension\":\"need\",\"rating\":\"unknown\",\"note\":\"\",\"assumption\":\"\"}],\"preference_note\":\"\",\"preference_tradeoffs\":\"\",\"preference_risks\":\"\"}",
    ].join("\n"),
    `Klant: ${input.tenantName}\nSegmenten:\n${input.segments.map((segment) => `- ${segment.name}: ${segment.need || "behoefte onbekend"}`).join("\n")}\n\nBronnen:\n${input.sources.map((source) => `[${source.key}] ${source.text}`).join("\n\n")}`,
  );
  const scores = Array.isArray(parsed.scores) ? parsed.scores : [];
  return {
    scores: scores.flatMap((row) => {
      if (!row || typeof row !== "object") return [];
      const item = row as Record<string, unknown>;
      return [{
        segment_name: str(item.segment_name, 200),
        dimension: str(item.dimension, 20),
        rating: str(item.rating, 20) || "unknown",
        note: stripUngroundedAmounts(str(item.note, 500), text),
        assumption: str(item.assumption, 500),
      }];
    }),
    preference_note: stripUngroundedAmounts(str(parsed.preference_note, 1500), text),
    preference_tradeoffs: stripUngroundedAmounts(str(parsed.preference_tradeoffs, 1500), text),
    preference_risks: stripUngroundedAmounts(str(parsed.preference_risks, 1500), text),
  };
}

export async function proposeStpPosition(input: {
  tenantName: string;
  offering: string;
  segmentName: string;
  need: string;
  sources: StpSource[];
}): Promise<Record<string, unknown>> {
  const { text } = corpusOf(input.sources);
  const parsed = await ask(
    [
      RULES,
      "Vul alleen wat de bronnen dragen. Claim geen exclusiviteit of marktleiderschap.",
      "claim_status is supported, hypothesis, missing of conflict.",
      "JSON: {\"audience\":\"\",\"problem\":\"\",\"promise\":\"\",\"distinction\":\"\",\"evidence_text\":\"\",\"position_sentence\":\"\",\"claim_status\":\"hypothesis\"}",
    ].join("\n"),
    `Klant: ${input.tenantName}\nAanbod: ${input.offering}\nDoelgroep: ${input.segmentName}\nBehoefte: ${input.need || "onbekend"}\n\nBronnen:\n${input.sources.map((source) => `[${source.key}] ${source.text}`).join("\n\n")}`,
  );
  return {
    audience: stripUngroundedAmounts(str(parsed.audience, 500), text),
    problem: stripUngroundedAmounts(str(parsed.problem, 1000), text),
    promise: stripUngroundedAmounts(str(parsed.promise, 1000), text),
    distinction: stripUngroundedAmounts(str(parsed.distinction, 1000), text),
    evidence_text: stripUngroundedAmounts(str(parsed.evidence_text, 1500), text),
    position_sentence: stripUngroundedAmounts(str(parsed.position_sentence, 400), text),
    claim_status: ["supported", "hypothesis", "missing", "conflict"].includes(str(parsed.claim_status, 20)) ? str(parsed.claim_status, 20) : "hypothesis",
  };
}

export async function proposeStpSentence(input: {
  tenantName: string;
  offering: string;
  geography: string;
  segmentName: string;
  need: string;
  audience: string;
  problem: string;
  promise: string;
  distinction: string;
  evidence: string;
  sources: StpSource[];
}): Promise<string> {
  const page = [
    input.audience,
    input.problem,
    input.promise,
    input.distinction,
    input.evidence,
    input.offering,
    input.geography,
    input.segmentName,
    input.need,
  ].map((part) => part.trim()).filter(Boolean);
  if (page.length === 0 && input.sources.length === 0) {
    throw new Error("Er is nog te weinig om een zin van te maken. Vul eerst voor wie, het probleem of de belofte in.");
  }
  const { text } = corpusOf(input.sources);
  const corpus = `${text}\n${page.join("\n")}`;
  const parsed = await ask(
    [
      RULES,
      "Schrijf één positioneringszin in gewone taal, maximaal twee zinnen.",
      "Gebruik alleen de onderdelen op de pagina en de meegegeven bronnen.",
      "Neem geen feit, cijfer of claim op dat daar niet staat. Laat ontbrekende delen weg.",
      "Geen aanhalingstekens en geen woorden als uniek, innovatief of totaaloplossing.",
      "JSON: {\"position_sentence\":\"\"}. Laat de zin leeg als er niets bruikbaars is.",
    ].join("\n"),
    [
      `Klant: ${input.tenantName}`,
      `Aanbod: ${input.offering || "onbekend"}`,
      `Geografie: ${input.geography || "onbekend"}`,
      `Doelgroep: ${input.segmentName || "onbekend"}`,
      `Behoefte: ${input.need || "onbekend"}`,
      `Voor wie: ${input.audience || "leeg"}`,
      `Probleem: ${input.problem || "leeg"}`,
      `Belofte: ${input.promise || "leeg"}`,
      `Onderscheid: ${input.distinction || "leeg"}`,
      `Bewijs: ${input.evidence || "leeg"}`,
      `Bronnen:\n${input.sources.map((source) => `[${source.key}] ${source.text}`).join("\n\n") || "geen"}`,
    ].join("\n"),
  );
  return stripUngroundedAmounts(str(parsed.position_sentence, 400), corpus).replace(/\s+/g, " ").trim();
}

export async function proposeStpIcp(input: {
  tenantName: string;
  offering: string;
  segmentName: string;
  need: string;
  position: { audience: string; problem: string; promise: string; distinction: string; evidence_text: string; sentence: string };
  sources: StpSource[];
}): Promise<Record<string, unknown>> {
  const { text } = corpusOf(input.sources);
  const parsed = await ask(
    [
      RULES,
      "Maak een ICP van een klantbedrijf, geen persona.",
      "Lege velden blijven leeg. criteria.kind is must, plus of exclude.",
      "JSON met icp_name, icp_summary, icp_sector, icp_stage, icp_size, icp_structure, icp_tech, icp_problem, icp_need, icp_outcome, icp_trigger, icp_inaction, icp_budget, icp_capacity, icp_conditions, icp_timing, assumptions, open_questions, criteria:[{kind, body}].",
    ].join("\n"),
    [
      `Klant: ${input.tenantName}`,
      `Aanbod: ${input.offering}`,
      `Doelgroep: ${input.segmentName}`,
      `Behoefte: ${input.need}`,
      `Positionering: ${input.position.sentence || input.position.promise}`,
      `Onderscheid: ${input.position.distinction || "onbekend"}`,
      `Bewijs: ${input.position.evidence_text || "onbekend"}`,
      `Bronnen:\n${input.sources.map((source) => `[${source.key}] ${source.text}`).join("\n\n")}`,
    ].join("\n"),
  );
  const criteria = Array.isArray(parsed.criteria) ? parsed.criteria : [];
  const fields = ["icp_name", "icp_summary", "icp_sector", "icp_stage", "icp_size", "icp_structure", "icp_tech", "icp_problem", "icp_need", "icp_outcome", "icp_trigger", "icp_inaction", "icp_budget", "icp_capacity", "icp_conditions", "icp_timing", "assumptions", "open_questions"] as const;
  const result: Record<string, unknown> = {};
  for (const field of fields) result[field] = stripUngroundedAmounts(str(parsed[field], 1500), text);
  result.criteria = criteria.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const item = row as Record<string, unknown>;
    const kind = str(item.kind, 20);
    const body = stripUngroundedAmounts(str(item.body, 400), text);
    if (!["must", "plus", "exclude"].includes(kind) || body.length < 2) return [];
    return [{ kind, body }];
  });
  return result;
}
