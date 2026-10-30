import { createHash, randomBytes } from "node:crypto";
import { integrationRedirectUri } from "@/lib/integrations/google-oauth";

export const OPENART_API_BASE = "https://openart.ai/suite/api";
export const OPENART_AUTHORIZE = `${OPENART_API_BASE}/auth/oauth/authorize`;
export const OPENART_TOKEN = `${OPENART_API_BASE}/auth/oauth/token`;
export const OPENART_REGISTER = `${OPENART_API_BASE}/auth/oauth/register`;
export const OPENART_SCOPE = "full_access";

export const OPENART_CALLBACK_PATH = "/api/integrations/openart/callback";

export function openartRedirectUri(baseUrl?: string) {
  return integrationRedirectUri(OPENART_CALLBACK_PATH, baseUrl);
}

export function createPkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export async function registerOpenArtPublicClient(redirectUri: string): Promise<string> {
  const fromEnv = process.env.OPENART_OAUTH_CLIENT_ID?.trim();
  if (fromEnv) return fromEnv;

  const res = await fetch(OPENART_REGISTER, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_name: "VICE Platform",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });
  const json = (await res.json()) as { client_id?: string; error?: string; error_description?: string };
  if (!res.ok || !json.client_id) {
    throw new Error(json.error_description ?? json.error ?? "OpenArt client-registratie mislukt");
  }
  return json.client_id;
}

export function buildOpenArtAuthUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}) {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: OPENART_SCOPE,
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
  });
  return `${OPENART_AUTHORIZE}?${params.toString()}`;
}

export async function exchangeOpenArtCode(input: {
  code: string;
  redirectUri: string;
  clientId: string;
  codeVerifier: string;
}) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: input.clientId,
    code_verifier: input.codeVerifier,
  });
  const res = await fetch(OPENART_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
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
    throw new Error(json.error_description ?? json.error ?? "OpenArt token exchange mislukt");
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? "",
    expiresIn: Number(json.expires_in) || 3600,
  };
}

export async function refreshOpenArtAccessToken(input: {
  refreshToken: string;
  clientId: string;
}) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
    client_id: input.clientId,
  });
  const res = await fetch(OPENART_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
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
    throw new Error(json.error_description ?? json.error ?? "OpenArt token refresh mislukt");
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? input.refreshToken,
    expiresIn: Number(json.expires_in) || 3600,
  };
}
