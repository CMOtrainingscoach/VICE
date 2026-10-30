"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdminMfa, requireSession } from "@/lib/auth/session";
import { klingApiConfigured } from "@/lib/integrations/kling";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function authedAdmin() {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);
  return createClient();
}

export type PlatformKlingPublicStatus = {
  unitsBalance: number;
  apiKeyConfigured: boolean;
};

export async function loadPlatformKlingStatusAction(): Promise<ActionResult<PlatformKlingPublicStatus>> {
  const supabase = await authedAdmin();
  const loaded = await supabase.schema("app").rpc("get_platform_kling_credits_public");
  if (loaded.error) {
    return { ok: false, error: loaded.error.message };
  }
  const row = (loaded.data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    data: {
      unitsBalance: Number(row.unitsBalance) || 0,
      apiKeyConfigured: klingApiConfigured(),
    },
  };
}

export async function topUpPlatformKlingCreditsAction(
  units: number,
  note: string,
): Promise<ActionResult<PlatformKlingPublicStatus>> {
  if (!Number.isFinite(units) || units <= 0) {
    return { ok: false, error: "Voer een positief aantal units in." };
  }
  const supabase = await authedAdmin();
  const saved = await supabase.schema("app").rpc("top_up_platform_kling_credits", {
    p_delta: units,
    p_note: note.trim(),
  });
  if (saved.error || !saved.data) {
    return { ok: false, error: saved.error?.message ?? "Top-up mislukt" };
  }
  revalidatePath("/instellingen");
  return loadPlatformKlingStatusAction();
}
