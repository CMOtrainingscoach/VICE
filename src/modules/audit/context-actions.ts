"use server";

import { revalidatePath } from "next/cache";
import { buildAuditContextMarkdown, type FrameworkLoad } from "@/lib/audit/context-markdown";
import { BRAND_ROUTE } from "@/lib/brand/constants";
import { requirePlatformAdminMfa, requireSession } from "@/lib/auth/session";
import { formatZodIssue } from "@/lib/pestel/zod-form";
import { createClient } from "@/lib/supabase/server";
import { approveBrandAction, loadBrandWorkbenchAction } from "@/modules/brand/actions";
import { brandExpectedSchema } from "@/modules/brand/schema";
import { loadBcgWorkbenchAction } from "@/modules/bcg/actions";
import { loadFiveCWorkbenchAction } from "@/modules/marketing-5c/actions";
import { loadPersonaWorkbenchAction } from "@/modules/persona/actions";
import { loadPestelWorkbenchAction } from "@/modules/pestel/actions";
import { loadPorterWorkbenchAction } from "@/modules/porter/actions";
import { loadStpWorkbenchAction } from "@/modules/stp/actions";
import { loadSwotWorkbenchAction } from "@/modules/swot/actions";
import { loadValueChainWorkbenchAction } from "@/modules/value-chain/actions";
import { loadVrioWorkbenchAction } from "@/modules/vrio/actions";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

export type AuditContextDocument = {
  markdown: string;
  status: "draft" | "final";
  savedAt: string | null;
  finalizedAt: string | null;
};

const CONTEXT_MIGRATION = "Pas migratie 20260330133700 toe in de Supabase SQL-editor, na 20260330133600.";

type Presence = {
  name?: string;
  website?: string;
  audit_goal?: string;
  pestel?: boolean;
  porter?: boolean;
  five_c?: boolean;
  swot?: boolean;
  vrio?: boolean;
  bcg?: boolean;
  value_chain?: boolean;
  stp?: boolean;
  persona?: boolean;
};

function migrationError(message: string): string {
  return /audit_framework_presence|save_audit_context|finalize_audit_context|get_audit_context|schema cache|does not exist|Could not find the function|Onbekende stap|current_step/i.test(message)
    ? CONTEXT_MIGRATION
    : message;
}

function asDocument(raw: { markdown?: string; status?: string; saved_at?: string | null; finalized_at?: string | null } | null): AuditContextDocument | null {
  if (!raw?.markdown) return null;
  return {
    markdown: raw.markdown,
    status: raw.status === "final" ? "final" : "draft",
    savedAt: raw.saved_at ?? null,
    finalizedAt: raw.finalized_at ?? null,
  };
}

async function client() {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);
  return createClient();
}

export async function loadAuditContextAction(tenantId: string): Promise<ActionResult<AuditContextDocument | null>> {
  const supabase = await client();
  const { data, error } = await supabase.schema("app").rpc("get_audit_context", { p_tenant_id: tenantId });
  if (error) {
    if (migrationError(error.message) === CONTEXT_MIGRATION) return { ok: true, data: null };
    return { ok: false, error: error.message };
  }
  return { ok: true, data: asDocument(data as { markdown?: string; status?: string; saved_at?: string | null; finalized_at?: string | null } | null) };
}

async function optional<T>(present: boolean, load: () => Promise<ActionResult<T>>): Promise<FrameworkLoad<T>> {
  if (!present) return { state: "missing" };
  const result = await load();
  if (!result.ok || !result.data) return { state: "error", error: result.ok ? "Geen data" : result.error };
  return { state: "ready", data: result.data };
}

function remember(target: Map<string, { title: string; text: string }>, title: string, text: string) {
  const body = text.trim();
  if (!body) return;
  const key = `${title.trim()}\n${body}`;
  if (!target.has(key)) target.set(key, { title: title.trim() || "Gesprek", text: body });
}

