"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdminMfa, requireSession } from "@/lib/auth/session";
import { extractTenantIcpFromMarkdown } from "@/lib/strategy/icp-ai";
import {
  TENANT_ICP_MIGRATION,
  emptyTenantIcpProfile,
  type TenantIcpProfileData,
  type TenantIcpRecord,
  type TenantIcpStatus,
  type TenantIcpSummary,
} from "@/lib/strategy/icp-types";
import { createClient } from "@/lib/supabase/server";
import { loadStrategyDocumentAction, type ActionResult } from "@/modules/strategy/actions";

const MISSING =
  /list_tenant_icp_profiles|get_tenant_icp_profile|create_tenant_icp_profile|save_tenant_icp_profile|set_tenant_icp_primary|archive_tenant_icp_profile|schema cache|does not exist|Could not find the function/i;

function migrationError(message: string): string {
  return MISSING.test(message) ? TENANT_ICP_MIGRATION : message;
}

async function client() {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);
  return createClient();
}

function mapProfileData(raw: unknown): TenantIcpProfileData {
  const base = emptyTenantIcpProfile();
  if (!raw || typeof raw !== "object") return base;
  const row = raw as Record<string, unknown>;
  const list = (key: string): string[] => {
    const v = row[key];
    if (!Array.isArray(v)) return [];
    return v.map((item) => String(item ?? "").trim()).filter(Boolean);
  };
  return {
    ...base,
    headline: String(row.headline ?? ""),
    summary: String(row.summary ?? ""),
    offer: String(row.offer ?? ""),
    activity: String(row.activity ?? ""),
    region: String(row.region ?? ""),
    phase: String(row.phase ?? ""),
    teamSize: String(row.teamSize ?? ""),
    teamSizeNeedsValidation: Boolean(row.teamSizeNeedsValidation),
    extraCharacteristics: String(row.extraCharacteristics ?? ""),
    criteriaMust: list("criteriaMust"),
    criteriaPlus: list("criteriaPlus"),
    criteriaExclude: list("criteriaExclude"),
    mainProblem: String(row.mainProblem ?? ""),
    mainProblemSource: String(row.mainProblemSource ?? ""),
    desiredOutcome: String(row.desiredOutcome ?? ""),
    trigger: String(row.trigger ?? ""),
    triggerLabel: String(row.triggerLabel ?? ""),
    budget: String(row.budget ?? ""),
    capacity: String(row.capacity ?? ""),
    openQuestions: list("openQuestions"),
    positioning: String(row.positioning ?? ""),
    sourcesAndAssumptions: String(row.sourcesAndAssumptions ?? ""),
  };
}

function mapRecord(raw: unknown): TenantIcpRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  return {
    id: String(row.id ?? ""),
    tenantId: String(row.tenantId ?? row.tenant_id ?? ""),
    isPrimary: Boolean(row.isPrimary ?? row.is_primary),
    status: row.status === "approved" ? "approved" : "draft",
    versionNumber: Number(row.versionNumber ?? row.version_number ?? 1) || 1,
    profile: mapProfileData(row.profile),
    sourceDocumentSavedAt: row.sourceDocumentSavedAt
      ? String(row.sourceDocumentSavedAt)
      : row.source_document_saved_at
        ? String(row.source_document_saved_at)
        : null,
    aiGeneratedAt: row.aiGeneratedAt
      ? String(row.aiGeneratedAt)
      : row.ai_generated_at
        ? String(row.ai_generated_at)
        : null,
    updatedAt: String(row.updatedAt ?? row.updated_at ?? ""),
  };
}

function mapSummary(raw: unknown): TenantIcpSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = String(row.id ?? "");
  if (!id) return null;
  return {
    id,
    tenantId: String(row.tenantId ?? row.tenant_id ?? ""),
    isPrimary: Boolean(row.isPrimary ?? row.is_primary),
    status: row.status === "approved" ? "approved" : "draft",
    versionNumber: Number(row.versionNumber ?? row.version_number ?? 1) || 1,
    headline: String(row.headline ?? ""),
    updatedAt: String(row.updatedAt ?? row.updated_at ?? ""),
  };
}

