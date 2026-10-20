import { NextResponse, type NextRequest } from "next/server";
import { fetchGoogleAccountEmail, parseOAuthState, resolveAppBaseUrl } from "@/lib/integrations/google-oauth";
import {
  GOOGLE_ANALYTICS_OAUTH_COOKIE,
  GOOGLE_ANALYTICS_REDIRECT_COOKIE,
  exchangeGoogleAnalyticsCode,
  googleAnalyticsRedirectUri,
} from "@/lib/integrations/google-analytics";
import { getSession, isPlatformAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const oauthError = url.searchParams.get("error");
  const cookieState = request.cookies.get(GOOGLE_ANALYTICS_OAUTH_COOKIE)?.value ?? "";
  const cookieRedirect = request.cookies.get(GOOGLE_ANALYTICS_REDIRECT_COOKIE)?.value ?? "";

  const parsed = parseOAuthState(state);
  const tenantId = parsed?.tenantId;
  const clearCookies = (response: NextResponse) => {
    response.cookies.set(GOOGLE_ANALYTICS_OAUTH_COOKIE, "", { path: "/", maxAge: 0 });
    response.cookies.set(GOOGLE_ANALYTICS_REDIRECT_COOKIE, "", { path: "/", maxAge: 0 });
    return response;
  };
  const fail = (codeName: string) => {
    const target = tenantId
      ? `/klanten/${tenantId}?tab=instellingen&ga=${codeName}`
      : `/klanten?ga=${codeName}`;
    return clearCookies(NextResponse.redirect(new URL(target, request.url)));
  };

  if (oauthError) return fail("denied");
  if (!code || !tenantId) return fail("invalid");
  if (!cookieState || cookieState !== state) return fail("state");

  const session = await getSession();
  if (!session) {
    return clearCookies(NextResponse.redirect(new URL("/login", request.url)));
  }
  if (!(await isPlatformAdmin(session.userId))) {
    return fail("forbidden");
  }

  const redirectUri =
    cookieRedirect || googleAnalyticsRedirectUri(resolveAppBaseUrl(request.nextUrl.origin));

  try {
    const tokens = await exchangeGoogleAnalyticsCode(code, redirectUri);
    const email = await fetchGoogleAccountEmail(tokens.accessToken);
    const expires = new Date(Date.now() + tokens.expiresIn * 1000).toISOString();
    const supabase = await createClient();
    const upsert = await supabase.schema("app").rpc("upsert_tenant_integration_tokens", {
      p_tenant_id: tenantId,
      p_provider: "google_analytics",
      p_account_email: email,
      p_access_token: tokens.accessToken,
      p_refresh_token: tokens.refreshToken,
      p_token_expires_at: expires,
      p_metadata: {},
    });
    if (upsert.error) {
      console.error("google_analytics upsert", upsert.error.message);
      return fail("save");
    }

    return clearCookies(
      NextResponse.redirect(
        new URL(`/klanten/${tenantId}?tab=instellingen&ga=connected`, request.url),
      ),
    );
  } catch (error) {
    console.error("google_analytics callback", error);
    return fail("token");
  }
}
