"use server";

import { buildGoogleAdsUiStatus, type GoogleAdsPublicStatus } from "@/lib/integrations/google-ads";
import {
  PLATFORM_GOOGLE_ADS_PROVIDER,
  parsePlatformGoogleAdsPublic,
} from "@/lib/integrations/platform-google-ads";
import { requirePlatformAdminMfa, requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PLATFORM_GOOGLE_ADS_MIGRATION } from "@/modules/integrations/platform-google-ads-actions";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

export async function getGoogleAdsStatusAction(): Promise<ActionResult<GoogleAdsPublicStatus>> {
  try {
    const session = await requireSession();
    await requirePlatformAdminMfa(session);
    const supabase = await createClient();
    const result = await supabase.schema("app").rpc("get_platform_integration_public", {
      p_provider: PLATFORM_GOOGLE_ADS_PROVIDER,
    });
    if (result.error) {
      const missing = /platform_integrations|get_platform_integration/i.test(result.error.message);
      if (missing) return { ok: true, data: buildGoogleAdsUiStatus(null) };
      return { ok: false, error: result.error.message };
    }
    return {
      ok: true,
      data: buildGoogleAdsUiStatus(parsePlatformGoogleAdsPublic(result.data)),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : PLATFORM_GOOGLE_ADS_MIGRATION,
    };
  }
}
