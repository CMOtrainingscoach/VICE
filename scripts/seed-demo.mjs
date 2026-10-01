/**
 * Creates synthetic demo users and tenants. Never run against production with real data.
 * Usage: pnpm seed:demo
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
  console.error("Set SUPABASE_SERVICE_ROLE_KEY in .env.local (from: supabase status)");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_PASSWORD = "ViceDemo!2026";

async function ensureUser(email, displayName) {
  const { data: list } = await admin.auth.admin.listUsers();
  const existing = list.users.find((u) => u.email === email);
  if (existing) return existing.id;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (error) throw error;
  return data.user.id;
}

async function main() {
  const hardwigId = await ensureUser("hardwig.demo@vice.local", "Hardwig Demo");
  const clientId = await ensureUser("klant.demo@vice.local", "Klant Demo");

  const { count } = await admin
    .schema("app")
    .from("platform_admins")
    .select("*", { count: "exact", head: true });

  if ((count ?? 0) === 0) {
    await admin.schema("app").from("platform_admins").insert({ user_id: hardwigId });
  }

  const { data: existingTenant } = await admin
    .schema("app")
    .from("tenants")
    .select("id")
    .eq("name", "Studio Noord (demo)")
    .maybeSingle();

  let tenantId = existingTenant?.id;
  if (!tenantId) {
    const { data: tenant, error } = await admin
      .schema("app")
      .from("tenants")
      .insert({
        name: "Studio Noord (demo)",
        audit_goal: "Strategische positionering — synthetische demo",
        language: "nl",
        status: "collecting",
      })
      .select("id")
      .single();
    if (error) throw error;
    tenantId = tenant.id;
  }

  await admin.schema("app").from("tenant_memberships").upsert(
    [
      { tenant_id: tenantId, user_id: hardwigId, role: "admin", revoked_at: null },
      { tenant_id: tenantId, user_id: clientId, role: "client", revoked_at: null },
    ],
    { onConflict: "tenant_id,user_id" },
  );

  console.log("Demo seed OK.");
  console.log("Demo seed applied.");
  console.log(`Hardwig: hardwig.demo@vice.local / ${DEMO_PASSWORD}`);
  console.log(`Klant:   klant.demo@vice.local / ${DEMO_PASSWORD}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
