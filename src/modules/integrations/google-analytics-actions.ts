"use server";

import { revalidatePath } from "next/cache";
import {
  listGoogleAnalyticsProperties,
  parseGoogleAnalyticsPublic,
  type GoogleAnalyticsProperty,
  type GoogleAnalyticsPublicStatus,
} from "@/lib/integrations/google-analytics";
import { requirePlatformAdminMfa, requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  ensureTenantIntegrationAccessToken,
  integrationMigrationMessage,
} from "@/modules/integrations/tenant-integration-access";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function authed() {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);
  return createClient();
}

export async function getGoogleAnalyticsStatusAction(
  tenantId: string,
): Promise<ActionResult<GoogleAnalyticsPublicStatus>> {
  const supabase = await authed();
  const result = await supabase.schema("app").rpc("get_tenant_integration_public", {
    p_tenant_id: tenantId,
    p_provider: "google_analytics",
  });
  if (result.error) return { ok: false, error: integrationMigrationMessage(result.error.message) };
  return { ok: true, data: parseGoogleAnalyticsPublic(result.data) };
}

export async function listTenantGoogleAnalyticsPropertiesAction(
  tenantId: string,
): Promise<ActionResult<GoogleAnalyticsProperty[]>> {
  try {
    const supabase = await authed();
    const accessToken = await ensureTenantIntegrationAccessToken(
      supabase,
      tenantId,
      "google_analytics",
      "Google Analytics",
    );
    const properties = await listGoogleAnalyticsProperties(accessToken);
    return { ok: true, data: properties };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Properties ophalen mislukt",
    };
  }
}

export async function selectGoogleAnalyticsPropertyAction(
  tenantId: string,
  property: GoogleAnalyticsProperty,
): Promise<ActionResult<GoogleAnalyticsPublicStatus>> {
  const supabase = await authed();
  const updated = await supabase.schema("app").rpc("update_tenant_integration_metadata", {
    p_tenant_id: tenantId,
    p_provider: "google_analytics",
    p_metadata: {
      propertyId: property.propertyId,
      propertyName: property.propertyName,
      accountId: property.accountId,
    },
  });
  if (updated.error) return { ok: false, error: integrationMigrationMessage(updated.error.message) };
  revalidatePath(`/klanten/${tenantId}`);
  return { ok: true, data: parseGoogleAnalyticsPublic(updated.data) };
}

export async function disconnectGoogleAnalyticsAction(tenantId: string): Promise<ActionResult> {
  const supabase = await authed();
  const result = await supabase.schema("app").rpc("disconnect_tenant_integration", {
    p_tenant_id: tenantId,
    p_provider: "google_analytics",
  });
  if (result.error) return { ok: false, error: integrationMigrationMessage(result.error.message) };
  revalidatePath(`/klanten/${tenantId}`);
  return { ok: true };
}
