"use server";

import { revalidatePath } from "next/cache";
import { syncOpenArtPublicMetadata } from "@/lib/integrations/openart";
import {
  PLATFORM_OPENART_MIGRATION,
  PLATFORM_OPENART_PROVIDER,
  parsePlatformOpenArtPublic,
  type PlatformOpenArtPublicStatus,
} from "@/lib/integrations/platform-openart";
import { requirePlatformAdminMfa, requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const MISSING =
  /platform_integrations|get_platform_integration|upsert_platform_integration|disconnect_platform_integration|schema cache|does not exist|Could not find the function/i;

function migration(message: string) {
  return MISSING.test(message) ? PLATFORM_OPENART_MIGRATION : message;
}

export async function getPlatformOpenArtStatusAction(): Promise<
  ActionResult<PlatformOpenArtPublicStatus>
> {
  try {
    const session = await requireSession();
    await requirePlatformAdminMfa(session);
    await syncOpenArtPublicMetadata();
    const supabase = await createClient();
    const result = await supabase.schema("app").rpc("get_platform_integration_public", {
      p_provider: PLATFORM_OPENART_PROVIDER,
    });
    if (result.error) return { ok: false, error: migration(result.error.message) };
    return { ok: true, data: parsePlatformOpenArtPublic(result.data) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "OpenArt-status laden mislukt",
    };
  }
}

export async function disconnectPlatformOpenArtAction(): Promise<ActionResult> {
  try {
    const session = await requireSession();
    await requirePlatformAdminMfa(session);
    const supabase = await createClient();
    const result = await supabase.schema("app").rpc("disconnect_platform_integration", {
      p_provider: PLATFORM_OPENART_PROVIDER,
    });
    if (result.error) return { ok: false, error: migration(result.error.message) };
    revalidatePath("/instellingen");
    revalidatePath("/klanten", "layout");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Ontkoppelen mislukt",
    };
  }
}

export async function topUpTenantVideoWalletAction(input: {
  tenantId: string;
  delta: number;
  note?: string;
}): Promise<ActionResult<{ creditsBalance: number }>> {
  try {
    const session = await requireSession();
    await requirePlatformAdminMfa(session);
    const supabase = await createClient();
    const saved = await supabase.schema("app").rpc("top_up_tenant_video_wallet", {
      p_tenant_id: input.tenantId,
      p_delta: input.delta,
      p_note: input.note ?? "",
    });
    if (saved.error) return { ok: false, error: migration(saved.error.message) };
    const row = (saved.data ?? {}) as Record<string, unknown>;
    revalidatePath(`/klanten/${input.tenantId}/content/video`);
    revalidatePath("/instellingen");
    return { ok: true, data: { creditsBalance: Number(row.creditsBalance) || 0 } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Tegoed bijladen mislukt",
    };
  }
}

export async function getTenantVideoWalletAction(
  tenantId: string,
): Promise<ActionResult<{ creditsBalance: number }>> {
  try {
    await requireSession();
    const supabase = await createClient();
    const loaded = await supabase.schema("app").rpc("get_tenant_video_wallet", {
      p_tenant_id: tenantId,
    });
    if (loaded.error) return { ok: false, error: migration(loaded.error.message) };
    const row = (loaded.data ?? {}) as Record<string, unknown>;
    return { ok: true, data: { creditsBalance: Number(row.creditsBalance) || 0 } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Saldo laden mislukt",
    };
  }
}
