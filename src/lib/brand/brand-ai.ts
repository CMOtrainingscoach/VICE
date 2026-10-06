import OpenAI from "openai";
import { AAKER_KEYS, KELLER_KEYS, PRIORITY_KINDS } from "@/lib/brand/constants";
import { findingIsGrounded, samePage } from "@/lib/brand/scan-plan";
import type { BrandWorkbench } from "@/lib/brand/types";

function resolveModel(): string {
  return process.env.VICE_BRAND_MODEL?.trim()
    || process.env.VICE_PERSONA_MODEL?.trim()
    || process.env.VICE_STP_MODEL?.trim()
    || "gpt-4o";
}

async function ask(system: string, user: string, maxTokens = 2600): Promise<Record<string, unknown>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY ontbreekt. De handmatige beoordeling blijft beschikbaar.");
  const openai = new OpenAI({ apiKey });
  const completion = await openai.chat.completions.create({
    model: resolveModel(),
    temperature: 0.1,
    max_tokens: maxTokens,
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
  "gap_note beschrijft hoogstens een communicatieverschil tussen de beoogde positionering en wat de site of het beeld zegt. Dat is geen gemeten marktperceptie.",
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

function hostOf(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function hasExternalEvidence(wb: BrandWorkbench): boolean {
  const own = hostOf(wb.version.website_url);
  return wb.sources.some((source) => {
    if (source.excerpt.trim().length <= 20) return false;
    if (source.kind !== "public" && source.material_type !== "research") return false;
    const host = hostOf(source.source_url);
    return !own || !host || host !== own;
  });
}

export async function proposeBrandAssessment(wb: BrandWorkbench): Promise<Record<string, unknown>> {
  const external = hasExternalEvidence(wb);
  const proposal = await ask(
    `${RULES} Antwoord als JSON met dimensions (array van dimension_key, intended, observed, gap_note, evidence_status, judgement, limits_note), verdict, strongest, weakest, unassessed, gap_summary, positioning_intended, perception_observed en priorities (maximaal 3, met title, problem, action, kind, reason). kind is communication, experience of research. evidence_status is sufficient, limited, conflicting of unknown. judgement is strength, mixed, attention of not_assessable. Vul intended, gap_note en verdict vanuit de aangeleverde tekst. Laat observed en perception_observed leeg zonder externe fragmenten.`,
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
  const kinds = new Set<string>(PRIORITY_KINDS);
  const priorities = Array.isArray(proposal.priorities) ? proposal.priorities : [];
  proposal.priorities = priorities
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      title: String(item.title ?? "").slice(0, 160),
      problem: String(item.problem ?? "").slice(0, 800),
      action: String(item.action ?? "").slice(0, 800),
      kind: kinds.has(String(item.kind)) ? String(item.kind) : "research",
      reason: String(item.reason ?? "").slice(0, 400),
    }))
    .filter((item) => item.title.trim().length >= 2)
    .slice(0, 3);
  return proposal;
}

export async function proposeBrandFindings(wb: BrandWorkbench): Promise<{ findings: Record<string, unknown>[] }> {
  const pages = wb.pages.filter((page) => page.included && page.excerpt.trim().length >= 40);
  const visuals = wb.sources.filter((source) => source.mime.startsWith("image/") && source.excerpt.trim().length >= 20);
  const proposal = await ask(
    `${RULES} Antwoord als JSON met findings, maximaal 8. Elk item heeft lens (text, visual of journey), page_url, source_label, observation, meaning, proposal, hypothesis, persona_label en phase_label. text gebruikt alleen een aangeleverde page_url en alleen wat in dat fragment staat. visual gebruikt alleen een aangeleverd source_label en alleen de beeldbeschrijving. journey is een hypothese over hoe een aangeleverde persona-rol de pagina zou kunnen lezen, zonder gedrag of eigenschappen die niet zijn aangeleverd.`,
    JSON.stringify({
      pages: pages.map((page) => ({ url: page.url, role: page.role, excerpt: page.excerpt.slice(0, 1200) })),
      visuals: visuals.map((source) => ({ label: source.label, excerpt: source.excerpt.slice(0, 800) })),
      personas: wb.links.personas.people.map((persona) => ({ role: persona.role_title, hypothesis: persona.hypothesis })),
      positioning: wb.links.stp.sentence || wb.version.positioning_intended,
    }),
    2800,
  );
  const roles = wb.links.personas.people.map((persona) => persona.role_title);
  const raw = Array.isArray(proposal.findings) ? proposal.findings : [];
  const seen = new Set<string>();
  const findings: Record<string, unknown>[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const lens = item.lens === "visual" || item.lens === "journey" ? item.lens : "text";
    const observation = String(item.observation ?? "").trim().slice(0, 1200);
    if (lens === "visual") {
      const source = visuals.find((entry) => entry.label === String(item.source_label ?? ""));
      if (!source || !findingIsGrounded(observation, source.excerpt) || seen.has(`visual|${source.label}`)) continue;
      seen.add(`visual|${source.label}`);
      findings.push({
        lens,
        page_url: "",
        source_label: source.label,
        observation,
        meaning: String(item.meaning ?? "").slice(0, 1200),
        proposal: String(item.proposal ?? "").slice(0, 800),
        hypothesis: true,
        persona_label: "",
        phase_label: "",
      });
    } else {
      const page = pages.find((entry) => samePage(entry.url, String(item.page_url ?? "")));
      if (!page || !findingIsGrounded(observation, page.excerpt) || seen.has(`${lens}|${page.url}`)) continue;
      seen.add(`${lens}|${page.url}`);
      const persona = roles.find((role) => role.toLowerCase() === String(item.persona_label ?? "").trim().toLowerCase()) ?? "";
      findings.push({
        lens,
        page_url: page.url,
        source_label: "",
        observation,
        meaning: String(item.meaning ?? "").slice(0, 1200),
        proposal: String(item.proposal ?? "").slice(0, 800),
        hypothesis: lens === "journey" || item.hypothesis !== false,
        persona_label: lens === "journey" ? persona : "",
        phase_label: lens === "journey" ? String(item.phase_label ?? "").slice(0, 160) : "",
      });
    }
    if (findings.length >= 8) break;
  }
  return { findings };
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
