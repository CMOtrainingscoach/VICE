"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdminMfa, requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  fixtureProspectDetail,
  fixtureProspectRows,
  fixtureRunDetail,
  fixtureRunSummaries,
  leadgenFixturesEnabled,
} from "@/lib/leadgen/fixtures";
import type {
  LeadgenContactStatus,
  LeadgenProspectDetail,
  LeadgenProspectRow,
  LeadgenRunDetail,
  LeadgenRunSummary,
} from "@/lib/leadgen/types";
import { LEADGEN_MIGRATION } from "@/lib/leadgen/types";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const MISSING =
  /list_leadgen|get_leadgen|create_leadgen|rename_leadgen|soft_delete_leadgen|cancel_leadgen|update_leadgen|upsert_leadgen|schema cache|does not exist/i;

function migrationError(message: string): string {
  return MISSING.test(message) ? LEADGEN_MIGRATION : message;
}

async function authed() {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);
  return createClient();
}

function mapRunSummary(raw: unknown): LeadgenRunSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (!row.id) return null;
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    locationLabel: String(row.locationLabel ?? row.location_label ?? ""),
    radiusKm: Number(row.radiusKm ?? row.radius_km ?? 0),
    status: String(row.status ?? "queued") as LeadgenRunSummary["status"],
    resultCount: Number(row.resultCount ?? row.result_count ?? 0),
    createdAt: String(row.createdAt ?? row.created_at ?? ""),
    updatedAt: String(row.updatedAt ?? row.updated_at ?? ""),
    completedAt: row.completedAt ? String(row.completedAt) : row.completed_at ? String(row.completed_at) : null,
  };
}

function mapRunDetail(raw: unknown): LeadgenRunDetail | null {
  const summary = mapRunSummary(raw);
  if (!summary || !raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const config = (row.config as Record<string, unknown>) ?? {};
  const progress = (row.progress as Record<string, unknown>) ?? {};
  return {
    ...summary,
    errorMessage: String(row.errorMessage ?? row.error_message ?? "") || null,
    config: {
      locationLabel: String(config.locationLabel ?? summary.locationLabel),
      placeId: config.placeId ? String(config.placeId) : null,
      lat: Number(config.lat ?? 0),
      lng: Number(config.lng ?? 0),
      radiusKm: Number(config.radiusKm ?? summary.radiusKm),
      assignmentText: String(config.assignmentText ?? ""),
      criteria: (config.criteria as LeadgenRunDetail["config"]["criteria"]) ?? { maxResults: 30, signals: [] },
      sources: Array.isArray(config.sources) ? config.sources.map(String) : ["public_internet"],
      interpretation: config.interpretation as LeadgenRunDetail["config"]["interpretation"],
    },
    progress: {
      phase: String(progress.phase ?? ""),
      message: String(progress.message ?? ""),
      discovered: progress.discovered != null ? Number(progress.discovered) : undefined,
      assessed: progress.assessed != null ? Number(progress.assessed) : undefined,
      qualified: progress.qualified != null ? Number(progress.qualified) : undefined,
      warnings: Array.isArray(progress.warnings) ? progress.warnings.map(String) : undefined,
    },
  };
}

function mapProspectRow(raw: unknown): LeadgenProspectRow | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  return {
    id: String(row.id ?? ""),
    runProspectId: String(row.runProspectId ?? ""),
    displayName: String(row.displayName ?? ""),
    websiteUrl: row.websiteUrl ? String(row.websiteUrl) : null,
    websiteHost: row.websiteHost ? String(row.websiteHost) : null,
    municipality: row.municipality ? String(row.municipality) : null,
    distanceKm: row.distanceKm != null ? Number(row.distanceKm) : null,
    geoEligible: Boolean(row.geoEligible),
    geoVerified: Boolean(row.geoVerified),
    email: row.email ? String(row.email) : null,
    phone: row.phone ? String(row.phone) : null,
    contactPageUrl: row.contactPageUrl ? String(row.contactPageUrl) : null,
    contactStatus: String(row.contactStatus ?? "to_contact") as LeadgenContactStatus,
    sourceCount: Number(row.sourceCount ?? 0),
    assessedAt: row.assessedAt ? String(row.assessedAt) : null,
  };
}

