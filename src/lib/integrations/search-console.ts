import {
  buildGoogleAuthUrl,
  exchangeGoogleCode,
  googleOAuthConfigured,
  integrationRedirectUri,
  parseGoogleIntegrationSecrets,
  refreshGoogleAccessToken,
  type GoogleIntegrationSecrets,
} from "@/lib/integrations/google-oauth";

const SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

const CONNECT_PATH = "/api/integrations/search-console/connect";
const CALLBACK_PATH = "/api/integrations/search-console/callback";

export type SearchConsolePublicStatus = {
  connected: boolean;
  status: string;
  accountEmail: string;
  siteUrl: string | null;
  lastError: string;
  updatedAt?: string;
};

export type SearchConsoleSite = {
  siteUrl: string;
  permissionLevel: string;
};

export function searchConsoleConfigured() {
  return googleOAuthConfigured();
}

export function searchConsoleRedirectUri(baseUrl?: string) {
  return integrationRedirectUri(CALLBACK_PATH, baseUrl);
}

export function buildSearchConsoleAuthUrl(state: string, redirectUri?: string) {
  return buildGoogleAuthUrl(SCOPES, state, redirectUri ?? searchConsoleRedirectUri());
}

export async function exchangeSearchConsoleCode(code: string, redirectUri?: string) {
  return exchangeGoogleCode(code, redirectUri ?? searchConsoleRedirectUri());
}

export { refreshGoogleAccessToken as refreshSearchConsoleAccessToken };

export async function listSearchConsoleSites(accessToken: string): Promise<SearchConsoleSite[]> {
  const res = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json()) as {
    siteEntry?: { siteUrl?: string; permissionLevel?: string }[];
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(json.error?.message || "Search Console-sites ophalen mislukt");
  }
  const entries = json.siteEntry ?? [];
  return entries
    .filter((entry) => entry.siteUrl)
    .map((entry) => ({
      siteUrl: String(entry.siteUrl),
      permissionLevel: String(entry.permissionLevel ?? ""),
    }))
    .sort((a, b) => a.siteUrl.localeCompare(b.siteUrl));
}

export function emptySearchConsoleStatus(): SearchConsolePublicStatus {
  return {
    connected: false,
    status: "disconnected",
    accountEmail: "",
    siteUrl: null,
    lastError: "",
  };
}

export function parseSearchConsolePublic(raw: unknown): SearchConsolePublicStatus {
  if (!raw || typeof raw !== "object") return emptySearchConsoleStatus();
  const row = raw as Record<string, unknown>;
  return {
    connected: Boolean(row.connected),
    status: String(row.status ?? "disconnected"),
    accountEmail: String(row.accountEmail ?? ""),
    siteUrl: row.siteUrl ? String(row.siteUrl) : null,
    lastError: String(row.lastError ?? ""),
    updatedAt: row.updatedAt ? String(row.updatedAt) : undefined,
  };
}

export function parseSearchConsoleSecrets(raw: unknown): GoogleIntegrationSecrets | null {
  return parseGoogleIntegrationSecrets(raw);
}

export const SEARCH_CONSOLE_OAUTH_COOKIE = "vice_gsc_oauth";
export const SEARCH_CONSOLE_REDIRECT_COOKIE = "vice_gsc_redirect";
export const SEARCH_CONSOLE_CONNECT_PATH = CONNECT_PATH;
