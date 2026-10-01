import { createClient } from "@/lib/supabase/server";
import { getSession, isPlatformAdmin, type AppSession } from "@/lib/auth/session";

export type UserAppContext = {
  session: AppSession;
  isPlatformAdmin: boolean;
  profileDisplayName: string;
  clientTenant: { id: string; name: string } | null;
};

export async function getUserAppContext(): Promise<UserAppContext | null> {
  const session = await getSession();
  if (!session) return null;

  const supabase = await createClient();
  const admin = await isPlatformAdmin(session.userId);

  const { data: profile } = await supabase
    .schema("app")
    .from("profiles")
    .select("display_name")
    .eq("user_id", session.userId)
    .maybeSingle();

  const { data: memberships } = await supabase
    .schema("app")
    .from("tenant_memberships")
    .select("tenant_id, role, tenant:tenants(name)")
    .eq("user_id", session.userId)
    .is("revoked_at", null);

  let clientTenant: { id: string; name: string } | null = null;
  if (!admin && memberships?.length) {
    const clientMemberships = memberships.filter((m) => m.role === "client");
    if (clientMemberships.length === 1) {
      const raw = clientMemberships[0].tenant;
      const t = (Array.isArray(raw) ? raw[0] : raw) as { name: string } | null;
      clientTenant = {
        id: clientMemberships[0].tenant_id,
        name: t?.name ?? "Klant",
      };
    }
  }

  return {
    session,
    isPlatformAdmin: admin,
    profileDisplayName: profile?.display_name ?? session.email ?? "Gebruiker",
    clientTenant,
  };
}
