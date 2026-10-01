import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AppSession = {
  userId: string;
  email: string | undefined;
  aal: string;
};

export async function getSession(): Promise<AppSession | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) {
    return null;
  }

  const claims = data.claims as Record<string, unknown>;

  return {
    userId: String(claims.sub),
    email: typeof claims.email === "string" ? claims.email : undefined,
    aal: typeof claims.aal === "string" ? claims.aal : "aal1",
  };
}

export async function requireSession(): Promise<AppSession> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("app")
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return false;
  }
  return !!data;
}

export async function requirePlatformAdminMfa(session: AppSession): Promise<void> {
  const admin = await isPlatformAdmin(session.userId);
  if (!admin) {
    return;
  }

  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const hasVerifiedTotp =
    factors?.totp?.some((f) => f.status === "verified") ?? false;

  if (!hasVerifiedTotp) {
    redirect("/mfa/enroll");
  }

  if (session.aal !== "aal2") {
    redirect("/mfa/verify");
  }
}