export async function saveAuditContextAction(tenantId: string, input: unknown): Promise<ActionResult<AuditContextDocument>> {
  const parsed = brandExpectedSchema.pick({ versionId: true }).safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const supabase = await client();
  const presenceResult = await supabase.schema("app").rpc("audit_framework_presence", { p_tenant_id: tenantId });
  if (presenceResult.error) return { ok: false, error: migrationError(presenceResult.error.message) };
  const presence = (presenceResult.data ?? {}) as Presence;
  const brand = await loadBrandWorkbenchAction(tenantId, parsed.data.versionId);
  if (!brand.ok || !brand.data) return { ok: false, error: brand.ok ? "Geen brand audit." : brand.error };

  const [pestel, porter, fiveC, swot, vrio, bcg, valueChain, stp, persona] = await Promise.all([
    optional(Boolean(presence.pestel), () => loadPestelWorkbenchAction(tenantId)),
    optional(Boolean(presence.porter), () => loadPorterWorkbenchAction(tenantId)),
    optional(Boolean(presence.five_c), () => loadFiveCWorkbenchAction(tenantId)),
    optional(Boolean(presence.swot), () => loadSwotWorkbenchAction(tenantId)),
    optional(Boolean(presence.vrio), () => loadVrioWorkbenchAction(tenantId)),
    optional(Boolean(presence.bcg), () => loadBcgWorkbenchAction(tenantId)),
    optional(Boolean(presence.value_chain), () => loadValueChainWorkbenchAction(tenantId)),
    optional(Boolean(presence.stp), () => loadStpWorkbenchAction(tenantId)),
    optional(Boolean(presence.persona), () => loadPersonaWorkbenchAction(tenantId)),
  ]);

  const meetings = new Map<string, { title: string; text: string }>();
  const documents = new Map<string, { label: string; excerpt: string }>();
  if (swot.state === "ready") swot.data.inputs.meetings.forEach((meeting) => remember(meetings, meeting.title, meeting.text));
  if (fiveC.state === "ready") fiveC.data.inputs.meetings.forEach((meeting) => remember(meetings, meeting.title, meeting.text));
  if (vrio.state === "ready") {
    vrio.data.inputs.meetings.forEach((meeting) => remember(meetings, meeting.title, meeting.text));
    vrio.data.inputs.documents.forEach((document) => documents.set(`${document.label}\n${document.excerpt}`, { label: document.label, excerpt: document.excerpt }));
  }
  if (valueChain.state === "ready") {
    valueChain.data.inputs.meetings.forEach((meeting) => remember(meetings, meeting.title, meeting.text));
    valueChain.data.inputs.documents.forEach((document) => documents.set(`${document.label}\n${document.excerpt}`, { label: document.label, excerpt: document.excerpt }));
  }
  if (stp.state === "ready") stp.data.inputs.meetings.forEach((meeting) => remember(meetings, meeting.title, meeting.text));
  if (persona.state === "ready") persona.data.inputs.meetings.forEach((meeting) => remember(meetings, meeting.title, meeting.text));
  if (pestel.state === "ready") {
    pestel.data.researchInputs.forEach((inputRow) => {
      if (inputRow.kind === "meeting") remember(meetings, inputRow.label, inputRow.excerpt);
      else documents.set(`${inputRow.label}\n${inputRow.excerpt}`, { label: inputRow.label, excerpt: inputRow.excerpt });
    });
  }

  const markdown = buildAuditContextMarkdown({
    company: {
      name: presence.name || brand.data.tenant.name,
      website: presence.website || brand.data.tenant.website || brand.data.version.website_url,
      auditGoal: presence.audit_goal ?? "",
    },
    savedAt: new Date().toISOString(),
    meetings: [...meetings.values()],
    documents: [...documents.values()],
    pestel,
    porter,
    fiveC,
    swot,
    vrio,
    bcg,
    valueChain,
    stp,
    persona,
    brand: brand.data,
  });

  const saved = await supabase.schema("app").rpc("save_audit_context", {
    p_version_id: parsed.data.versionId,
    p_markdown: markdown,
  });
  if (saved.error) return { ok: false, error: migrationError(saved.error.message) };
  const stepped = await supabase.schema("app").rpc("set_brand_step", {
    p_version_id: parsed.data.versionId,
    p_step: "overview",
  });
  if (stepped.error) return { ok: false, error: migrationError(stepped.error.message) };
  revalidatePath(`/klanten/${tenantId}/strategie/${BRAND_ROUTE}`);
  const row = saved.data as { status?: string; saved_at?: string | null; finalized_at?: string | null } | null;
  return {
    ok: true,
    data: {
      markdown,
      status: row?.status === "final" ? "final" : "draft",
      savedAt: row?.saved_at ?? null,
      finalizedAt: row?.finalized_at ?? null,
    },
  };
}

export async function finalizeAuditContextAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = brandExpectedSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const current = await loadAuditContextAction(tenantId);
  if (!current.ok) return current;
  if (!current.data?.markdown) return { ok: false, error: "Bewaar eerst het overzicht." };
  const supabase = await client();
  const finalized = await supabase.schema("app").rpc("finalize_audit_context", { p_version_id: parsed.data.versionId });
  if (finalized.error) return { ok: false, error: migrationError(finalized.error.message) };
  const approved = await approveBrandAction(tenantId, parsed.data);
  if (!approved.ok) {
    await supabase.schema("app").rpc("save_audit_context", {
      p_version_id: parsed.data.versionId,
      p_markdown: current.data.markdown,
    });
    return approved;
  }
  revalidatePath(`/klanten/${tenantId}/strategie/${BRAND_ROUTE}`);
  return { ok: true };
}
