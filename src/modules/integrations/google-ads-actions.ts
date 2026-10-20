"use server";

import { googleAdsPublicStatus } from "@/lib/integrations/google-ads";
import { requirePlatformAdminMfa, requireSession } from "@/lib/auth/session";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

export async function getGoogleAdsStatusAction(): Promise<
  ActionResult<ReturnType<typeof googleAdsPublicStatus>>
> {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);
  return { ok: true, data: googleAdsPublicStatus() };
}