function revalidateLeadgen(tenantId: string) {
  revalidatePath(`/klanten/${tenantId}/content/leadgen`);
}

export async function listLeadgenRunsAction(tenantId: string): Promise<ActionResult<LeadgenRunSummary[]>> {
  if (leadgenFixturesEnabled()) {
    return { ok: true, data: fixtureRunSummaries() };
  }
  const supabase = await authed();
  const { data, error } = await supabase.schema("app").rpc("list_leadgen_runs", { p_tenant_id: tenantId });
  if (error) return { ok: false, error: migrationError(error.message) };
  const rows = Array.isArray(data) ? data : [];
  return {
    ok: true,
    data: rows.map(mapRunSummary).filter((r): r is LeadgenRunSummary => r !== null),
  };
}

export async function getLeadgenRunAction(runId: string): Promise<ActionResult<LeadgenRunDetail | null>> {
  if (leadgenFixturesEnabled()) {
    return { ok: true, data: fixtureRunDetail(runId) };
  }
  const supabase = await authed();
  const { data, error } = await supabase.schema("app").rpc("get_leadgen_run", { p_run_id: runId });
  if (error) return { ok: false, error: migrationError(error.message) };
  if (!data) return { ok: true, data: null };
  return { ok: true, data: mapRunDetail(data) };
}

export async function createLeadgenRunAction(
  tenantId: string,
  payload: Record<string, unknown>,
): Promise<ActionResult<LeadgenRunDetail>> {
  if (leadgenFixturesEnabled()) {
    const detail = fixtureRunDetail(fixtureRunSummaries()[0].id);
    if (!detail) return { ok: false, error: "Fixture ontbreekt" };
    return { ok: true, data: { ...detail, isFixture: true } };
  }
  const supabase = await authed();
  const { data, error } = await supabase.schema("app").rpc("create_leadgen_run", {
    p_tenant_id: tenantId,
    p_payload: payload,
  });
  if (error || !data) return { ok: false, error: migrationError(error?.message ?? "Run aanmaken mislukt") };
  const mapped = mapRunDetail(data);
  if (!mapped) return { ok: false, error: "Run aanmaken mislukt" };

  void triggerLeadgenWorker(mapped.id);
  revalidateLeadgen(tenantId);
  return { ok: true, data: mapped };
}

