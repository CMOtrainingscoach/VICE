import { NextResponse, type NextRequest } from "next/server";
import {
  bloggerConfigured,
  buildBloggerAuthUrl,
  createOAuthState,
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

  const state = createOAuthState(tenantId);
  const response = NextResponse.redirect(buildBloggerAuthUrl(state));
  response.cookies.set("vice_blogger_oauth", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 15 * 60,
  });
  return response;
}
