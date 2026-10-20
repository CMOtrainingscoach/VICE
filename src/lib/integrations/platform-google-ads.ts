import {
  buildGoogleAuthUrl,
  exchangeGoogleCode,
  googleOAuthConfigured,
  integrationRedirectUri,
} from "@/lib/integrations/google-oauth";

export const PLATFORM_GOOGLE_ADS_PROVIDER = "google_ads";
export const PLATFORM_OAUTH_STATE_ID = "platform";

export const PLATFORM_GOOGLE_ADS_MIGRATION =
  "Pas migratie 20260330135800_platform_google_ads.sql toe in de Supabase SQL-editor.";

const SCOPES = [
  "https://www.googleapis.com/auth/adwords",
  "https://www.googleapis.com/auth/userinfo.email",
];

const CALLBACK_PATH = "/api/integrations/google-ads/callback";

export const GOOGLE_ADS_OAUTH_COOKIE = "vice_google_ads_oauth_state";
export const GOOGLE_ADS_REDIRECT_COOKIE = "vice_google_ads_oauth_redirect";

export type PlatformGoogleAdsPublicStatus = {
  connected: boolean;
  status: string;
  accountEmail: string;
  customerId: string;
  loginCustomerId: string;
  lastError: string;
  updatedAt?: string;
};

export function emptyPlatformGoogleAdsStatus(): PlatformGoogleAdsPublicStatus {
  return {
    connected: false,
    status: "disconnected",
    accountEmail: "",
    customerId: "",
    loginCustomerId: "",
    lastError: "",
  };
}

export function parsePlatformGoogleAdsPublic(raw: unknown): PlatformGoogleAdsPublicStatus {
  if (!raw || typeof raw !== "object") return emptyPlatformGoogleAdsStatus();
  const row = raw as Record<string, unknown>;
  return {
    connected: Boolean(row.connected),
    status: String(row.status ?? "disconnected"),
    accountEmail: String(row.accountEmail ?? ""),
    customerId: String(row.customerId ?? ""),
    loginCustomerId: String(row.loginCustomerId ?? ""),
    lastError: String(row.lastError ?? ""),
    updatedAt: row.updatedAt ? String(row.updatedAt) : undefined,
  };
}

export function googleAdsOAuthConfigured() {
  return googleOAuthConfigured();
}

export function googleAdsRedirectUri(baseUrl?: string) {
  return integrationRedirectUri(CALLBACK_PATH, baseUrl);
}

export function buildGoogleAdsAuthUrl(state: string, redirectUri?: string) {
  return buildGoogleAuthUrl(SCOPES, state, redirectUri ?? googleAdsRedirectUri());
}

export async function exchangeGoogleAdsCode(code: string, redirectUri?: string) {
  return exchangeGoogleCode(code, redirectUri ?? googleAdsRedirectUri());
}

export function normalizeAdsCustomerId(value: string): string {
  return value.replace(/\D/g, "").trim();
}
