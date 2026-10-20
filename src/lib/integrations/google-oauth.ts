import { createHash, randomBytes } from "node:crypto";

export const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
export const GOOGLE_USERINFO = "https://www.googleapis.com/oauth2/v2/userinfo";

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function resolveAppBaseUrl(requestOrigin?: string | null) {
  const fromRequest = (requestOrigin ?? "").replace(/\/$/, "");
  if (fromRequest.startsWith("http://") || fromRequest.startsWith("https://")) {
    return fromRequest;
  }
  return appUrl();
}

export function googleOAuthConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

export function integrationRedirectUri(path: string, baseUrl?: string) {
  const base = (baseUrl ?? appUrl()).replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export function createOAuthState(tenantId: string) {
  const nonce = randomBytes(16).toString("hex");
  const payload = `${tenantId}.${nonce}.${Date.now()}`;
  const sig = createHash("sha256")
    .update(`${payload}.${process.env.GOOGLE_CLIENT_SECRET ?? "vice"}`)
    .digest("hex")
    .slice(0, 24);
  return `${payload}.${sig}`;
}

export function parseOAuthState(state: string): { tenantId: string } | null {
  const parts = state.split(".");
  if (parts.length !== 4) return null;
  const [tenantId, nonce, ts, sig] = parts;
  if (!tenantId || !nonce || !ts || !sig) return null;
  const age = Date.now() - Number(ts);
  if (!Number.isFinite(age) || age < 0 || age > 15 * 60 * 1000) return null;
  const payload = `${tenantId}.${nonce}.${ts}`;
  const expected = createHash("sha256")
    .update(`${payload}.${process.env.GOOGLE_CLIENT_SECRET ?? "vice"}`)
    .digest("hex")
    .slice(0, 24);
  if (expected !== sig) return null;
  return { tenantId };
}

export function buildGoogleAuthUrl(scopes: string[], state: string, redirectUri: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${GOOGLE_AUTH}?${params.toString()}`;
}

export async function exchangeGoogleCode(code: string, redirectUri: string) {
  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || "Google tokenuitwisseling mislukt");
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? "",
    expiresIn: json.expires_in ?? 3600,
  };
}

export async function refreshGoogleAccessToken(refreshToken: string) {
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || "Google token vernieuwen mislukt");
  }
  return {
    accessToken: json.access_token,
    expiresIn: json.expires_in ?? 3600,
  };
}

export async function fetchGoogleAccountEmail(accessToken: string): Promise<string> {
  const res = await fetch(GOOGLE_USERINFO, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json()) as { email?: string };
  return json.email ?? "";
}

export type GoogleIntegrationSecrets = {
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: string | null;
  metadata: Record<string, unknown>;
  accountEmail: string;
};

export function parseGoogleIntegrationSecrets(raw: unknown): GoogleIntegrationSecrets | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const accessToken = String(row.accessToken ?? "");
  const refreshToken = String(row.refreshToken ?? "");
  if (!refreshToken && !accessToken) return null;
  return {
    accessToken,
    refreshToken,
    tokenExpiresAt: row.tokenExpiresAt ? String(row.tokenExpiresAt) : null,
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {},
    accountEmail: String(row.accountEmail ?? ""),
  };
}
