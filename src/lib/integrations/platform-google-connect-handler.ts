import { NextResponse, type NextRequest } from "next/server";
import { createOAuthState, googleOAuthConfigured, resolveAppBaseUrl } from "@/lib/integrations/google-oauth";
import { PLATFORM_OAUTH_STATE_ID } from "@/lib/integrations/platform-google-ads";
import { getSession, isPlatformAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function startPlatformGoogleConnect(input: {
  request: NextRequest;
  buildAuthUrl: (state: string, redirectUri: string) => string;
  redirectUri: (baseUrl: string) => string;
  oauthCookieName: string;
  redirectCookieName: string;
  flashPrefix: string;
  settingsPath: string;
}) {
  const {
    request,
    buildAuthUrl,
    redirectUri,
    oauthCookieName,
    redirectCookieName,
    flashPrefix,
    settingsPath,
  } = input;

  if (!googleOAuthConfigured()) {
    return NextResponse.redirect(
      new URL(`${settingsPath}?${flashPrefix}=not-configured`, request.url),
    );
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const admin = await isPlatformAdmin(session.userId);
  if (!admin) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const hasVerifiedTotp = factors?.totp?.some((f) => f.status === "verified") ?? false;
  if (!hasVerifiedTotp) {
    return NextResponse.redirect(new URL("/mfa/enroll", request.url));
  }
  if (session.aal !== "aal2") {
    return NextResponse.redirect(new URL("/mfa/verify", request.url));
  }

  const baseUrl = resolveAppBaseUrl(request.nextUrl.origin);
  const callbackUri = redirectUri(baseUrl);
  if (baseUrl.includes("vercel.app") || baseUrl.startsWith("https://")) {
    if (callbackUri.startsWith("http://localhost") || callbackUri.startsWith("http://127.")) {
      return NextResponse.redirect(
        new URL(`${settingsPath}?${flashPrefix}=not-configured`, request.url),
      );
    }
  }

  const state = createOAuthState(PLATFORM_OAUTH_STATE_ID);
  const response = NextResponse.redirect(buildAuthUrl(state, callbackUri));
  const secure = baseUrl.startsWith("https://");
  response.cookies.set(oauthCookieName, state, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 15 * 60,
  });
  response.cookies.set(redirectCookieName, callbackUri, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 15 * 60,
  });
  return response;
}
