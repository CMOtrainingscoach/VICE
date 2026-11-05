"use server";

import { revalidatePath } from "next/cache";
import {
  listGoogleDocsDriveItems,
  parseGoogleDocsPublic,
  type GoogleDocsDriveItem,
  type GoogleDocsPublicStatus,
} from "@/lib/integrations/google-docs";
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

export async function getGoogleDocsStatusAction(
  tenantId: string,
): Promise<ActionResult<GoogleDocsPublicStatus>> {
  const supabase = await authed();
  const result = await supabase.schema("app").rpc("get_tenant_integration_public", {
    p_tenant_id: tenantId,
    p_provider: "google_docs",
  });
  if (result.error) return { ok: false, error: integrationMigrationMessage(result.error.message) };
  return { ok: true, data: parseGoogleDocsPublic(result.data) };
}

export async function listTenantGoogleDocsResourcesAction(
  tenantId: string,
): Promise<ActionResult<GoogleDocsDriveItem[]>> {
  try {
    const supabase = await authed();
    const accessToken = await ensureTenantIntegrationAccessToken(
      supabase,
      tenantId,
      "google_docs",
      "Google Docs",
    );
    const items = await listGoogleDocsDriveItems(accessToken);
    return { ok: true, data: items };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Drive-items ophalen mislukt",
    };
  }
}

export async function selectGoogleDocsResourceAction(
  tenantId: string,
  item: GoogleDocsDriveItem,
): Promise<ActionResult<GoogleDocsPublicStatus>> {
  const supabase = await authed();
  const updated = await supabase.schema("app").rpc("update_tenant_integration_metadata", {
    p_tenant_id: tenantId,
    p_provider: "google_docs",
    p_metadata: {
      resourceType: item.resourceType,
      resourceId: item.id,
      resourceName: item.name,
      resourceUrl: item.webViewLink ?? "",
    },
  });
  if (updated.error) return { ok: false, error: integrationMigrationMessage(updated.error.message) };
  revalidatePath(`/klanten/${tenantId}`);
  revalidatePath(`/klanten/${tenantId}/documenten`);
  return { ok: true, data: parseGoogleDocsPublic(updated.data) };
}

export async function disconnectGoogleDocsAction(tenantId: string): Promise<ActionResult> {
  const supabase = await authed();
  const result = await supabase.schema("app").rpc("disconnect_tenant_integration", {
    p_tenant_id: tenantId,
    p_provider: "google_docs",
  });
  if (result.error) return { ok: false, error: integrationMigrationMessage(result.error.message) };
  revalidatePath(`/klanten/${tenantId}`);
  revalidatePath(`/klanten/${tenantId}/documenten`);
  return { ok: true };
}
