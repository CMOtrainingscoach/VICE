import { NextResponse, type NextRequest } from "next/server";
import { createOAuthState, resolveAppBaseUrl } from "@/lib/integrations/google-oauth";
import {
  buildOpenArtAuthUrl,
  createPkcePair,
  openartRedirectUri,
  registerOpenArtPublicClient,
} from "@/lib/integrations/openart-oauth";
import {
  OPENART_CLIENT_COOKIE,
  OPENART_OAUTH_COOKIE,
  OPENART_PKCE_COOKIE,
  OPENART_REDIRECT_COOKIE,
} from "@/lib/integrations/platform-openart";
import { PLATFORM_OAUTH_STATE_ID } from "@/lib/integrations/platform-google-ads";
import { getSession, isPlatformAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function startPlatformOpenArtConnect(request: NextRequest) {
  const settingsPath = "/instellingen";
  const flashPrefix = "openart";

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
  const callbackUri = openartRedirectUri(baseUrl);

  try {
    const clientId = await registerOpenArtPublicClient(callbackUri);
    const { verifier, challenge } = createPkcePair();
    const state = createOAuthState(PLATFORM_OAUTH_STATE_ID);
    const response = NextResponse.redirect(
      buildOpenArtAuthUrl({
        clientId,
        redirectUri: callbackUri,
        state,
        codeChallenge: challenge,
      }),
    );
    const secure = baseUrl.startsWith("https://");
    response.cookies.set(OPENART_OAUTH_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 15 * 60,
    });
    response.cookies.set(OPENART_REDIRECT_COOKIE, callbackUri, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 15 * 60,
    });
    response.cookies.set(OPENART_PKCE_COOKIE, verifier, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 15 * 60,
    });
    response.cookies.set(OPENART_CLIENT_COOKIE, clientId, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 15 * 60,
    });
    return response;
  } catch (error) {
    console.error("openart connect", error);
    return NextResponse.redirect(
      new URL(`${settingsPath}?${flashPrefix}=not-configured`, request.url),
    );
  }
}
