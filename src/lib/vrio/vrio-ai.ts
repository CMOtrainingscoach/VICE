import OpenAI from "openai";
import {
  VRIO_CRITERIA,
  VRIO_CRITERION_META,
  type VrioAnswer,
  type VrioCriterion,
  type VrioEvidenceLevel,
} from "@/lib/vrio/constants";
import type { VrioCatalogEntry } from "@/lib/vrio/input-catalog";

export type VrioAiCriterion = {
  criterion: VrioCriterion;
  answer: VrioAnswer;
  motivation: string;
  evidence_level: VrioEvidenceLevel;
  open_question: string;
  missing_evidence: string;
  refs: { ref_type: string; ref_id: string | null; label: string; excerpt: string }[];
};

export type VrioAiResource = {
  resource_id: string;
  criteria: VrioAiCriterion[];
};

const ANSWERS: VrioAnswer[] = ["yes", "no", "unknown"];
const EVIDENCE: VrioEvidenceLevel[] = ["provided", "observed", "hypothesis"];

function resolveModel(): string {
  return process.env.VICE_VRIO_MODEL?.trim() || process.env.VICE_FIVE_C_MODEL?.trim() || "gpt-4o";
}

function str(v: unknown, max: number): string {
  return v == null ? "" : String(v).trim().slice(0, max);
}

/**
 * Stelt per middel en criterium een antwoord voor op basis van bestaande analyses.
 * Bewust zonder tool-calls: deze workflow heeft geen webzoekfunctie. De AI bepaalt
 * nooit de uiteindelijke classificatie; die volgt uit vaste regels in de applicatie.
 */
