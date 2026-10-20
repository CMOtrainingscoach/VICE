import { NextResponse, type NextRequest } from "next/server";
import {
  createOAuthState,
  googleOAuthConfigured,
  resolveAppBaseUrl,
} from "@/lib/integrations/google-oauth";
import { getSession, isPlatformAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function startGoogleIntegrationConnect(input: {
  request: NextRequest;
  tenantId: string | null | undefined;
  buildAuthUrl: (state: string, redirectUri: string) => string;
  redirectUri: (baseUrl: string) => string;
  oauthCookieName: string;
  redirectCookieName: string;
  flashPrefix: "gsc" | "ga";
  missingTenantRedirect: string;
}) {
  const {
    request,
    tenantId,
    buildAuthUrl,
    redirectUri,
    oauthCookieName,
    redirectCookieName,
    flashPrefix,
    missingTenantRedirect,
  } = input;

  if (!tenantId) {
    return NextResponse.redirect(new URL(missingTenantRedirect, request.url));
  }

  if (!googleOAuthConfigured()) {
    return NextResponse.redirect(
      new URL(`/klanten/${tenantId}?tab=instellingen&${flashPrefix}=not-configured`, request.url),
    );
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const admin = await isPlatformAdmin(session.userId);
  if (!admin) {
    return NextResponse.redirect(new URL(`/klanten/${tenantId}`, request.url));
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
        new URL(`/klanten/${tenantId}?tab=instellingen&${flashPrefix}=not-configured`, request.url),
      );
    }
  }

  const state = createOAuthState(tenantId);
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
