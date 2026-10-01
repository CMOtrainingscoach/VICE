import OpenAI from "openai";
import {
  SWOT_QUADRANT_META,
  SWOT_QUADRANTS,
  type SwotQuadrant,
} from "@/lib/swot/constants";
import type { SwotCatalogEntry } from "@/lib/swot/input-catalog";

export type SwotAiItem = {
  statement: string;
  refs: { ref_type: string; ref_id: string | null; label: string; excerpt: string }[];
};

export type SwotAiResult = Record<SwotQuadrant, SwotAiItem[]>;

function resolveModel(): string {
  return process.env.VICE_SWOT_MODEL?.trim() || process.env.VICE_FIVE_C_MODEL?.trim() || "gpt-4o";
}

function serializeSources(catalog: SwotCatalogEntry[]): { map: Map<string, SwotCatalogEntry>; text: string } {
  const map = new Map<string, SwotCatalogEntry>();
  const lines: string[] = [];
  catalog.forEach((e, i) => {
    const sk = `S${i + 1}`;
    map.set(sk, e);
    lines.push(`[${sk}] ${e.label}`, e.text, "");
  });
  return { map, text: lines.join("\n") };
}

/** SWOT-aanzet uit bestaande auditdata — geen webtools. */
export async function generateSwotDraft(input: {
  tenantName: string;
  catalog: SwotCatalogEntry[];
  adjustmentNote?: string;
}): Promise<SwotAiResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY ontbreekt");
  if (input.catalog.length === 0) {
    throw new Error("Geen bronnen: rond eerst PESTEL, Porter en 5C af of voeg meetings toe.");
  }

  const { map, text: sources } = serializeSources(input.catalog);

  const openai = new OpenAI({ apiKey });
  const completion = await openai.chat.completions.create({
    model: resolveModel(),
    temperature: 0.15,
    max_tokens: 4500,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Je maakt een SWOT-concept voor VICE (adviseur) over klant ${input.tenantName}.
Gebruik ALLEEN bronnen [S#]. Geen nieuw marktonderzoek, geen verzonnen feiten of cijfers.
- Sterktes/Zwaktes: intern (bedrijf, capaciteit, klantbeeld uit 5C/meetings).
- Kansen/Bedreigingen: extern (PESTEL, Porter, 5C context/concurrenten).
Elke bullet: korte Nederlandse zin, concreet voor deze klant. 2–4 bullets per kwadrant.
Elke bullet heeft minstens één ref [S#] die de uitspraak ondersteunt.`,
      },
      {
        role: "user",
        content: [
          "# Bronnen",
          sources,
          input.adjustmentNote?.trim() ?
            `# Aanpassingsverzoek adviseur\n${input.adjustmentNote.trim()}`
          : "",
          `JSON: {"strength":[{"statement":"","refs":["S1"]}],"weakness":[],"opportunity":[],"threat":[]}`,
          `Kwadranten: ${SWOT_QUADRANTS.join(", ")} (${SWOT_QUADRANTS.map((q) => SWOT_QUADRANT_META[q].label).join(", ")})`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error("Leeg AI-antwoord");

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("AI-antwoord is geen geldige JSON");
  }

  const result = {} as SwotAiResult;
  for (const q of SWOT_QUADRANTS) {
    const rows = Array.isArray(json[q]) ? json[q] : [];
    const items: SwotAiItem[] = [];
    for (const row of rows.slice(0, 5)) {
      const r = row as { statement?: unknown; refs?: unknown };
      const statement = String(r.statement ?? "").trim().slice(0, 2000);
      if (statement.length < 3) continue;
      const refKeys = Array.isArray(r.refs) ? r.refs.map(String) : [];
      const refs: SwotAiItem["refs"] = [];
      for (const sk of refKeys) {
        const entry = map.get(sk.trim());
        if (!entry) continue;
        refs.push({
          ref_type: entry.ref_type,
          ref_id: entry.ref_id,
          label: entry.label,
          excerpt: entry.text.slice(0, 600),
        });
      }
      if (refs.length === 0) {
        const first = input.catalog[0];
        if (first) {
          refs.push({
            ref_type: first.ref_type,
            ref_id: first.ref_id,
            label: first.label,
            excerpt: first.text.slice(0, 600),
          });
        }
      }
      items.push({ statement, refs });
    }
    result[q] = items;
  }

  return result;
}