async function triggerLeadgenWorker(runId: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return;
  try {
    await fetch(`${base}/api/cron/leadgen?runId=${encodeURIComponent(runId)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
    });
  } catch {
    // worker may be picked up by cron
  }
}

export async function renameLeadgenRunAction(runId: string, name: string): Promise<ActionResult<LeadgenRunDetail>> {
  if (leadgenFixturesEnabled()) {
    const detail = fixtureRunDetail(runId);
    if (!detail) return { ok: false, error: "Niet gevonden" };
    return { ok: true, data: { ...detail, name } };
  }
  const supabase = await authed();
  const { data, error } = await supabase.schema("app").rpc("rename_leadgen_run", { p_run_id: runId, p_name: name });
  if (error || !data) return { ok: false, error: migrationError(error?.message ?? "Hernoemen mislukt") };
  const mapped = mapRunDetail(data);
  if (!mapped) return { ok: false, error: "Hernoemen mislukt" };
  return { ok: true, data: mapped };
}

export async function deleteLeadgenRunAction(tenantId: string, runId: string): Promise<ActionResult> {
  if (leadgenFixturesEnabled()) return { ok: true };
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("soft_delete_leadgen_run", { p_run_id: runId });
  if (error) return { ok: false, error: migrationError(error.message) };
  revalidateLeadgen(tenantId);
  return { ok: true };
}

export async function cancelLeadgenRunAction(runId: string): Promise<ActionResult<LeadgenRunDetail>> {
  if (leadgenFixturesEnabled()) {
    const detail = fixtureRunDetail(runId);
    if (!detail) return { ok: false, error: "Niet gevonden" };
    return { ok: true, data: { ...detail, status: "cancelled" } };
  }
  const supabase = await authed();
  const { data, error } = await supabase.schema("app").rpc("cancel_leadgen_run", { p_run_id: runId });
  if (error || !data) return { ok: false, error: migrationError(error?.message ?? "Annuleren mislukt") };
  const mapped = mapRunDetail(data);
  if (!mapped) return { ok: false, error: "Annuleren mislukt" };
  return { ok: true, data: mapped };
}

export async function listLeadgenProspectsAction(
  runId: string,
  options?: { search?: string; status?: string },
): Promise<ActionResult<LeadgenProspectRow[]>> {
  if (leadgenFixturesEnabled()) {
    return { ok: true, data: fixtureProspectRows() };
  }
  const supabase = await authed();
  const { data, error } = await supabase.schema("app").rpc("list_leadgen_run_prospects", {
    p_run_id: runId,
    p_search: options?.search ?? "",
    p_status: options?.status ?? "",
    p_limit: 100,
    p_offset: 0,
  });
  if (error) return { ok: false, error: migrationError(error.message) };
  const rows = Array.isArray(data) ? data : [];
  return {
    ok: true,
    data: rows.map(mapProspectRow).filter((r): r is LeadgenProspectRow => r !== null),
  };
}

export async function updateLeadgenProspectStatusAction(
  prospectId: string,
  status: LeadgenContactStatus,
): Promise<ActionResult> {
  if (leadgenFixturesEnabled()) return { ok: true };
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("update_leadgen_prospect_status", {
    p_prospect_id: prospectId,
    p_status: status,
  });
  if (error) return { ok: false, error: migrationError(error.message) };
  return { ok: true };
}

export async function addLeadgenProspectNoteAction(prospectId: string, body: string): Promise<ActionResult> {
  if (leadgenFixturesEnabled()) return { ok: true };
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc("upsert_leadgen_prospect_note", {
    p_prospect_id: prospectId,
    p_body: body,
  });
  if (error) return { ok: false, error: migrationError(error.message) };
  return { ok: true };
}

export async function getLeadgenProspectDetailAction(
  runId: string,
  prospectId: string,
): Promise<ActionResult<LeadgenProspectDetail | null>> {
  if (leadgenFixturesEnabled()) {
    return { ok: true, data: fixtureProspectDetail(prospectId) };
  }
  const supabase = await authed();
  const { data, error } = await supabase.schema("app").rpc("get_leadgen_prospect_detail", {
    p_run_id: runId,
    p_prospect_id: prospectId,
  });
  if (error) return { ok: false, error: migrationError(error.message) };
  if (!data || typeof data !== "object") return { ok: true, data: null };
  const row = data as Record<string, unknown>;
  const prospect = row.prospect as Record<string, unknown>;
  const contacts = (row.contacts as Record<string, unknown>) ?? {};
  const base = mapProspectRow({ ...prospect, runProspectId: prospect.runProspectId });
  if (!base) return { ok: true, data: null };
  return {
    ok: true,
    data: {
      ...base,
      email: contacts.email ? String(contacts.email) : base.email,
      phone: contacts.phone ? String(contacts.phone) : base.phone,
      contactPageUrl: contacts.contactPageUrl ? String(contacts.contactPageUrl) : base.contactPageUrl,
      establishmentAddress: String(prospect.establishmentAddress ?? ""),
      assessmentSummary: String(prospect.assessmentSummary ?? ""),
      signals: Array.isArray(prospect.signals) ? (prospect.signals as LeadgenProspectDetail["signals"]) : [],
      limitations: Array.isArray(prospect.limitations) ? prospect.limitations.map(String) : [],
      sources: Array.isArray(row.sources) ? (row.sources as LeadgenProspectDetail["sources"]) : [],
      notes: Array.isArray(row.notes) ? (row.notes as LeadgenProspectDetail["notes"]) : [],
      statusHistory: Array.isArray(row.statusHistory)
        ? (row.statusHistory as LeadgenProspectDetail["statusHistory"])
        : [],
      researchRunAt: String(prospect.researchRunAt ?? ""),
    },
  };
}

export async function saveLeadgenTemplateAction(
  tenantId: string,
  payload: Record<string, unknown>,
): Promise<ActionResult> {
  if (leadgenFixturesEnabled()) return { ok: true };
  // Templates: optional follow-up RPC; MVP store via create run only
  void tenantId;
  void payload;
  return { ok: true, data: undefined };
}
