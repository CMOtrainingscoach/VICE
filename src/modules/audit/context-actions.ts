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
const STORE_MIGRATION = "De audit staat opgeslagen, maar een goedgekeurde brand audit kan het contextbestand nog niet aanmaken. Pas migratie 20260330134000 toe in de Supabase SQL-editor, na 20260330133900.";

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

export type ContextFileDraft = {
  markdown: string;
  savedAt: string | null;
  status: "draft" | "final" | null;
};

export async function loadContextEditorAction(tenantId: string): Promise<ActionResult<ContextFileDraft>> {
  const existing = await loadAuditContextAction(tenantId);
  if (!existing.ok) return existing;
  if (existing.data?.markdown) {
    return {
      ok: true,
      data: { markdown: existing.data.markdown, savedAt: existing.data.savedAt, status: existing.data.status },
    };
  }
  const supabase = await client();
  const progress = await supabase.schema("app").rpc("get_audit_framework_progress", { p_tenant_id: tenantId });
  if (!Boolean((progress.data as { brand_started?: boolean } | null)?.brand_started)) {
    return { ok: true, data: { markdown: "", savedAt: null, status: null } };
  }
  const brand = await loadBrandWorkbenchAction(tenantId);
  if (!brand.ok || !brand.data) return { ok: false, error: brand.ok ? "De audit kon niet worden gelezen." : brand.error };
  const built = await buildStoredAuditMarkdown(tenantId, brand.data.version.id);
  if (!built.ok || !built.data) return built.ok ? { ok: false, error: "De audit kon niet worden gelezen." } : built;
  return { ok: true, data: { markdown: built.data.markdown, savedAt: null, status: null } };
}

export async function saveContextFileAction(tenantId: string, markdown: string): Promise<ActionResult<ContextFileDraft>> {
  const text = markdown.trim();
  if (text.length < 40) return { ok: false, error: "Het bestand is te kort om op te slaan." };
  if (text.length > 500_000) return { ok: false, error: "Deze tekst is te lang." };
  const supabase = await client();
  const saved = await supabase.schema("app").rpc("save_strategy_context", {
    p_tenant_id: tenantId,
    p_markdown: text,
  });
  if (!saved.error) {
    revalidateContext(tenantId);
    const row = saved.data as { saved_at?: string; status?: string } | null;
    return {
      ok: true,
      data: { markdown: text, savedAt: row?.saved_at ?? new Date().toISOString(), status: row?.status === "final" ? "final" : "draft" },
    };
  }
  if (!/save_strategy_context|schema cache|does not exist|Could not find the function/i.test(saved.error.message)) {
    return { ok: false, error: saved.error.message };
  }
  const fallback = await saveContextFileFallback(tenantId, text);
  if (fallback.ok) revalidateContext(tenantId);
  return fallback;
}

function revalidateContext(tenantId: string) {
  revalidatePath(`/klanten/${tenantId}/strategie/context`);
  revalidatePath(`/klanten/${tenantId}/strategie/${BRAND_ROUTE}`);
  revalidatePath(`/klanten/${tenantId}/brand`);
}

