"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdminMfa, requireSession } from "@/lib/auth/session";
import { generateBuyerPersonasFromIcp } from "@/lib/brand/buyer-persona-ai";
import {
  BUYER_PERSONA_MIGRATION,
  type BuyerPersona,
  type BuyerPersonaPortrait,
} from "@/lib/brand/buyer-persona-types";
import { generatePersonaPortrait } from "@/lib/brand/persona-portrait-ai";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { TenantIcpProfileData } from "@/lib/strategy/icp-types";
import { loadTenantIcpAction } from "@/modules/strategy/icp-actions";
import { loadBlogBrandContextAction } from "@/modules/content/blog-actions";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const MISSING =
  /list_buyer_personas_for_icp|insert_ai_buyer_personas|upsert_buyer_persona|start_persona_portrait|complete_persona_portrait|get_content_audience_context|schema cache|does not exist/i;

function migrationError(message: string): string {
  return MISSING.test(message) ? BUYER_PERSONA_MIGRATION : message;
}

async function client() {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);
  return createClient();
}

function mapPortrait(raw: unknown, imageUrl?: string | null): BuyerPersonaPortrait | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = String(row.id ?? "");
  if (!id) return null;
  return {
    id,
    status: String(row.status ?? ""),
    storagePath: String(row.storagePath ?? row.storage_path ?? ""),
    visualPrompt: String(row.visualPrompt ?? row.visual_prompt ?? ""),
    errorMessage: String(row.errorMessage ?? row.error_message ?? ""),
    createdAt: String(row.createdAt ?? row.created_at ?? ""),
    imageUrl: imageUrl ?? null,
  };
}

function mapPersona(raw: unknown, portraitUrls: Map<string, string>): BuyerPersona | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = String(row.id ?? "");
  if (!id) return null;
  const portraitsRaw = Array.isArray(row.portraits) ? row.portraits : [];
  const portraits: BuyerPersonaPortrait[] = [];
  for (const item of portraitsRaw) {
    const p = mapPortrait(item);
    if (!p) continue;
    const url = p.storagePath ? portraitUrls.get(p.storagePath) ?? null : null;
    portraits.push({ ...p, imageUrl: url ?? null });
  }
  const evidenceLevel = String(row.evidenceLevel ?? row.evidence_level ?? "hypothesis");
  const roles = row.decisionRoles ?? row.decision_roles;
  return {
    id,
    displayName: String(row.displayName ?? row.display_name ?? ""),
    roleTitle: String(row.roleTitle ?? row.role_title ?? ""),
    summary: String(row.summary ?? ""),
    decisionRoles: Array.isArray(roles) ? roles.map(String) : [],
    goals: String(row.goals ?? ""),
    pains: String(row.pains ?? ""),
    triggers: String(row.triggers ?? ""),
    decisionCriteria: String(row.decisionCriteria ?? row.decision_criteria ?? ""),
    objections: String(row.objections ?? ""),
    infoNeeded: String(row.infoNeeded ?? row.info_needed ?? ""),
    channels: String(row.channels ?? ""),
    assumptions: String(row.assumptions ?? ""),
    openQuestion: String(row.openQuestion ?? row.open_question ?? ""),
    evidenceLevel,
    active: row.active !== false,
    illustrationPrompt: String(row.illustrationPrompt ?? row.illustration_prompt ?? ""),
    selectedPortraitId: row.selectedPortraitId ? String(row.selectedPortraitId) : row.selected_portrait_id ? String(row.selected_portrait_id) : null,
    updatedAt: String(row.updatedAt ?? row.updated_at ?? ""),
    portraits,
    approved: evidenceLevel === "client",
  };
}

async function signedPortraitUrls(paths: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const admin = createAdminClient();
  await Promise.all(
    paths.map(async (path) => {
      if (!path) return;
      const signed = await admin.storage.from("persona-portraits").createSignedUrl(path, 60 * 60);
      if (signed.data?.signedUrl) map.set(path, signed.data.signedUrl);
    }),
  );
  return map;
}

async function mapPersonaList(raw: unknown, tenantId: string): Promise<BuyerPersona[]> {
  const rows = Array.isArray(raw) ? raw : [];
  const paths = rows.flatMap((row) => {
    const portraits = (row as { portraits?: unknown[] }).portraits;
    if (!Array.isArray(portraits)) return [];
    return portraits
      .map((p) => String((p as { storagePath?: string; storage_path?: string }).storagePath ?? (p as { storage_path?: string }).storage_path ?? ""))
      .filter(Boolean);
  });
  const urls = await signedPortraitUrls(paths);
  return rows.map((row) => mapPersona(row, urls)).filter((p): p is BuyerPersona => p !== null);
}

function revalidateBrand(tenantId: string) {
  revalidatePath(`/klanten/${tenantId}/strategie/brand`);
}

export async function listBuyerPersonasForIcpAction(
  tenantId: string,
  icpId: string,
): Promise<ActionResult<BuyerPersona[]>> {
  const supabase = await client();
  const { data, error } = await supabase.schema("app").rpc("list_buyer_personas_for_icp", {
    p_icp_id: icpId,
  });
  if (error) return { ok: false, error: migrationError(error.message) };
  const mapped = await mapPersonaList(data, tenantId);
  return { ok: true, data: mapped };
}

