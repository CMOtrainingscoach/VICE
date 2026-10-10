import { NextResponse, type NextRequest } from "next/server";
import {
  bloggerRedirectUri,
  exchangeBloggerCode,
  fetchGoogleAccountEmail,
  parseOAuthState,
  resolveAppBaseUrl,
} from "@/lib/integrations/blogger";
import { getSession, isPlatformAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const oauthError = url.searchParams.get("error");
  const cookieState = request.cookies.get("vice_blogger_oauth")?.value ?? "";
  const cookieRedirect = request.cookies.get("vice_blogger_redirect")?.value ?? "";

  const parsed = parseOAuthState(state);
  const tenantId = parsed?.tenantId;
  const clearCookies = (response: NextResponse) => {
    response.cookies.set("vice_blogger_oauth", "", { path: "/", maxAge: 0 });
    response.cookies.set("vice_blogger_redirect", "", { path: "/", maxAge: 0 });
    return response;
  };
  const fail = (codeName: string) => {
    const target = tenantId
      ? `/klanten/${tenantId}?tab=instellingen&blogger=${codeName}`
      : `/klanten?blogger=${codeName}`;
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
    cookieRedirect || bloggerRedirectUri(resolveAppBaseUrl(request.nextUrl.origin));

  try {
    const tokens = await exchangeBloggerCode(code, redirectUri);
    const email = await fetchGoogleAccountEmail(tokens.accessToken);
    const expires = new Date(Date.now() + tokens.expiresIn * 1000).toISOString();
    const supabase = await createClient();
    const upsert = await supabase.schema("app").rpc("upsert_tenant_integration_tokens", {
      p_tenant_id: tenantId,
      p_provider: "blogger",
      p_account_email: email,
      p_access_token: tokens.accessToken,
      p_refresh_token: tokens.refreshToken,
      p_token_expires_at: expires,
      p_metadata: {},
    });
    if (upsert.error) {
      console.error("blogger upsert", upsert.error.message);
      return fail("save");
    }

    return clearCookies(
      NextResponse.redirect(
        new URL(`/klanten/${tenantId}?tab=instellingen&blogger=connected`, request.url),
      ),
    );
  } catch (error) {
    console.error("blogger callback", error);
    return fail("token");
  }
}
