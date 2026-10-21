import OpenAI from "openai";
import { modelSupportsCustomTemperature, resolveMeetingAnalysisModel } from "@/lib/openai/models";
import type { TenantIcpProfileData } from "@/lib/strategy/icp-types";
import type { BuyerPersonaDraft } from "@/lib/brand/buyer-persona-types";

function icpBlock(icp: TenantIcpProfileData): string {
  return [
    icp.headline ? `ICP: ${icp.headline}` : "",
    icp.summary,
    icp.offer ? `Aanbod: ${icp.offer}` : "",
    icp.activity ? `Activiteit: ${icp.activity}` : "",
    icp.region ? `Regio: ${icp.region}` : "",
    icp.mainProblem ? `Probleem: ${icp.mainProblem}` : "",
    icp.desiredOutcome ? `Gewenste uitkomst: ${icp.desiredOutcome}` : "",
    icp.positioning ? `Positionering: ${icp.positioning}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function pickString(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string") return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function pickRoles(row: Record<string, unknown>): string[] {
  const raw = row.decisionRoles ?? row.decision_roles ?? row.roles ?? row.tags;
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, 6);
  }
  if (typeof raw === "string" && raw.trim()) {
    return raw
      .split(/[,;|/]/)
      .map((part) => part.trim())
      .filter(Boolean)
      .slice(0, 6);
  }
  return [];
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function normalizePersona(raw: unknown): BuyerPersonaDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const roleTitle = pickString(row, "roleTitle", "role_title", "title", "functie", "rol");
  if (roleTitle.length < 2) return null;

  const displayName =
    pickString(row, "displayName", "display_name", "name", "naam") || roleTitle.split(/\s+/)[0] || roleTitle;

  return {
    displayName: clip(displayName, 80),
    roleTitle: clip(roleTitle, 200),
    summary: clip(pickString(row, "summary", "samenvatting", "bio", "beschrijving"), 800),
    decisionRoles: pickRoles(row),
    goals: clip(pickString(row, "goals", "doelen", "goal"), 800),
    pains: clip(pickString(row, "pains", "pijn", "uitdagingen", "challenges", "barriers"), 800),
    triggers: clip(pickString(row, "triggers", "trigger", "kooptrigger", "aanleiding"), 500),
    decisionCriteria: clip(
      pickString(row, "decisionCriteria", "decision_criteria", "besliscriteria", "criteria"),
      800,
    ),
    objections: clip(pickString(row, "objections", "bezwaren", "objection"), 800),
    infoNeeded: clip(pickString(row, "infoNeeded", "info_needed", "informatiebehoefte"), 800),
    channels: clip(pickString(row, "channels", "kanalen"), 400),
    assumptions: clip(pickString(row, "assumptions", "aannames"), 800),
    openQuestion: clip(pickString(row, "openQuestion", "open_question", "openVraag"), 400),
  };
}

function extractPersonaRows(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== "object") return [];
  const root = parsed as Record<string, unknown>;
  for (const key of ["personas", "buyerPersonas", "buyer_personas", "buyerPersonas", "data", "results"]) {
    const value = root[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

export async function generateBuyerPersonasFromIcp(input: {
  tenantName: string;
  icp: TenantIcpProfileData;
  extraContext?: string;
  existingRoleTitles?: string[];
}): Promise<BuyerPersonaDraft[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY ontbreekt.");

  const model = resolveMeetingAnalysisModel();
  const openai = new OpenAI({ apiKey });

  const completion = await openai.chat.completions.create({
    model,
    ...(modelSupportsCustomTemperature(model) ? { temperature: 0.45 } : {}),
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "Je maakt buyer persona's voor B2B-marketing in VICE.",
          "Elke persona is een fictieve maar realistische beslisser of beïnvloeder binnen het ICP — geen echte persoon, geen PII.",
          "Genereer 2–4 complementaire persona's (verschillende rollen, bv. zaakvoerder, marketing, finance).",
          "Baseer je op het ICP; extra context is optioneel.",
          "decisionRoles: array van korte strings, bv. [\"Beslisser\", \"Beïnvloeder\"].",
          "Verplicht JSON-object: { \"personas\": [ { \"displayName\", \"roleTitle\", \"summary\", \"decisionRoles\", \"goals\", \"pains\", \"triggers\", \"decisionCriteria\", \"objections\", \"infoNeeded\", \"channels\", \"assumptions\", \"openQuestion\" } ] }",
          "Alle velden zijn strings behalve decisionRoles (array). Geen null; gebruik \"\" als onbekend.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `Klant: ${input.tenantName}`,
          "--- ICP ---",
          icpBlock(input.icp),
          input.existingRoleTitles?.length
            ? `Bestaande rollen (niet dupliceren):\n${input.existingRoleTitles.map((r) => `- ${r}`).join("\n")}`
            : "",
          input.extraContext?.trim() ? `Extra context:\n${input.extraContext.trim()}` : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Geen persona-voorstel ontvangen.");

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("Persona-antwoord was geen geldige JSON. Probeer opnieuw.");
  }

  const personas = extractPersonaRows(json)
    .map(normalizePersona)
    .filter((item): item is BuyerPersonaDraft => item !== null);

  if (personas.length === 0) {
    throw new Error(
      "Het model gaf geen bruikbare persona's terug (ontbrekende functierol). Probeer opnieuw of voeg handmatig toe.",
    );
  }

  return personas.slice(0, 5);
}