async function saveContextFileFallback(tenantId: string, text: string): Promise<ActionResult<ContextFileDraft>> {
  const supabase = await client();
  const progress = await supabase.schema("app").rpc("get_audit_framework_progress", { p_tenant_id: tenantId });
  const started = Boolean((progress.data as { brand_started?: boolean } | null)?.brand_started);
  if (!started) {
    const pasted = await storePastedAuditMarkdownAction(tenantId, text);
    if (!pasted.ok) return pasted;
    return { ok: true, data: { markdown: text, savedAt: new Date().toISOString(), status: "draft" } };
  }
  const brand = await loadBrandWorkbenchAction(tenantId);
  if (!brand.ok || !brand.data) return { ok: false, error: brand.ok ? "Geen brand audit om het bestand aan te koppelen." : brand.error };
  const current = await loadAuditContextAction(tenantId);
  if (!current.ok) return current;
  if (brand.data.version.status === "approved" && current.data?.markdown) {
    return { ok: false, error: "Pas migratie 20260330134200 toe in de Supabase SQL-editor, na 20260330134100. Dan kan een goedgekeurde audit het contextbestand bijwerken." };
  }
  if (brand.data.version.status !== "approved") {
    const saved = await supabase.schema("app").rpc("save_audit_context", {
      p_version_id: brand.data.version.id,
      p_markdown: text,
    });
    if (saved.error) return { ok: false, error: migrationError(saved.error.message) };
    const row = saved.data as { saved_at?: string } | null;
    return { ok: true, data: { markdown: text, savedAt: row?.saved_at ?? new Date().toISOString(), status: "draft" } };
  }
  const stored = await supabase.schema("app").rpc("store_audit_context_if_missing", {
    p_version_id: brand.data.version.id,
    p_markdown: text,
  });
  if (stored.error) {
    return {
      ok: false,
      error: /store_audit_context_if_missing|schema cache|does not exist|Could not find the function/i.test(stored.error.message)
        ? "Pas migratie 20260330134200 toe in de Supabase SQL-editor, na 20260330134100."
        : stored.error.message,
    };
  }
  const row = stored.data as { saved_at?: string; status?: string } | null;
  return {
    ok: true,
    data: { markdown: text, savedAt: row?.saved_at ?? new Date().toISOString(), status: row?.status === "final" ? "final" : "draft" },
  };
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
  const built = await buildStoredAuditMarkdown(tenantId, parsed.data.versionId);
  if (!built.ok || !built.data) return built.ok ? { ok: false, error: "Geen brand audit." } : built;
  const supabase = await client();
  const saved = await supabase.schema("app").rpc("save_audit_context", {
    p_version_id: parsed.data.versionId,
    p_markdown: built.data.markdown,
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
      markdown: built.data.markdown,
      status: row?.status === "final" ? "final" : "draft",
      savedAt: row?.saved_at ?? null,
      finalizedAt: row?.finalized_at ?? null,
    },
  };
}

export async function ensureStoredAuditContextAction(tenantId: string): Promise<ActionResult<boolean>> {
  const supabase = await client();
  const progressResult = await supabase.schema("app").rpc("get_audit_framework_progress", { p_tenant_id: tenantId });
  if (progressResult.error) return { ok: false, error: progressResult.error.message };
  const progress = (progressResult.data ?? {}) as {
    pestel_approved?: boolean;
    porter_approved?: boolean;
    five_c_approved?: boolean;
    swot_approved?: boolean;
    vrio_approved?: boolean;
    bcg_approved?: boolean;
    value_chain_approved?: boolean;
    value_chain_started?: boolean;
    stp_approved?: boolean;
    stp_started?: boolean;
    persona_approved?: boolean;
    persona_started?: boolean;
    brand_approved?: boolean;
    brand_started?: boolean;
  };
  if (!progress.brand_started) return { ok: true, data: false };
  const presenceResult = await supabase.schema("app").rpc("audit_framework_presence", { p_tenant_id: tenantId });
  const presence = presenceResult.error ? null : (presenceResult.data ?? {}) as Presence;
  const brand = await loadBrandWorkbenchAction(tenantId);
  if (!brand.ok || !brand.data) return { ok: false, error: brand.ok ? "Geen brand audit." : brand.error };
  if (brand.data.version.status === "not_started" && !hasOtherFramework(presence, progress)) return { ok: true, data: false };

  const built = await buildStoredAuditMarkdown(tenantId, brand.data.version.id);
  if (!built.ok || !built.data) return built.ok ? { ok: false, error: "De audit kon niet worden gelezen." } : built;
  if (brand.data.version.status !== "approved") {
    const saved = await supabase.schema("app").rpc("save_audit_context", {
      p_version_id: brand.data.version.id,
      p_markdown: built.data.markdown,
    });
    if (saved.error) return { ok: false, error: migrationError(saved.error.message) };
    return { ok: true, data: true };
  }
  const stored = await supabase.schema("app").rpc("store_audit_context_if_missing", {
    p_version_id: brand.data.version.id,
    p_markdown: built.data.markdown,
  });
  if (!stored.error) return { ok: true, data: true };
  if (/store_audit_context_if_missing|schema cache|does not exist|Could not find the function/i.test(stored.error.message)) {
    return { ok: false, error: STORE_MIGRATION };
  }
  return { ok: false, error: stored.error.message };
}

