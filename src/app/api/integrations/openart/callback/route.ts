import { NextResponse, type NextRequest } from "next/server";
import { parseOAuthState, resolveAppBaseUrl } from "@/lib/integrations/google-oauth";
import { exchangeOpenArtCode, openartRedirectUri } from "@/lib/integrations/openart-oauth";
import {
  fetchOpenArtDefaultProjectId,
  fetchOpenArtUserInfo,
} from "@/lib/integrations/openart";
import { PLATFORM_OAUTH_STATE_ID } from "@/lib/integrations/platform-google-ads";
import {
  OPENART_CLIENT_COOKIE,
  OPENART_OAUTH_COOKIE,
  OPENART_PKCE_COOKIE,
  OPENART_REDIRECT_COOKIE,
  PLATFORM_OPENART_PROVIDER,
} from "@/lib/integrations/platform-openart";
import { getSession, isPlatformAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const oauthError = url.searchParams.get("error");
  const cookieState = request.cookies.get(OPENART_OAUTH_COOKIE)?.value ?? "";
  const cookieRedirect = request.cookies.get(OPENART_REDIRECT_COOKIE)?.value ?? "";
  const codeVerifier = request.cookies.get(OPENART_PKCE_COOKIE)?.value ?? "";
  const clientId = request.cookies.get(OPENART_CLIENT_COOKIE)?.value ?? "";

  const parsed = parseOAuthState(state);
  const clearCookies = (response: NextResponse) => {
    for (const name of [
      OPENART_OAUTH_COOKIE,
      OPENART_REDIRECT_COOKIE,
      OPENART_PKCE_COOKIE,
      OPENART_CLIENT_COOKIE,
    ]) {
      response.cookies.set(name, "", { path: "/", maxAge: 0 });
    }
    return response;
  };
  const fail = (codeName: string) =>
    clearCookies(NextResponse.redirect(new URL(`/instellingen?openart=${codeName}`, request.url)));

  if (oauthError) return fail("denied");
  if (!code || !parsed || parsed.tenantId !== PLATFORM_OAUTH_STATE_ID) return fail("invalid");
  if (!cookieState || cookieState !== state || !codeVerifier || !clientId) return fail("state");

  const session = await getSession();
  if (!session) {
    return clearCookies(NextResponse.redirect(new URL("/login", request.url)));
  }
  if (!(await isPlatformAdmin(session.userId))) {
    return fail("forbidden");
  }

  const redirectUri =
    cookieRedirect || openartRedirectUri(resolveAppBaseUrl(request.nextUrl.origin));

  try {
    const tokens = await exchangeOpenArtCode({
      code,
      redirectUri,
      clientId,
      codeVerifier,
    });
    if (!tokens.refreshToken) {
      return fail("no-refresh");
    }

    const info = await fetchOpenArtUserInfo(tokens.accessToken);
    const projectId = await fetchOpenArtDefaultProjectId(tokens.accessToken);
    const email = String(info.displayName ?? info.username ?? "").trim();
    const expires = new Date(Date.now() + tokens.expiresIn * 1000).toISOString();

    const supabase = await createClient();
    const upsert = await supabase.schema("app").rpc("upsert_platform_integration_tokens", {
      p_provider: PLATFORM_OPENART_PROVIDER,
      p_account_email: email,
      p_access_token: tokens.accessToken,
      p_refresh_token: tokens.refreshToken,
      p_token_expires_at: expires,
      p_metadata: {
        oauthClientId: clientId,
        projectId,
        subscriptionActive: Boolean(info.subscription_active),
        openArtCredits: info.free_credit_balance ?? null,
        displayName: email,
      },
    });
    if (upsert.error) {
      console.error("openart platform upsert", upsert.error.message);
      return fail("save");
    }

    return clearCookies(
      NextResponse.redirect(new URL("/instellingen?openart=connected", request.url)),
    );
  } catch (error) {
    console.error("openart platform callback", error);
    return fail("token");
  }
}
