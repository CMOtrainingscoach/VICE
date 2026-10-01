import { formatTimelineNotesForAnalysis } from "@/lib/meetings/timeline-notes";
import type { PestelResearchInput, PestelVersion } from "@/lib/pestel/types";

export type ResearchMeetingContext = {
  id: string;
  title: string;
  review_status: string;
  summary_text: string | null;
  full_text_excerpt: string;
  notes_formatted: string;
};

export type ResearchStaticInputContext = {
  id: string;
  kind: PestelResearchInput["kind"];
  label: string;
  url: string | null;
  excerpt: string;
};

export type PestelResearchContext = {
  tenant: {
    name: string;
    website: string | null;
    audit_goal: string;
    vat_number: string | null;
  };
  scope: PestelVersion;
  meetings: ResearchMeetingContext[];
  staticInputs: ResearchStaticInputContext[];
  explicitSourceSelection: boolean;
  warnings: string[];
};

type TenantRow = {
  name: string;
  website: string | null;
  audit_goal: string;
  vat_number: string | null;
};

type MeetingRow = {
  id: string;
  title: string | null;
  review_status: string;
  summary_text: string | null;
  full_text: string | null;
  notes: string | null;
  created_at: string;
};

export function buildResearchContextPayload(
  tenant: TenantRow,
  scope: PestelVersion,
  meetings: MeetingRow[],
  researchInputs: PestelResearchInput[],
): PestelResearchContext {
  const warnings: string[] = [];
  const explicitSourceSelection = researchInputs.length > 0;

  const meetingInputIds = new Set(
    researchInputs
      .filter((i) => i.kind === "meeting" && i.meeting_recording_id)
      .map((i) => i.meeting_recording_id as string),
  );

  let pool: MeetingRow[];
  if (explicitSourceSelection) {
    if (meetingInputIds.size === 0) {
      pool = [];
      warnings.push(
        "Geen meetings geselecteerd — interne meeting-context ontbreekt; extern onderzoek (publieke websites) blijft verplicht.",
      );
    } else {
      pool = meetings.filter((m) => meetingInputIds.has(m.id));
      const missing = [...meetingInputIds].filter(
        (id) => !pool.some((m) => m.id === id),
      );
      if (missing.length > 0) {
        warnings.push("Sommige geselecteerde meetings zijn niet meer beschikbaar.");
      }
    }
  } else {
    const approved = meetings.filter((m) => m.review_status === "approved");
    pool = approved.length > 0 ? approved : meetings;
    if (approved.length === 0 && meetings.length > 0) {
      warnings.push(
        "Geen bronnen geselecteerd — AI gebruikt alle beschikbare transcripts (voorkeur: goedgekeurd). Koppel expliciet bronnen onder «Bronnen voor AI» voor controle.",
      );
    }
    if (meetings.length === 0) {
      warnings.push(
        "Geen meeting-transcripts — AI gebruikt klantprofiel, gekoppelde bronnen (indien opgeslagen) en extern onderzoek.",
      );
    }
  }

  if (explicitSourceSelection) {
    warnings.push(
      "Gekoppelde bronnen beperken alleen welke meetings/documenten/notities als intern bewijs mogen; de AI moet nog steeds externe marktinformatie opzoeken en per inzicht met https-websites onderbouwen.",
    );
  }

  const mapped: ResearchMeetingContext[] = pool.map((m) => ({
    id: m.id,
    title: m.title?.trim() || new Date(m.created_at).toLocaleString("nl-BE"),
    review_status: m.review_status,
    summary_text: m.summary_text,
    full_text_excerpt: (m.full_text ?? "").slice(0, 12_000),
    notes_formatted: formatTimelineNotesForAnalysis(m.notes),
  }));

  const staticInputs: ResearchStaticInputContext[] = researchInputs
    .filter((i) => i.kind !== "meeting")
    .map((i, idx) => ({
      id: i.id ?? `draft-${idx}`,
      kind: i.kind,
      label: i.label.trim() || (i.kind === "website" ? i.url ?? "Website" : "Bron"),
      url: i.url?.trim() || null,
      excerpt: i.excerpt.slice(0, 12_000),
    }));

  if (explicitSourceSelection && staticInputs.length === 0 && mapped.length === 0) {
    warnings.push(
      "Geen interne bronnen gekoppeld — AI-onderzoek draait op klantprofiel + externe publieke bronnen.",
    );
  }

  return {
    tenant: {
      name: tenant.name,
      website: tenant.website,
      audit_goal: tenant.audit_goal,
      vat_number: tenant.vat_number,
    },
    scope,
    meetings: mapped,
    staticInputs,
    explicitSourceSelection,
    warnings,
  };
}

export function serializeResearchContextForPrompt(ctx: PestelResearchContext): string {
  const lines: string[] = [
    "# Klant (intern)",
    `Naam: ${ctx.tenant.name}`,
    `Website: ${ctx.tenant.website ?? "—"}`,
    `Auditdoel: ${ctx.tenant.audit_goal}`,
    "",
    "# PESTEL-afbakening",
    `Vakgebied/branche (externe markt): ${ctx.scope.market_sector}`,
    `Regio's: ${ctx.scope.geo_markets.join(", ")}`,
    `Horizon: ${ctx.scope.time_horizon}`,
    `Diensten & producten: ${ctx.scope.services_offerings}`,
    `Doelgroep / segment: ${ctx.scope.offering_audience}`,
    `Onderzoeksvraag: ${ctx.scope.research_question || "—"}`,
    "",
  ];

  if (ctx.warnings.length) {
    lines.push("# Waarschuwingen", ...ctx.warnings.map((w) => `- ${w}`), "");
  }

  lines.push(
    "# Interne / gekoppelde bronnen (aanvullend — geen vervanging van extern onderzoek)",
    "Gebruik deze waar relevant voor klantcontext. Meeting-citaties alleen met IDs hieronder.",
    "Document/notitie-feiten alleen uit onderstaande fragmenten.",
    "Gekoppelde website-URLs zijn nuttige startpunten; voor PESTEL blijf ook andere publieke https-bronnen raadplegen.",
    "",
  );

  lines.push("## Meetings (IDs voor meeting_recording_id in output)");
  if (ctx.meetings.length === 0) {
    lines.push("(geen meetings in context)", "");
  }
  for (const m of ctx.meetings) {
    lines.push(
      `### Meeting ${m.id}`,
      `Titel: ${m.title}`,
      `Review: ${m.review_status}`,
      m.summary_text ? `Samenvatting: ${m.summary_text}` : "",
      m.notes_formatted ? `Notities:\n${m.notes_formatted}` : "",
      "Transcript (excerpt):",
      m.full_text_excerpt || "(leeg)",
      "",
    );
  }

  if (ctx.staticInputs.length > 0) {
    lines.push("## Websites, documenten en interne notities");
    for (const s of ctx.staticInputs) {
      lines.push(
        `### Bron ${s.id} (${s.kind})`,
        `Label: ${s.label}`,
        s.url ? `URL: ${s.url}` : "",
        "Inhoud / fragment:",
        s.excerpt || "(leeg)",
        "",
      );
    }
    lines.push(
      "Interne website/document/notitie: gebruik source_type website of document met label, URL (indien van toepassing) en excerpt uit bovenstaande.",
      "",
    );
  }

  lines.push(
    "# Extern onderzoek",
    "Live webresultaten worden apart aangeleverd; gebruik alleen URLs uit dat blok voor website-feiten.",
    "",
  );

  return lines.filter(Boolean).join("\n");
}