export async function storePastedAuditMarkdownAction(tenantId: string, markdown: string): Promise<ActionResult<{ id: string }>> {
  const text = markdown.trim();
  if (text.length < 40) return { ok: false, error: "Plak de markdown van de audit." };
  if (text.length > 500_000) return { ok: false, error: "Deze tekst is te lang." };
  const supabase = await client();
  const pasted = await supabase.schema("app").rpc("store_pasted_audit_markdown", {
    p_tenant_id: tenantId,
    p_markdown: text,
  });
  if (!pasted.error && pasted.data) return { ok: true, data: { id: String(pasted.data) } };
  if (pasted.error && !/store_pasted_audit_markdown|schema cache|does not exist|Could not find the function/i.test(pasted.error.message)) {
    return { ok: false, error: pasted.error.message };
  }

  const brand = await loadBrandWorkbenchAction(tenantId);
  if (!brand.ok || !brand.data) return { ok: false, error: brand.ok ? "Geen brand audit om de tekst aan te koppelen." : brand.error };
  const before = await supabase.schema("app").rpc("get_brand_profile", { p_tenant_id: tenantId });
  const existingId = documentIdForVersion(before.data, brand.data.version.id);
  if (existingId) {
    const current = await supabase.schema("app").rpc("get_brand_profile_document", { p_document_id: existingId });
    const stored = current.data && typeof current.data === "object" ? String((current.data as { markdown?: string }).markdown ?? "") : "";
    if (stored.trim() === text) return { ok: true, data: { id: existingId } };
    return { ok: false, error: "Er is al een auditbestand. Pas migratie 20260330134100 toe in de Supabase SQL-editor, na 20260330134000, om een geplakte tekst apart te bewaren." };
  }
  if (brand.data.version.status !== "approved") {
    const saved = await supabase.schema("app").rpc("save_audit_context", {
      p_version_id: brand.data.version.id,
      p_markdown: text,
    });
    if (saved.error) return { ok: false, error: migrationError(saved.error.message) };
  } else {
    const stored = await supabase.schema("app").rpc("store_audit_context_if_missing", {
      p_version_id: brand.data.version.id,
      p_markdown: text,
    });
    if (stored.error) {
      return {
        ok: false,
        error: /store_audit_context_if_missing|schema cache|does not exist|Could not find the function/i.test(stored.error.message)
          ? "Pas migratie 20260330134100 toe in de Supabase SQL-editor, na 20260330134000."
          : stored.error.message,
      };
    }
  }
  const after = await supabase.schema("app").rpc("get_brand_profile", { p_tenant_id: tenantId });
  const id = documentIdForVersion(after.data, brand.data.version.id);
  if (!id) return { ok: false, error: "De geplakte tekst is niet teruggevonden." };
  return { ok: true, data: { id } };
}

function documentIdForVersion(data: unknown, versionId: string): string | null {
  if (!data || typeof data !== "object" || !("documents" in data)) return null;
  const documents = (data as { documents?: unknown }).documents;
  if (!Array.isArray(documents)) return null;
  const match = documents.find((item) => {
    if (!item || typeof item !== "object") return false;
    return String((item as { brandVersionId?: string }).brandVersionId) === versionId;
  });
  if (!match || typeof match !== "object" || !("id" in match)) return null;
  return String((match as { id: unknown }).id);
}

function hasOtherFramework(presence: Presence | null, progress: { pestel_approved?: boolean; porter_approved?: boolean; five_c_approved?: boolean; swot_approved?: boolean; vrio_approved?: boolean; bcg_approved?: boolean; value_chain_started?: boolean; stp_started?: boolean; persona_started?: boolean }): boolean {
  return Boolean(
    presence?.pestel || presence?.porter || presence?.five_c || presence?.swot || presence?.vrio || presence?.bcg || presence?.value_chain || presence?.stp || presence?.persona
    || progress.pestel_approved || progress.porter_approved || progress.five_c_approved || progress.swot_approved || progress.vrio_approved
    || progress.bcg_approved || progress.value_chain_started || progress.stp_started || progress.persona_started,
  );
}

async function buildStoredAuditMarkdown(tenantId: string, versionId: string): Promise<ActionResult<{ markdown: string }>> {
  const supabase = await client();
  const presenceResult = await supabase.schema("app").rpc("audit_framework_presence", { p_tenant_id: tenantId });
  if (presenceResult.error) return { ok: false, error: migrationError(presenceResult.error.message) };
  const presence = (presenceResult.data ?? {}) as Presence;
  const brand = await loadBrandWorkbenchAction(tenantId, versionId);
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
  return { ok: true, data: { markdown } };
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
