import { refreshGoogleAccessToken, parseGoogleIntegrationSecrets } from "@/lib/integrations/google-oauth";
import type { SupabaseClient } from "@supabase/supabase-js";

const MISSING = /get_tenant_integration|upsert_tenant_integration|disconnect_tenant_integration|schema cache|does not exist|Could not find the function/i;

export function integrationMigrationMessage(message: string) {
  return MISSING.test(message)
    ? "Pas migraties 20260330135100 en 20260330135400 toe in de Supabase SQL-editor."
    : message;
}

export async function ensureTenantIntegrationAccessToken(
  supabase: SupabaseClient,
  tenantId: string,
  provider: string,
  reconnectLabel: string,
): Promise<string> {
  const secretsResult = await supabase.schema("app").rpc("get_tenant_integration_secrets", {
    p_tenant_id: tenantId,
    p_provider: provider,
  });
  if (secretsResult.error) {
    throw new Error(integrationMigrationMessage(secretsResult.error.message));
  }
  const secrets = parseGoogleIntegrationSecrets(secretsResult.data);
  if (!secrets?.refreshToken && !secrets?.accessToken) {
    throw new Error(`Geen ${reconnectLabel}-koppeling gevonden`);
  }

  const expiresAt = secrets.tokenExpiresAt ? new Date(secrets.tokenExpiresAt).getTime() : 0;
  const stillValid = secrets.accessToken && expiresAt > Date.now() + 60_000;
  if (stillValid) return secrets.accessToken;

  if (!secrets.refreshToken) {
    throw new Error(`${reconnectLabel}-sessie verlopen. Koppel opnieuw in Instellingen.`);
  }

  const refreshed = await refreshGoogleAccessToken(secrets.refreshToken);
  const expires = new Date(Date.now() + refreshed.expiresIn * 1000).toISOString();
  const upsert = await supabase.schema("app").rpc("upsert_tenant_integration_tokens", {
    p_tenant_id: tenantId,
    p_provider: provider,
    p_account_email: secrets.accountEmail,
    p_access_token: refreshed.accessToken,
    p_refresh_token: secrets.refreshToken,
    p_token_expires_at: expires,
    p_metadata: {},
  });
  if (upsert.error) throw new Error(integrationMigrationMessage(upsert.error.message));
  return refreshed.accessToken;
}

type IntegrationRow = {
  access_token: string;
  refresh_token: string;
  token_expires_at: string | null;
  account_email: string;
  metadata: Record<string, unknown> | null;
  status: string;
};

/** Service-role: refresh tokens without an authenticated user session. */
export async function ensureTenantIntegrationAccessTokenAdmin(
  admin: SupabaseClient,
  tenantId: string,
  provider: string,
): Promise<string> {
  const { data, error } = await admin
    .schema("app")
    .from("tenant_integrations")
    .select("access_token, refresh_token, token_expires_at, account_email, metadata, status")
    .eq("tenant_id", tenantId)
    .eq("provider", provider)
    .maybeSingle();

  if (error) throw new Error(error.message);
  const row = data as IntegrationRow | null;
  if (!row || row.status !== "connected" || !row.refresh_token) {
    throw new Error(`Geen actieve ${provider}-koppeling`);
  }

  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0;
  if (row.access_token && expiresAt > Date.now() + 60_000) {
    return row.access_token;
  }

  const refreshed = await refreshGoogleAccessToken(row.refresh_token);
  const expires = new Date(Date.now() + refreshed.expiresIn * 1000).toISOString();
  const { error: updateError } = await admin
    .schema("app")
    .from("tenant_integrations")
    .update({
      access_token: refreshed.accessToken,
      token_expires_at: expires,
      last_error: "",
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .eq("provider", provider);

  if (updateError) throw new Error(updateError.message);
  return refreshed.accessToken;
}

export async function setIntegrationLastErrorAdmin(
  admin: SupabaseClient,
  tenantId: string,
  provider: string,
  message: string,
) {
  await admin
    .schema("app")
    .from("tenant_integrations")
    .update({ last_error: message.slice(0, 500), updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("provider", provider);
}