export async function generateBuyerPersonasAction(
  tenantId: string,
  tenantName: string,
  icpId: string,
  extraContext?: string,
): Promise<ActionResult<BuyerPersona[]>> {
  const icp = await loadTenantIcpAction(tenantId, icpId);
  if (!icp.ok) return { ok: false, error: icp.error };
  if (!icp.data) return { ok: false, error: "ICP niet gevonden." };

  const existing = await listBuyerPersonasForIcpAction(tenantId, icpId);
  try {
    const drafts = await generateBuyerPersonasFromIcp({
      tenantName,
      icp: icp.data.profile,
      extraContext,
      existingRoleTitles: existing.ok && existing.data ? existing.data.map((p) => p.roleTitle) : [],
    });
    const supabase = await client();
    const saved = await supabase.schema("app").rpc("insert_ai_buyer_personas_for_icp", {
      p_icp_id: icpId,
      p_personas: drafts,
    });
    if (saved.error) return { ok: false, error: migrationError(saved.error.message) };
    const mapped = await mapPersonaList(saved.data, tenantId);
    revalidateBrand(tenantId);
    return { ok: true, data: mapped };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Genereren mislukt" };
  }
}

export async function saveBuyerPersonaAction(
  tenantId: string,
  icpId: string,
  personaId: string | null,
  payload: Record<string, unknown>,
): Promise<ActionResult<BuyerPersona[]>> {
  const supabase = await client();
  const rpcPayload = {
    role_title: payload.roleTitle ?? payload.role_title,
    display_name: payload.displayName ?? payload.display_name,
    summary: payload.summary,
    decision_roles: payload.decisionRoles ?? payload.decision_roles,
    goals: payload.goals,
    pains: payload.pains,
    triggers: payload.triggers,
    decision_criteria: payload.decisionCriteria ?? payload.decision_criteria,
    objections: payload.objections,
    info_needed: payload.infoNeeded ?? payload.info_needed,
    channels: payload.channels,
    assumptions: payload.assumptions,
    open_question: payload.openQuestion ?? payload.open_question,
  };
  const saved = await supabase.schema("app").rpc("upsert_buyer_persona_for_icp", {
    p_icp_id: icpId,
    p_persona_id: personaId,
    p_payload: rpcPayload,
  });
  if (saved.error) return { ok: false, error: migrationError(saved.error.message) };
  const mapped = await mapPersonaList(saved.data, tenantId);
  revalidateBrand(tenantId);
  return { ok: true, data: mapped };
}

export async function approveBuyerPersonaAction(
  tenantId: string,
  personaId: string,
): Promise<ActionResult> {
  const supabase = await client();
  const { error } = await supabase.schema("app").rpc("approve_buyer_persona", { p_persona_id: personaId });
  if (error) return { ok: false, error: migrationError(error.message) };
  revalidateBrand(tenantId);
  return { ok: true };
}

export async function archiveBuyerPersonaAction(tenantId: string, personaId: string): Promise<ActionResult> {
  const supabase = await client();
  const { error } = await supabase.schema("app").rpc("archive_persona", { p_persona_id: personaId });
  if (error) return { ok: false, error: error.message };
  revalidateBrand(tenantId);
  return { ok: true };
}

export async function regeneratePersonaPortraitAction(
  tenantId: string,
  personaId: string,
  persona: { displayName: string; roleTitle: string; summary: string },
  customPrompt?: string,
): Promise<ActionResult<BuyerPersonaPortrait>> {
  const brand = await loadBlogBrandContextAction(tenantId);
  if (!brand.ok || !brand.data?.hasVisual) {
    return { ok: false, error: "Stel eerst een goedgekeurde beeldstijl in onder Brand → Beeldstijl." };
  }

  const supabase = await client();
  const started = await supabase.schema("app").rpc("start_persona_portrait", {
    p_persona_id: personaId,
    p_prompt: customPrompt?.trim() || null,
    p_limit: 24,
  });
  if (started.error) return { ok: false, error: migrationError(started.error.message) };
  const portraitId = String((started.data as { id?: string })?.id ?? "");
  if (!portraitId) return { ok: false, error: "Portret starten mislukt" };

  try {
    const image = await generatePersonaPortrait({
      brand: brand.data,
      displayName: persona.displayName,
      roleTitle: persona.roleTitle,
      summary: persona.summary,
      customPrompt,
    });

    const path = `${tenantId}/${personaId}/${portraitId}.png`;
    const admin = createAdminClient();
    const upload = await admin.storage.from("persona-portraits").upload(path, image.bytes, {
      contentType: image.mime,
      upsert: true,
    });
    if (upload.error) {
      await supabase.schema("app").rpc("fail_persona_portrait", {
        p_portrait_id: portraitId,
        p_error: upload.error.message,
      });
      return { ok: false, error: upload.error.message };
    }

    const complete = await supabase.schema("app").rpc("complete_persona_portrait", {
      p_portrait_id: portraitId,
      p_path: path,
      p_model: "image-provider",
    });
    if (complete.error) return { ok: false, error: migrationError(complete.error.message) };

    const signed = await admin.storage.from("persona-portraits").createSignedUrl(path, 60 * 60);
    revalidateBrand(tenantId);
    return {
      ok: true,
      data: {
        id: portraitId,
        status: "ready",
        storagePath: path,
        visualPrompt: customPrompt?.trim() || image.prompt.slice(0, 300),
        errorMessage: "",
        createdAt: new Date().toISOString(),
        imageUrl: signed.data?.signedUrl ?? null,
      },
    };
  } catch (error) {
    await supabase.schema("app").rpc("fail_persona_portrait", {
      p_portrait_id: portraitId,
      p_error: error instanceof Error ? error.message : "Mislukt",
    });
    return { ok: false, error: error instanceof Error ? error.message : "Portret genereren mislukt" };
  }
}
