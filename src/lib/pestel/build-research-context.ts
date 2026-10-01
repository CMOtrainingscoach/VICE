import { formatTimelineNotesForAnalysis } from "@/lib/meetings/timeline-notes";
import type { PestelVersion } from "@/lib/pestel/types";

export type ResearchMeetingContext = {
  id: string;
  title: string;
  review_status: string;
  summary_text: string | null;
  full_text_excerpt: string;
  notes_formatted: string;
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
): PestelResearchContext {
  const warnings: string[] = [];
  const approved = meetings.filter((m) => m.review_status === "approved");
  const pool = approved.length > 0 ? approved : meetings;

  if (approved.length === 0 && meetings.length > 0) {
    warnings.push(
      "Geen goedgekeurde transcripts — AI gebruikt beschikbare concept-transcripts (beperkte betrouwbaarheid).",
    );
  }
  if (meetings.length === 0) {
    warnings.push("Geen meeting-transcripts — AI vertrouwt op klantprofiel en publieke bronnen.");
  }

  const mapped: ResearchMeetingContext[] = pool.map((m) => ({
    id: m.id,
    title: m.title?.trim() || new Date(m.created_at).toLocaleString("nl-BE"),
    review_status: m.review_status,
    summary_text: m.summary_text,
    full_text_excerpt: (m.full_text ?? "").slice(0, 12_000),
    notes_formatted: formatTimelineNotesForAnalysis(m.notes),
  }));

  return {
    tenant: {
      name: tenant.name,
      website: tenant.website,
      audit_goal: tenant.audit_goal,
      vat_number: tenant.vat_number,
    },
    scope,
    meetings: mapped,
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
    `Markt/sector: ${ctx.scope.market_sector}`,
    `Regio's: ${ctx.scope.geo_markets.join(", ")}`,
    `Horizon: ${ctx.scope.time_horizon}`,
    `Aanbod/doelgroep: ${ctx.scope.offering_audience}`,
    `Onderzoeksvraag: ${ctx.scope.research_question || "—"}`,
    "",
  ];

  if (ctx.warnings.length) {
    lines.push("# Waarschuwingen", ...ctx.warnings.map((w) => `- ${w}`), "");
  }

  lines.push("# Meetings (alleen onderstaande IDs gebruiken voor meeting-bronnen)");
  for (const m of ctx.meetings) {
    lines.push(
      `## Meeting ${m.id}`,
      `Titel: ${m.title}`,
      `Review: ${m.review_status}`,
      m.summary_text ? `Samenvatting: ${m.summary_text}` : "",
      m.notes_formatted ? `Notities:\n${m.notes_formatted}` : "",
      "Transcript (excerpt):",
      m.full_text_excerpt || "(leeg)",
      "",
    );
  }

  return lines.filter(Boolean).join("\n");
}