function revalidateIcp(tenantId: string) {
  revalidatePath(`/klanten/${tenantId}/strategie`);
}

export async function listTenantIcpsAction(tenantId: string): Promise<ActionResult<TenantIcpSummary[]>> {
  const supabase = await client();
  const { data, error } = await supabase.schema("app").rpc("list_tenant_icp_profiles", {
    p_tenant_id: tenantId,
  });
  if (error) return { ok: false, error: migrationError(error.message) };
  const rows = Array.isArray(data) ? data : [];
  return {
    ok: true,
    data: rows.map(mapSummary).filter((row): row is TenantIcpSummary => row !== null),
  };
}

export async function loadTenantIcpAction(
  tenantId: string,
  icpId: string,
): Promise<ActionResult<TenantIcpRecord | null>> {
  const supabase = await client();
  const { data, error } = await supabase.schema("app").rpc("get_tenant_icp_profile", {
    p_icp_id: icpId,
  });
  if (error) return { ok: false, error: migrationError(error.message) };
  if (!data) return { ok: true, data: null };
  const mapped = mapRecord(data);
  if (mapped && mapped.tenantId !== tenantId) {
    return { ok: false, error: "ICP hoort niet bij deze klant." };
  }
  return { ok: true, data: mapped };
}

export async function saveTenantIcpAction(
  icpId: string,
  profile: TenantIcpProfileData,
  options?: {
    status?: TenantIcpStatus;
    expectedUpdatedAt?: string | null;
    bumpVersion?: boolean;
  },
): Promise<ActionResult<TenantIcpRecord>> {
  const supabase = await client();
  const saved = await supabase.schema("app").rpc("save_tenant_icp_profile", {
    p_icp_id: icpId,
    p_profile: profile,
    p_status: options?.status ?? null,
    p_bump_version: Boolean(options?.bumpVersion),
    p_expected: options?.expectedUpdatedAt ?? null,
  });
  if (saved.error) return { ok: false, error: migrationError(saved.error.message) };
  const mapped = mapRecord(saved.data);
  if (!mapped) return { ok: false, error: "ICP opslaan mislukt" };
  revalidateIcp(mapped.tenantId);
  return { ok: true, data: mapped };
}

export async function createEmptyTenantIcpAction(tenantId: string): Promise<ActionResult<TenantIcpRecord>> {
  const supabase = await client();
  const saved = await supabase.schema("app").rpc("create_tenant_icp_profile", {
    p_tenant_id: tenantId,
    p_profile: emptyTenantIcpProfile(),
    p_is_primary: false,
    p_source_document_saved_at: null,
    p_ai_generated_at: null,
  });
  if (saved.error) return { ok: false, error: migrationError(saved.error.message) };
  const mapped = mapRecord(saved.data);
  if (!mapped) return { ok: false, error: "ICP aanmaken mislukt" };
  revalidateIcp(tenantId);
  return { ok: true, data: mapped };
}

