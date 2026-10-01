"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession, requirePlatformAdminMfa } from "@/lib/auth/session";
import {
  createTenantSchema,
  deletionSchema,
  inviteSchema,
  updateTenantSchema,
} from "@/modules/clients/schema";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export async function createTenantAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createTenantSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Ongeldige invoer" };
  }

  const session = await requireSession();
  await requirePlatformAdminMfa(session);

  const supabase = await createClient();
  const { data, error } = await supabase.schema("app").rpc("create_tenant", {
    p_name: parsed.data.name,
    p_website: parsed.data.website || null,
    p_vat_number: parsed.data.vatNumber || null,
    p_contact_name: parsed.data.contactName || null,
    p_contact_email: parsed.data.contactEmail || null,
    p_audit_goal: parsed.data.auditGoal ?? "",
    p_language: parsed.data.language,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/klanten");
  const row = (Array.isArray(data) ? data[0] : data) as { id: string };
  return { ok: true, data: { id: row.id } };
}

export async function updateTenantAction(
  tenantId: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = updateTenantSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Ongeldige invoer" };
  }

  const session = await requireSession();
  await requirePlatformAdminMfa(session);

  const supabase = await createClient();
  const { error } = await supabase.schema("app").rpc("update_tenant", {
    p_tenant_id: tenantId,
    p_name: parsed.data.name,
    p_website: parsed.data.website || null,
    p_vat_number: parsed.data.vatNumber || null,
    p_contact_name: parsed.data.contactName || null,
    p_contact_email: parsed.data.contactEmail || null,
    p_audit_goal: parsed.data.auditGoal ?? "",
    p_language: parsed.data.language,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath(`/klanten/${tenantId}`);
  revalidatePath("/klanten");
  return { ok: true };
}

export async function archiveTenantAction(
  tenantId: string,
  archived: boolean,
): Promise<ActionResult> {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);

  const supabase = await createClient();
  const { error } = await supabase.schema("app").rpc("set_tenant_archived", {
    p_tenant_id: tenantId,
    p_archived: archived,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath(`/klanten/${tenantId}`);
  revalidatePath("/klanten");
  return { ok: true };
}

export async function requestDeletionAction(
  input: unknown,
): Promise<ActionResult> {
  const parsed = deletionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Bevestig met het woord VERWIJDER" };
  }

  const session = await requireSession();
  await requirePlatformAdminMfa(session);

  const supabase = await createClient();
  const { error } = await supabase.schema("app").rpc("request_tenant_deletion", {
    p_tenant_id: parsed.data.tenantId,
    p_confirm_phrase: parsed.data.confirmPhrase,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath(`/klanten/${parsed.data.tenantId}`);
  return { ok: true };
}

export async function createInviteAction(
  input: unknown,
): Promise<ActionResult<{ inviteLink: string }>> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Ongeldig e-mailadres" };
  }

  const session = await requireSession();
  await requirePlatformAdminMfa(session);

  const supabase = await createClient();
  const { data, error } = await supabase.schema("app").rpc("create_invite", {
    p_tenant_id: parsed.data.tenantId,
    p_email: parsed.data.email,
    p_role: "client",
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const row = Array.isArray(data) ? data[0] : data;
  const token = row?.raw_token as string | undefined;
  if (!token) {
    return { ok: false, error: "Uitnodiging kon niet worden aangemaakt" };
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return {
    ok: true,
    data: { inviteLink: `${base}/invite/${token}` },
  };
}

export async function acceptInviteAction(token: string): Promise<ActionResult<{ tenantId: string }>> {
  const session = await requireSession();
  void session;

  const supabase = await createClient();
  const { data, error } = await supabase.schema("app").rpc("accept_invite", {
    p_token: token,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, data: { tenantId: data as string } };
}

export async function bootstrapAdminAction(): Promise<ActionResult> {
  const session = await requireSession();
  const expected = process.env.VICE_BOOTSTRAP_ADMIN_USER_ID;

  if (expected && expected !== session.userId) {
    return { ok: false, error: "Dit account is niet geautoriseerd voor bootstrap." };
  }

  const supabase = await createClient();
  const { error } = await supabase.schema("app").rpc("bootstrap_platform_admin");

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
