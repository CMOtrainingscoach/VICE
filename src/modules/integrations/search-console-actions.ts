"use server";

import { revalidatePath } from "next/cache";
import {
  listSearchConsoleSites,
  parseSearchConsolePublic,
  type SearchConsolePublicStatus,
  type SearchConsoleSite,
} from "@/lib/integrations/search-console";
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

export async function getSearchConsoleStatusAction(
  tenantId: string,
): Promise<ActionResult<SearchConsolePublicStatus>> {
  const supabase = await authed();
  const result = await supabase.schema("app").rpc("get_tenant_integration_public", {
    p_tenant_id: tenantId,
    p_provider: "search_console",
  });
  if (result.error) return { ok: false, error: integrationMigrationMessage(result.error.message) };
  return { ok: true, data: parseSearchConsolePublic(result.data) };
}

export async function listTenantSearchConsoleSitesAction(
  tenantId: string,
): Promise<ActionResult<SearchConsoleSite[]>> {
  try {
    const supabase = await authed();
    const accessToken = await ensureTenantIntegrationAccessToken(
      supabase,
      tenantId,
      "search_console",
      "Search Console",
    );
    const sites = await listSearchConsoleSites(accessToken);
    return { ok: true, data: sites };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Sites ophalen mislukt" };
  }
}

export async function selectSearchConsoleSiteAction(
  tenantId: string,
  site: SearchConsoleSite,
): Promise<ActionResult<SearchConsolePublicStatus>> {
  const supabase = await authed();
  const updated = await supabase.schema("app").rpc("update_tenant_integration_metadata", {
    p_tenant_id: tenantId,
    p_provider: "search_console",
    p_metadata: {
      siteUrl: site.siteUrl,
    },
  });
  if (updated.error) return { ok: false, error: integrationMigrationMessage(updated.error.message) };
  revalidatePath(`/klanten/${tenantId}`);
  return { ok: true, data: parseSearchConsolePublic(updated.data) };
}

export async function disconnectSearchConsoleAction(tenantId: string): Promise<ActionResult> {
  const supabase = await authed();
  const result = await supabase.schema("app").rpc("disconnect_tenant_integration", {
    p_tenant_id: tenantId,
    p_provider: "search_console",
  });
  if (result.error) return { ok: false, error: integrationMigrationMessage(result.error.message) };
  revalidatePath(`/klanten/${tenantId}`);
  return { ok: true };
}