export async function generateTenantIcpFromDocumentAction(
  tenantId: string,
  tenantName: string,
  options?: { icpId?: string | null; makePrimary?: boolean },
): Promise<ActionResult<TenantIcpRecord>> {
  const doc = await loadStrategyDocumentAction(tenantId);
  if (!doc.ok) return { ok: false, error: doc.error };
  if (!doc.data?.markdown?.trim()) {
    return {
      ok: false,
      error: "Upload en bewaar eerst het strategische markdownbestand op het tabblad Document.",
    };
  }

  try {
    const existing = await listTenantIcpsAction(tenantId);
    const otherHeadlines =
      existing.ok && existing.data
        ? existing.data
            .filter((item) => item.id !== options?.icpId)
            .map((item) => item.headline)
            .filter(Boolean)
        : [];

    const profile = await extractTenantIcpFromMarkdown({
      tenantName,
      markdown: doc.data.markdown,
      otherIcpHeadlines: otherHeadlines,
    });

    const supabase = await client();

    if (options?.icpId) {
      const loaded = await loadTenantIcpAction(tenantId, options.icpId);
      if (!loaded.ok) return { ok: false, error: loaded.error };
      if (!loaded.data) return { ok: false, error: "ICP niet gevonden." };

      const saved = await supabase.schema("app").rpc("save_tenant_icp_profile", {
        p_icp_id: options.icpId,
        p_profile: profile,
        p_status: "draft",
        p_bump_version: true,
        p_expected: null,
      });
      if (saved.error) return { ok: false, error: migrationError(saved.error.message) };
      const mapped = mapRecord(saved.data);
      if (!mapped) return { ok: false, error: "ICP bijwerken mislukt" };
      revalidateIcp(tenantId);
      return { ok: true, data: mapped };
    }

    const saved = await supabase.schema("app").rpc("create_tenant_icp_profile", {
      p_tenant_id: tenantId,
      p_profile: profile,
      p_is_primary: Boolean(options?.makePrimary),
      p_source_document_saved_at: doc.data.savedAt,
      p_ai_generated_at: new Date().toISOString(),
    });
    if (saved.error) return { ok: false, error: migrationError(saved.error.message) };
    const mapped = mapRecord(saved.data);
    if (!mapped) return { ok: false, error: "ICP genereren mislukt" };
    revalidateIcp(tenantId);
    return { ok: true, data: mapped };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "ICP genereren mislukt" };
  }
}

export async function approveTenantIcpAction(
  tenantId: string,
  icpId: string,
  expectedUpdatedAt: string,
): Promise<ActionResult<TenantIcpRecord>> {
  const loaded = await loadTenantIcpAction(tenantId, icpId);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  if (!loaded.data) return { ok: false, error: "ICP niet gevonden." };
  if (!loaded.data.profile.headline.trim()) {
    return { ok: false, error: "Vul minstens een titel in voordat je goedkeurt." };
  }
  return saveTenantIcpAction(icpId, loaded.data.profile, {
    status: "approved",
    expectedUpdatedAt,
  });
}

export async function reopenTenantIcpAction(
  tenantId: string,
  icpId: string,
  expectedUpdatedAt: string,
): Promise<ActionResult<TenantIcpRecord>> {
  const loaded = await loadTenantIcpAction(tenantId, icpId);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  if (!loaded.data) return { ok: false, error: "ICP niet gevonden." };
  return saveTenantIcpAction(icpId, loaded.data.profile, {
    status: "draft",
    expectedUpdatedAt,
  });
}

export async function setPrimaryTenantIcpAction(
  tenantId: string,
  icpId: string,
): Promise<ActionResult<TenantIcpRecord>> {
  const supabase = await client();
  const saved = await supabase.schema("app").rpc("set_tenant_icp_primary", { p_icp_id: icpId });
  if (saved.error) return { ok: false, error: migrationError(saved.error.message) };
  const mapped = mapRecord(saved.data);
  if (!mapped || mapped.tenantId !== tenantId) {
    return { ok: false, error: "Primair ICP instellen mislukt" };
  }
  revalidateIcp(tenantId);
  return { ok: true, data: mapped };
}

export async function archiveTenantIcpAction(tenantId: string, icpId: string): Promise<ActionResult> {
  const supabase = await client();
  const loaded = await loadTenantIcpAction(tenantId, icpId);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { error } = await supabase.schema("app").rpc("archive_tenant_icp_profile", { p_icp_id: icpId });
  if (error) return { ok: false, error: migrationError(error.message) };
  revalidateIcp(tenantId);
  return { ok: true };
}
