"use server";

import { revalidatePath } from "next/cache";
import {
  PLATFORM_GOOGLE_ADS_PROVIDER,
  normalizeAdsCustomerId,
  parsePlatformGoogleAdsPublic,
  type PlatformGoogleAdsPublicStatus,
} from "@/lib/integrations/platform-google-ads";
import { requirePlatformAdminMfa, requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const MISSING =
  /platform_integrations|get_platform_integration|upsert_platform_integration|disconnect_platform_integration|schema cache|does not exist|Could not find the function/i;

export const PLATFORM_GOOGLE_ADS_MIGRATION =
  "Pas migratie 20260330135800_platform_google_ads.sql toe in de Supabase SQL-editor.";

function migration(message: string) {
  return MISSING.test(message) ? PLATFORM_GOOGLE_ADS_MIGRATION : message;
}

export async function getPlatformGoogleAdsStatusAction(): Promise<
  ActionResult<PlatformGoogleAdsPublicStatus>
> {
  try {
    const session = await requireSession();
    await requirePlatformAdminMfa(session);
    const supabase = await createClient();
    const result = await supabase.schema("app").rpc("get_platform_integration_public", {
      p_provider: PLATFORM_GOOGLE_ADS_PROVIDER,
    });
    if (result.error) return { ok: false, error: migration(result.error.message) };
    return { ok: true, data: parsePlatformGoogleAdsPublic(result.data) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Status laden mislukt",
    };
  }
}

export async function updatePlatformGoogleAdsAccountsAction(input: {
  customerId: string;
  loginCustomerId?: string;
}): Promise<ActionResult<PlatformGoogleAdsPublicStatus>> {
  try {
    const session = await requireSession();
    await requirePlatformAdminMfa(session);
    const customerId = normalizeAdsCustomerId(input.customerId);
    if (customerId.length !== 10) {
      return { ok: false, error: "Customer ID moet 10 cijfers zijn (Google Ads-account)." };
    }
    const loginCustomerId = input.loginCustomerId?.trim()
      ? normalizeAdsCustomerId(input.loginCustomerId)
      : "";
    if (loginCustomerId && loginCustomerId.length !== 10) {
      return { ok: false, error: "Login customer ID (MCC) moet 10 cijfers zijn." };
    }

    const supabase = await createClient();
    const result = await supabase.schema("app").rpc("update_platform_integration_metadata", {
      p_provider: PLATFORM_GOOGLE_ADS_PROVIDER,
      p_metadata: {
        customerId,
        ...(loginCustomerId ? { loginCustomerId } : { loginCustomerId: "" }),
      },
    });
    if (result.error) return { ok: false, error: migration(result.error.message) };
    revalidatePath("/instellingen");
    revalidatePath("/klanten", "layout");
    return { ok: true, data: parsePlatformGoogleAdsPublic(result.data) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Opslaan mislukt",
    };
  }
}

export async function disconnectPlatformGoogleAdsAction(): Promise<ActionResult> {
  try {
    const session = await requireSession();
    await requirePlatformAdminMfa(session);
    const supabase = await createClient();
    const result = await supabase.schema("app").rpc("disconnect_platform_integration", {
      p_provider: PLATFORM_GOOGLE_ADS_PROVIDER,
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
