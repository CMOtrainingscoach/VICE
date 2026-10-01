import OpenAI from "openai";
import {
  FIVE_C_META,
  FIVE_C_QUALIFIERS,
  type FiveCKey,
} from "@/lib/marketing-5c/constants";
import { entriesForC, type FiveCCatalogEntry } from "@/lib/marketing-5c/input-catalog";
import {
  validateAiCoherencePoint,
  validateAiContradiction,
  validateAiItem,
  type RawAiItem,
  type ValidatedCoherencePoint,
  type ValidatedContradiction,
  type ValidatedItem,
} from "@/lib/marketing-5c/validate-ai-output";

export type FiveCAiResult = {
  sections: Partial<Record<FiveCKey, { summary: string; items: ValidatedItem[] }>>;
  contradictions: ValidatedContradiction[];
  coherence: ValidatedCoherencePoint[];
  rejectedRefCount: number;
};

function resolveFiveCModel(): string {
  return (
    process.env.VICE_FIVE_C_MODEL?.trim()
    || process.env.VICE_PESTEL_RESEARCH_MODEL?.trim()
    || "gpt-4o"
  );
}

const C_RULES: Record<FiveCKey, string> = {
  company:
    "Aanbod en businessmodel, bestaande waardepropositie, doelen, middelen en competenties, capaciteit en beperkingen, bewijzen van onderscheid. Schat geen omzet, marge of capaciteit. Een claim zoals 'uitstekende service' blijft evidence_level 'provided' (aangeleverde claim), nooit 'observed'.",
  customers:
    "Beschreven klantgroepen, behoeften, koopcriteria, bezwaren, aankoopgedrag, afnemersmacht uit Porter. qualifier: single_statement | pattern | hypothesis. Afnemersmacht uit Porter bewijst geen specifieke behoefte. Maak geen persona's, ICP's of segmenten aan; onbekende behoeften worden input_needed met een validatievraag.",
  competitors:
    "Alleen hergebruik van Porter: bekende concurrenten, marktdefinitie, concurrentiedruk, onderbouwde verschillen. qualifier: direct | new_entrant | substitute. Een substituut blijft 'substitute'. Geen nieuwe concurrenten noemen.",
  collaborators:
    "Bestaande partners/leveranciers, bijdrage, afhankelijkheden, afspraken, ontbrekende info. qualifier: confirmed | mentioned | needed_type | market_supplier. Leveranciersinfo uit Porter is 'market_supplier', geen bestaande partner. Verzin geen partnerbedrijven.",
  context:
    "Alleen relevante goedgekeurde PESTEL-inzichten: behoud regio en tijdshorizon, toon de betekenis voor de klant, behoud hypotheses. Geen nieuwe trends, regelgeving of cijfers.",
};

function serializeSources(shortKeys: Map<string, FiveCCatalogEntry>): string {
  const lines: string[] = [];
  for (const [short, e] of shortKeys) {
    lines.push(
      `[${short}] ${e.label}${e.date ? ` (${e.date.slice(0, 10)})` : ""}${e.evidence_level ? ` · bewijs: ${e.evidence_level}` : ""}`,
      e.text,
      "",
    );
  }
  return lines.join("\n");
}

/**
 * Stelt de 5C samen uit bestaande bronnen. Bewust zonder tool-calls; deze workflow heeft
 * geen webzoek- of scrapingcapaciteit; alleen de meegegeven catalogus is beschikbaar.
 */
