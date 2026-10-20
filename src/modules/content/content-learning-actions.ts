"use server";

import { revalidatePath } from "next/cache";
import {
  CONTENT_LEARNING_MIGRATION,
  type ContentLearningEvent,
} from "@/lib/content/content-learning-types";
import { requirePlatformAdminMfa, requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const MISSING =
  /content_learning|insert_content_learning|list_content_learning|dismiss_content_learning|get_content_learning_prompt|schema cache|does not exist|Could not find the function/i;

function migration(message: string) {
  return MISSING.test(message) ? CONTENT_LEARNING_MIGRATION : message;
}

function parseEvents(raw: unknown): ContentLearningEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      if (!row.id) return null;
      return {
        id: String(row.id),
        contentKind: row.contentKind === "social" ? "social" : "blog",
        conceptId: String(row.conceptId ?? ""),
        triggerKind: row.triggerKind === "publish" ? "publish" : "save",
        learningText: String(row.learningText ?? ""),
        learningTags: Array.isArray(row.learningTags)
          ? row.learningTags.map(String).filter(Boolean)
          : [],
        diffSummary: String(row.diffSummary ?? ""),
        status: row.status === "dismissed" ? "dismissed" : "active",
        createdAt: String(row.createdAt ?? ""),
      } satisfies ContentLearningEvent;
    })
    .filter((item): item is ContentLearningEvent => Boolean(item));
}

export async function loadContentLearningsAction(
  tenantId: string,
  options?: { limit?: number; includeDismissed?: boolean },
): Promise<ActionResult<ContentLearningEvent[]>> {
  try {
    const session = await requireSession();
    await requirePlatformAdminMfa(session);
    const supabase = await createClient();
    const result = await supabase.schema("app").rpc("list_content_learnings", {
      p_tenant_id: tenantId,
      p_limit: options?.limit ?? 50,
      p_include_dismissed: options?.includeDismissed ?? false,
    });
    if (result.error) return { ok: false, error: migration(result.error.message) };
    return { ok: true, data: parseEvents(result.data) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Learnings laden mislukt",
    };
  }
}

export async function dismissContentLearningAction(
  tenantId: string,
  eventId: string,
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    await requirePlatformAdminMfa(session);
    const supabase = await createClient();
    const result = await supabase.schema("app").rpc("dismiss_content_learning", {
      p_event_id: eventId,
    });
    if (result.error) return { ok: false, error: migration(result.error.message) };
    revalidatePath(`/klanten/${tenantId}/strategie/brand`);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Verbergen mislukt",
    };
  }
}
