import { NextResponse, type NextRequest } from "next/server";
import {
  bloggerConfigured,
  bloggerRedirectUri,
  buildBloggerAuthUrl,
  createOAuthState,
  resolveAppBaseUrl,
} from "@/lib/integrations/blogger";
import { getSession, isPlatformAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get("tenantId")?.trim();
  if (!tenantId) {
    return NextResponse.redirect(new URL("/klanten?blogger=missing-tenant", request.url));
  }

  if (!bloggerConfigured()) {
    return NextResponse.redirect(
      new URL(`/klanten/${tenantId}?tab=instellingen&blogger=not-configured`, request.url),
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
  const redirectUri = bloggerRedirectUri(baseUrl);
  // Productie mag nooit een http-localhost callback naar Google sturen.
  if (baseUrl.includes("vercel.app") || baseUrl.startsWith("https://")) {
    if (redirectUri.startsWith("http://localhost") || redirectUri.startsWith("http://127.")) {
      return NextResponse.redirect(
        new URL(`/klanten/${tenantId}?tab=instellingen&blogger=not-configured`, request.url),
      );
    }
  }

  const state = createOAuthState(tenantId);
  const response = NextResponse.redirect(buildBloggerAuthUrl(state, redirectUri));
  const secure = baseUrl.startsWith("https://");
  response.cookies.set("vice_blogger_oauth", state, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 15 * 60,
  });
  response.cookies.set("vice_blogger_redirect", redirectUri, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 15 * 60,
  });
  return response;
}
