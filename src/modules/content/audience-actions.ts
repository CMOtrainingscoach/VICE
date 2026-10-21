"use server";

import {
  formatAudiencePromptBlock,
  type ContentAudienceContext,
} from "@/lib/content/audience-context";
import { BUYER_PERSONA_MIGRATION } from "@/lib/brand/buyer-persona-types";
import { requirePlatformAdminMfa, requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

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
      displayName: String(p.displayName ?? p.display_name ?? ""),
      roleTitle: String(p.roleTitle ?? p.role_title ?? ""),
      summary: String(p.summary ?? ""),
      goals: String(p.goals ?? ""),
      pains: String(p.pains ?? ""),
      triggers: String(p.triggers ?? ""),
      decisionCriteria: String(p.decisionCriteria ?? p.decision_criteria ?? ""),
      objections: String(p.objections ?? ""),
      approved: Boolean(p.approved),
    };
  });
  return { icp, personas };
}

export async function fetchAudiencePromptBlockForTenant(tenantId: string): Promise<string> {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);
  const supabase = await createClient();
  const { data, error } = await supabase.schema("app").rpc("get_content_audience_context", {
    p_tenant_id: tenantId,
  });
  if (error) {
    if (/get_content_audience_context|schema cache|does not exist/i.test(error.message)) {
      console.warn(BUYER_PERSONA_MIGRATION);
    }
    return "";
  }
  return formatAudiencePromptBlock(mapContext(data));
}