export async function composeFiveCWithAi(input: {
  tenantName: string;
  catalog: FiveCCatalogEntry[];
  cKeys: FiveCKey[];
  includeCrossCutting: boolean;
  keptTitles?: Partial<Record<FiveCKey, string[]>>;
}): Promise<FiveCAiResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY ontbreekt");
  if (input.catalog.length === 0) {
    throw new Error("Geen bronnen beschikbaar: voeg dossierinformatie toe of rond PESTEL/Porter af.");
  }

  const shortKeys = new Map<string, FiveCCatalogEntry>();
  input.catalog.forEach((e, i) => shortKeys.set(`S${i + 1}`, e));
  const shortOf = new Map([...shortKeys].map(([k, e]) => [e.key, k]));

  const allowedPerC = input.cKeys
    .map((k) => {
      const allowed = entriesForC(input.catalog, k)
        .map((e) => shortOf.get(e.key))
        .filter(Boolean);
      const qualifiers = FIVE_C_QUALIFIERS[k];
      const kept = input.keptTitles?.[k] ?? [];
      return [
        `## ${k} (${FIVE_C_META[k].label})`,
        C_RULES[k],
        `Toegestane bronnen: ${allowed.length ? allowed.join(", ") : "GEEN — gebruik enkel input_needed"}`,
        qualifiers ? `qualifier verplicht: ${Object.keys(qualifiers).join(" | ")}` : "",
        kept.length ? `Al beoordeeld of door adviseur ingevoerd (niet herhalen): ${kept.join("; ")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const openai = new OpenAI({ apiKey });
  const completion = await openai.chat.completions.create({
    model: resolveFiveCModel(),
    temperature: 0.1,
    max_tokens: 7000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Je stelt een 5C-analyse samen voor VICE (adviseur Hardwig) over klant ${input.tenantName}.
Je doet GEEN nieuw marktonderzoek en voegt GEEN feiten toe. Je ordent, verbindt en benoemt hiaten in uitsluitend de meegegeven bronnen [S#].

Inhoudstypes:
- adopted: rechtstreeks uit een bron; refs verplicht; behoud het oorspronkelijke bewijsniveau.
- derived: interpretatie van meerdere bestaande bevindingen; refs verplicht; voegt geen nieuw feit toe (geen cijfers, namen of claims die niet in de bronnen staan).
- input_needed: informatie die niet aantoonbaar in het dossier zit; geef gap_reason (waarvoor nodig) en precies één gerichte open_question.

Regels:
- Gebruik per onderdeel alleen de toegestane bronnen.
- Verwijder herhaling zonder betekenis te verliezen.
- Behoud onzekerheden en hypotheselabels.
- Benoem tegenstrijdigheden tussen bronnen; kies geen winnaar.
- Nederlands, zakelijk, kort. JSON-only.`,
      },
      {
        role: "user",
        content: [
          "# Bronnen",
          serializeSources(shortKeys),
          "# Onderdelen",
          allowedPerC,
          "",
          `JSON-vorm:
{"sections":{"<c_key>":{"summary":"1 zin","items":[{"title":"","finding":"","client_relevance":"","content_type":"adopted|derived|input_needed","evidence_level":"provided|observed|hypothesis","qualifier":"","refs":["S1"],"open_question":"","gap_reason":""}]}},
"contradictions":[{"title":"","description":"","source_a":"S1","source_b":"S2","affected_keys":["company"]}],
"coherence":[{"statement":"onderbouwde relatie tussen onderdelen","refs":["S1","S3"]}]}`,
          input.includeCrossCutting ?
            "Geef 2–5 coherence-punten (capaciteit vs verwachtingen, partners vs aanbod, onderscheid vs concurrenten, PESTEL-invloed, ambitie vs middelen) — alleen waar de bronnen dat toelaten."
          : "Laat contradictions en coherence leeg.",
          `Geef enkel de onderdelen: ${input.cKeys.join(", ")}. Max 5 items per onderdeel.`,
        ].join("\n"),
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

  const sectionsRaw = (json.sections ?? {}) as Record<string, unknown>;
  const result: FiveCAiResult = {
    sections: {},
    contradictions: [],
    coherence: [],
    rejectedRefCount: 0,
  };

  for (const key of input.cKeys) {
    const sec = (sectionsRaw[key] ?? {}) as { summary?: unknown; items?: unknown };
    const rawItems = Array.isArray(sec.items) ? (sec.items as RawAiItem[]) : [];
    const items: ValidatedItem[] = [];
    for (const raw of rawItems.slice(0, 5)) {
      const v = validateAiItem(raw, key, shortKeys);
      if (!v) continue;
      if (v.unsupported) result.rejectedRefCount += 1;
      items.push(v);
    }
    result.sections[key] = {
      summary: String(sec.summary ?? "").trim().slice(0, 500),
      items,
    };
  }

  if (input.includeCrossCutting) {
    const rawContra = Array.isArray(json.contradictions) ? json.contradictions : [];
    for (const c of rawContra.slice(0, 8)) {
      const v = validateAiContradiction(c as Record<string, unknown>, shortKeys);
      if (v) result.contradictions.push(v);
    }
    const rawCoh = Array.isArray(json.coherence) ? json.coherence : [];
    for (const p of rawCoh.slice(0, 6)) {
      const v = validateAiCoherencePoint(p as Record<string, unknown>, shortKeys);
      if (v) result.coherence.push(v);
    }
  }

  return result;
}
