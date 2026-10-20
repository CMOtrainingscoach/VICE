import { NextResponse, type NextRequest } from "next/server";
import { fetchGoogleAccountEmail, parseOAuthState, resolveAppBaseUrl } from "@/lib/integrations/google-oauth";
import {
  GOOGLE_ADS_OAUTH_COOKIE,
  GOOGLE_ADS_REDIRECT_COOKIE,
  PLATFORM_GOOGLE_ADS_PROVIDER,
  PLATFORM_OAUTH_STATE_ID,
  exchangeGoogleAdsCode,
  googleAdsRedirectUri,
} from "@/lib/integrations/platform-google-ads";
import { getSession, isPlatformAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const oauthError = url.searchParams.get("error");
  const cookieState = request.cookies.get(GOOGLE_ADS_OAUTH_COOKIE)?.value ?? "";
  const cookieRedirect = request.cookies.get(GOOGLE_ADS_REDIRECT_COOKIE)?.value ?? "";

  const parsed = parseOAuthState(state);
  const clearCookies = (response: NextResponse) => {
    response.cookies.set(GOOGLE_ADS_OAUTH_COOKIE, "", { path: "/", maxAge: 0 });
    response.cookies.set(GOOGLE_ADS_REDIRECT_COOKIE, "", { path: "/", maxAge: 0 });
    return response;
  };
  const fail = (codeName: string) =>
    clearCookies(NextResponse.redirect(new URL(`/instellingen?ads=${codeName}`, request.url)));

  if (oauthError) return fail("denied");
  if (!code || !parsed || parsed.tenantId !== PLATFORM_OAUTH_STATE_ID) return fail("invalid");
  if (!cookieState || cookieState !== state) return fail("state");

  const session = await getSession();
  if (!session) {
    return clearCookies(NextResponse.redirect(new URL("/login", request.url)));
  }
  if (!(await isPlatformAdmin(session.userId))) {
    return fail("forbidden");
  }

  const redirectUri =
    cookieRedirect || googleAdsRedirectUri(resolveAppBaseUrl(request.nextUrl.origin));

  try {
    const tokens = await exchangeGoogleAdsCode(code, redirectUri);
    if (!tokens.refreshToken) {
      return fail("no-refresh");
    }
    const email = await fetchGoogleAccountEmail(tokens.accessToken);
    const expires = new Date(Date.now() + tokens.expiresIn * 1000).toISOString();
    const supabase = await createClient();
    const upsert = await supabase.schema("app").rpc("upsert_platform_integration_tokens", {
      p_provider: PLATFORM_GOOGLE_ADS_PROVIDER,
      p_account_email: email,
      p_access_token: tokens.accessToken,
      p_refresh_token: tokens.refreshToken,
      p_token_expires_at: expires,
      p_metadata: {},
    });
    if (upsert.error) {
      console.error("google_ads platform upsert", upsert.error.message);
      return fail("save");
    }

    return clearCookies(
      NextResponse.redirect(new URL("/instellingen?ads=connected", request.url)),
    );
  } catch (error) {
    console.error("google_ads platform callback", error);
    return fail("token");
  }
}
