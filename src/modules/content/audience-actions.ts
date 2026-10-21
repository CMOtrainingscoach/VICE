"use server";

import {
  formatAudiencePromptBlock,
  type ContentAudienceContext,
} from "@/lib/content/audience-context";
import { BUYER_PERSONA_MIGRATION, type ContentBuyerPersonaOption } from "@/lib/brand/buyer-persona-types";
import { requirePlatformAdminMfa, requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

function mapContext(raw: unknown): ContentAudienceContext | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const icpRaw = row.icp;
  const icp =
    icpRaw && typeof icpRaw === "object"
      ? {
          headline: String((icpRaw as Record<string, unknown>).headline ?? ""),
          summary: String((icpRaw as Record<string, unknown>).summary ?? ""),
          offer: String((icpRaw as Record<string, unknown>).offer ?? ""),
          positioning: String((icpRaw as Record<string, unknown>).positioning ?? ""),
        }
      : null;
  const personasRaw = Array.isArray(row.personas) ? row.personas : [];
  const personas = personasRaw.map((item) => {
    const p = item as Record<string, unknown>;
    return {
      id: p.id ? String(p.id) : undefined,
      displayName: String(p.displayName ?? p.display_name ?? ""),
      roleTitle: String(p.roleTitle ?? p.role_title ?? ""),
      summary: String(p.summary ?? ""),
      goals: String(p.goals ?? ""),
      pains: String(p.pains ?? ""),
      triggers: String(p.triggers ?? ""),
      decisionCriteria: String(p.decisionCriteria ?? p.decision_criteria ?? ""),
      objections: String(p.objections ?? ""),
      infoNeeded: String(p.infoNeeded ?? p.info_needed ?? ""),
      approved: Boolean(p.approved),
    };
  });
  return { icp, personas };
}

export async function listContentBuyerPersonasAction(
  tenantId: string,
): Promise<ActionResult<ContentBuyerPersonaOption[]>> {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);
  const supabase = await createClient();
  const { data, error } = await supabase.schema("app").rpc("list_tenant_buyer_personas_for_content", {
    p_tenant_id: tenantId,
  });
  if (error) {
    return {
      ok: false,
      error: /list_tenant_buyer_personas|schema cache|does not exist/i.test(error.message)
        ? BUYER_PERSONA_MIGRATION
        : error.message,
    };
  }
  const rows = Array.isArray(data) ? data : [];
  return {
    ok: true,
    data: rows
      .map((item) => {
        const row = item as Record<string, unknown>;
        const id = String(row.id ?? "");
        if (!id) return null;
        return {
          id,
          displayName: String(row.displayName ?? row.display_name ?? ""),
          roleTitle: String(row.roleTitle ?? row.role_title ?? ""),
          icpHeadline: String(row.icpHeadline ?? row.icp_headline ?? ""),
          approved: Boolean(row.approved),
        };
      })
      .filter((item): item is ContentBuyerPersonaOption => item !== null),
  };
}

export async function assertBuyerPersonaForGeneration(
  tenantId: string,
  buyerPersonaId: string | null,
): Promise<ActionResult> {
  const list = await listContentBuyerPersonasAction(tenantId);
  if (!list.ok) return { ok: false, error: list.error };
  if (list.data && list.data.length > 0 && !buyerPersonaId) {
    return {
      ok: false,
      error: "Kies een buyer persona. De AI schrijft voor die rol/doelgroep, niet over de persona zelf.",
    };
  }
  return { ok: true };
}

export async function fetchAudiencePromptBlockForTenant(
  tenantId: string,
  buyerPersonaId?: string | null,
): Promise<string> {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);
  const supabase = await createClient();
  const { data, error } = await supabase.schema("app").rpc("get_content_audience_context", {
    p_tenant_id: tenantId,
    p_persona_id: buyerPersonaId ?? null,
  });
  if (error) {
    if (/get_content_audience_context|schema cache|does not exist/i.test(error.message)) {
      console.warn(BUYER_PERSONA_MIGRATION);
    }
    return "";
  }
  return formatAudiencePromptBlock(mapContext(data));
}