export async function prepareVrioWithAi(input: {
  tenantName: string;
  catalog: VrioCatalogEntry[];
  resources: { id: string; title: string; description: string; kind: string; market_context: string }[];
}): Promise<VrioAiResource[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY ontbreekt");
  if (input.resources.length === 0) throw new Error("Selecteer eerst minstens één middel");
  if (input.catalog.length === 0) {
    throw new Error("Geen bronnen beschikbaar: rond eerst SWOT, 5C en Porter af.");
  }

  const shortKeys = new Map<string, VrioCatalogEntry>();
  input.catalog.forEach((e, i) => shortKeys.set(`S${i + 1}`, e));

  const sources = [...shortKeys]
    .map(([sk, e]) => `[${sk}] ${e.label}\n${e.text}`)
    .join("\n\n");

  const resourceList = input.resources
    .map(
      (r, i) =>
        `${i + 1}. id=${r.id} · ${r.title}${r.kind === "competence" ? " (competentie)" : ""}\n${r.description || "(geen beschrijving)"}${r.market_context ? `\nContext: ${r.market_context}` : ""}`,
    )
    .join("\n\n");

  const criteriaText = VRIO_CRITERIA.map((c) => {
    const m = VRIO_CRITERION_META[c];
    return `- ${c} (${m.letter} · ${m.label}): ${m.question} Onderbouwing uit: ${m.evidenceHint}.`;
  }).join("\n");

  const openai = new OpenAI({ apiKey });
  const completion = await openai.chat.completions.create({
    model: resolveModel(),
    temperature: 0.1,
    max_tokens: 6000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Je bereidt een VRIO-toetsing voor bij VICE over klant ${input.tenantName}.
Je toetst BESTAANDE middelen en competenties aan bestaande bronnen [S#]. Je doet geen nieuw marktonderzoek
en verzint geen bedrijfsfeiten, concurrenten of concurrentievoordelen.

Criteria:
${criteriaText}

Regels:
- Antwoord per criterium met "yes", "no" of "unknown".
- "unknown" is verplicht wanneer het dossier onvoldoende bewijs bevat. "unknown" is NOOIT hetzelfde als "no".
- Bij imitability betekent "yes": moeilijk te imiteren.
- Dat iets in de SWOT staat, bewijst niet dat het zeldzaam of moeilijk imiteerbaar is.
- Commerciële claims ("uniek", "de beste") zijn claims, geen bewijs: dan "unknown".
- Zeldzaamheid vraagt vergelijkende informatie over concurrenten; ontbreekt die, dan "unknown".
- Motiveer elk antwoord kort en verwijs naar de gebruikte bronnen [S#].
- evidence_level: "provided" (aangeleverd document/gesprek), "observed" (afgeleid uit analyses) of "hypothesis".
- Geef bij "unknown" of zwak bewijs een gerichte open_question en benoem missing_evidence.
- Je bepaalt GEEN eindclassificatie; dat doet de applicatie.
Nederlands, zakelijk, JSON-only.`,
      },
      {
        role: "user",
        content: [
          "# Bronnen",
          sources,
          "# Middelen en competenties",
          resourceList,
          `JSON-vorm:
{"resources":[{"resource_id":"<id>","criteria":[{"criterion":"value|rarity|imitability|organization","answer":"yes|no|unknown","motivation":"","evidence_level":"provided|observed|hypothesis","open_question":"","missing_evidence":"","refs":["S1"]}]}]}`,
          "Geef voor elk middel alle vier de criteria.",
        ].join("\n\n"),
      },
    ],
  });

  const text = completion.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("Leeg AI-antwoord");

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("AI-antwoord is geen geldige JSON");
  }

  const allowedIds = new Set(input.resources.map((r) => r.id));
  const rows = Array.isArray(json.resources) ? json.resources : [];
  const result: VrioAiResource[] = [];

  for (const row of rows) {
    const r = row as { resource_id?: unknown; criteria?: unknown };
    const resourceId = str(r.resource_id, 100);
    if (!allowedIds.has(resourceId)) continue;

    const seen = new Set<VrioCriterion>();
    const criteria: VrioAiCriterion[] = [];
    for (const c of Array.isArray(r.criteria) ? r.criteria : []) {
      const row2 = c as Record<string, unknown>;
      const criterion = str(row2.criterion, 30) as VrioCriterion;
      if (!VRIO_CRITERIA.includes(criterion) || seen.has(criterion)) continue;
      seen.add(criterion);

      const proposed = str(row2.answer, 20) as VrioAnswer;
      let answer: VrioAnswer = ANSWERS.includes(proposed) ? proposed : "unknown";

      const refs: VrioAiCriterion["refs"] = [];
      for (const sk of Array.isArray(row2.refs) ? row2.refs : []) {
        const entry = shortKeys.get(str(sk, 20));
        if (!entry) continue;
        if (!refs.some((x) => x.ref_type === entry.ref_type && x.ref_id === entry.ref_id)) {
          refs.push({
            ref_type: entry.ref_type,
            ref_id: entry.ref_id,
            label: entry.label,
            excerpt: entry.text.slice(0, 600),
          });
        }
      }

      const motivation = str(row2.motivation, 4000);
      // Zonder geldige bron of motivatie blijft het antwoord expliciet onbekend.
      if (refs.length === 0 || motivation.length < 10) answer = "unknown";

      // Zeldzaamheid vraagt vergelijkende informatie uit Porter of het dossier.
      if (
        criterion === "rarity" &&
        answer === "yes" &&
        !refs.some((x) => x.ref_type.startsWith("porter") || x.ref_type === "meeting" || x.ref_type === "pestel_input")
      ) {
        answer = "unknown";
      }

      const proposedEvidence = str(row2.evidence_level, 20) as VrioEvidenceLevel;
      const evidence: VrioEvidenceLevel =
        answer === "unknown" ? "hypothesis"
        : EVIDENCE.includes(proposedEvidence) ? proposedEvidence
        : "hypothesis";

      const meta = VRIO_CRITERION_META[criterion];
      criteria.push({
        criterion,
        answer,
        motivation:
          motivation ||
          "Het dossier bevat hierover onvoldoende informatie; dit is bewust als onbekend bewaard.",
        evidence_level: evidence,
        open_question: str(row2.open_question, 1000) || (answer === "unknown" ? meta.gapQuestion : ""),
        missing_evidence: str(row2.missing_evidence, 1000),
        refs,
      });
    }

    if (criteria.length > 0) result.push({ resource_id: resourceId, criteria });
  }

  if (result.length === 0) throw new Error("De AI leverde geen bruikbare voorstellen op");
  return result;
}
