import OpenAI from "openai";
import { AAKER_KEYS, KELLER_KEYS } from "@/lib/brand/constants";
import type { BrandWorkbench } from "@/lib/brand/types";

function resolveModel(): string {
  return process.env.VICE_BRAND_MODEL?.trim()
    || process.env.VICE_PERSONA_MODEL?.trim()
    || process.env.VICE_STP_MODEL?.trim()
    || "gpt-4o";
}

async function ask(system: string, user: string): Promise<Record<string, unknown>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY ontbreekt. De handmatige beoordeling blijft beschikbaar.");
  const openai = new OpenAI({ apiKey });
  const completion = await openai.chat.completions.create({
    model: resolveModel(),
    temperature: 0.1,
    max_tokens: 2200,
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
    throw new Error("De AI gaf geen leesbaar voorstel terug. Je tekst blijft staan.");
  }
}

const RULES = [
  "Je werkt alleen met de aangeleverde tekst.",
  "Een website toont wat het merk zegt. Dat is geen bewijs van wat de markt ervan vindt.",
  "Persona’s en klantreizen richten de blik. Ze bewijzen geen marktperceptie.",
  "Geen informatie is onbekend, niet een slechte prestatie.",
  "Verzin geen cijfers, onderzoeken, reviews, citaten of share of voice.",
  "Laat een veld leeg als de bron het niet draagt.",
  "observed blijft leeg zonder externe of onderzoeksfragmenten.",
  "judgement is not_assessable wanneer evidence_status unknown is.",
].join(" ");

function pack(wb: BrandWorkbench): string {
  const keys = wb.version.model === "aaker" ? AAKER_KEYS : KELLER_KEYS;
  return JSON.stringify({
    model: wb.version.model,
    keys,
    positioning: wb.links.stp.sentence || wb.version.positioning_intended,
    icp: [wb.links.stp.name, wb.links.stp.offering, wb.links.stp.geography, wb.links.stp.sector].filter(Boolean),
    personas: wb.links.personas.people.map((persona) => ({ role: persona.role_title, hypothesis: persona.hypothesis })),
    pages: wb.pages.filter((page) => page.included && page.excerpt).map((page) => ({ url: page.url, role: page.role, excerpt: page.excerpt.slice(0, 1200) })),
    sources: wb.sources.filter((source) => source.excerpt || source.note).map((source) => ({
      kind: source.kind,
      material_type: source.material_type,
      label: source.label,
      excerpt: (source.excerpt || source.note).slice(0, 800),
      url: source.source_url,
    })),
  });
}

export async function proposeBrandAssessment(wb: BrandWorkbench): Promise<Record<string, unknown>> {
  const external = wb.sources.some((source) => (source.kind === "public" || source.material_type === "research") && source.excerpt.trim().length > 20);
  const proposal = await ask(
    `${RULES} Antwoord als JSON met dimensions (array van dimension_key, intended, observed, gap_note, evidence_status, judgement, limits_note), verdict, strongest, weakest, unassessed, gap_summary, positioning_intended, perception_observed. evidence_status is sufficient, limited, conflicting of unknown. judgement is strength, mixed, attention of not_assessable.`,
    pack(wb),
  );
  const allowed = new Set(wb.version.model === "aaker" ? AAKER_KEYS : KELLER_KEYS);
  const dimensions = Array.isArray(proposal.dimensions) ? proposal.dimensions : [];
  proposal.dimensions = dimensions
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .filter((item) => allowed.has(String(item.dimension_key) as never))
    .map((item) => {
      const observed = external ? String(item.observed ?? "").slice(0, 800) : "";
      const evidence = external ? String(item.evidence_status ?? "unknown") : "unknown";
      const judgement = evidence === "unknown" ? "not_assessable" : String(item.judgement ?? "not_assessable");
      return { ...item, observed, evidence_status: evidence, judgement };
    });
  if (!external) {
    proposal.perception_observed = "";
    proposal.strongest = "";
  }
  return proposal;
}

export async function describeUploadedVisual(bytes: Uint8Array, mime: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return "";
  const openai = new OpenAI({ apiKey });
  const completion = await openai.chat.completions.create({
    model: resolveModel(),
    temperature: 0.1,
    max_tokens: 400,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: "Beschrijf alleen wat zichtbaar is: kleuren, tekst die je kunt lezen, logo, hiërarchie. Geen marktperceptie, geen resultaten, geen doelgroepkenmerken. Maximaal 500 tekens." },
        { type: "image_url", image_url: { url: `data:${mime};base64,${Buffer.from(bytes).toString("base64")}` } },
      ],
    }],
  });
  return (completion.choices[0]?.message?.content ?? "").trim().slice(0, 800);
}
