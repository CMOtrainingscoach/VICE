"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdminMfa, requireSession } from "@/lib/auth/session";
import { parseAuditMarkdown } from "@/lib/brand-profile/parse-audit-markdown";
import { mapBrandProfile } from "@/lib/brand-profile/map";
import { sanitizeSvg } from "@/lib/brand-profile/svg";
import { BRAND_PROFILE_MIGRATION, type BrandProfileEmpty, type BrandProfilePublished, type BrandProfileView, type BrandProfileWorkbench, type SourceDocument } from "@/lib/brand-profile/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ensureStoredAuditContextAction, storePastedAuditMarkdownAction } from "@/modules/audit/context-actions";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const MISSING = /get_brand_profile|start_brand_profile|apply_brand_profile_import|save_brand_profile|brand_profile|schema cache|does not exist|Could not find the function/i;

function migration(message: string): string {
  return MISSING.test(message) ? BRAND_PROFILE_MIGRATION : message;
}

async function authed() {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);
  return createClient();
}

export async function loadBrandProfileAction(tenantId: string): Promise<ActionResult<BrandProfileView>> {
  const supabase = await authed();
  const loaded = await readProfile(supabase, tenantId);
  if (!loaded.ok || !loaded.data) return loaded;
  const profile = loaded.data;
  if (profile.access === "published") return { ok: true, data: await signProfile(profile) };
  if (profile.version) return { ok: true, data: await signProfile(profile) };
  let current = profile;
  if (current.documents.length === 0) {
    const ensured = await ensureStoredAuditContextAction(tenantId);
    if (!ensured.ok) return ensured;
    if (ensured.data) {
      const refreshed = await readProfile(supabase, tenantId);
      if (!refreshed.ok || !refreshed.data) return refreshed.ok ? { ok: false, error: "Merkprofiel laden mislukt" } : refreshed;
      if (refreshed.data.access !== "edit") return { ok: true, data: await signProfile(refreshed.data) };
      current = refreshed.data;
      if (current.version) return { ok: true, data: await signProfile(current) };
    }
  }
  const chosen = chooseDocument(current.documents);
  if (!chosen) {
    return { ok: true, data: { ...current, mode: current.documents.length > 1 ? "choose" : "empty" } };
  }
  const started = await supabase.schema("app").rpc("start_brand_profile", { p_tenant_id: tenantId });
  if (started.error || !started.data) return { ok: false, error: migration(started.error?.message ?? "Merkprofiel starten mislukt") };
  const imported = await importDocument(supabase, tenantId, String(started.data), null, chosen.id);
  if (!imported.ok) return imported;
  const again = await readProfile(supabase, tenantId);
  if (!again.ok || !again.data) return again.ok ? { ok: false, error: "Merkprofiel laden mislukt" } : again;
  return { ok: true, data: await signProfile(again.data) };
}

export async function importPastedBrandMarkdownAction(tenantId: string, markdown: string): Promise<ActionResult> {
  const stored = await storePastedAuditMarkdownAction(tenantId, markdown);
  if (!stored.ok || !stored.data) return stored.ok ? { ok: false, error: "De geplakte tekst is niet bewaard." } : stored;
  return startBrandProfileAction(tenantId, stored.data.id);
}

export async function startBrandProfileAction(tenantId: string, documentId?: string): Promise<ActionResult> {
  const supabase = await authed();
  const started = await supabase.schema("app").rpc("start_brand_profile", { p_tenant_id: tenantId });
  if (started.error || !started.data) return { ok: false, error: migration(started.error?.message ?? "Starten mislukt") };
  if (documentId) {
    const versionId = String(started.data);
    const current = await readProfile(supabase, tenantId);
    if (!current.ok || !current.data) return { ok: false, error: current.ok ? "Merkprofiel laden mislukt" : current.error };
    const profile = current.data;
    if (profile.access === "edit" && profile.version && profile.version.status !== "draft") {
      const forked = await supabase.schema("app").rpc("fork_brand_profile", { p_version_id: versionId });
      if (forked.error || !forked.data) return { ok: false, error: migration(forked.error?.message ?? "Nieuwe conceptversie mislukt") };
      const imported = await importDocument(supabase, tenantId, String(forked.data), null, documentId);
      if (!imported.ok) return imported;
    } else {
      const imported = await importDocument(supabase, tenantId, versionId, null, documentId);
      if (!imported.ok) return imported;
    }
  }
  revalidatePath(`/klanten/${tenantId}/brand`);
  return { ok: true };
}

export async function discardAuditContextDocumentAction(tenantId: string, documentId: string): Promise<ActionResult> {
  const supabase = await authed();
  const removed = await supabase.schema("app").rpc("discard_audit_context_document", {
    p_tenant_id: tenantId,
    p_document_id: documentId,
  });
  if (removed.error) {
    return {
      ok: false,
      error: /discard_audit_context_document|schema cache|does not exist|Could not find the function/i.test(removed.error.message)
        ? "Pas migratie 20260330134300 toe in de Supabase SQL-editor, na 20260330134200."
        : removed.error.message,
    };
  }
  revalidatePath(`/klanten/${tenantId}/brand`);
  revalidatePath(`/klanten/${tenantId}/strategie/context`);
  return { ok: true };
}

export async function saveBrandProfileAction(tenantId: string, versionId: string, expectedUpdatedAt: string, patch: unknown): Promise<ActionResult> {
  const supabase = await authed();
  const saved = await supabase.schema("app").rpc("save_brand_profile_fields", {
    p_version_id: versionId,
    p_expected: expectedUpdatedAt,
    p_patch: patch,
  });
  if (saved.error) return { ok: false, error: migration(saved.error.message) };
  revalidatePath(`/klanten/${tenantId}/brand`);
  return { ok: true };
}

export async function saveBrandColorAction(tenantId: string, versionId: string, expectedUpdatedAt: string, color: unknown): Promise<ActionResult> {
  return call(tenantId, "upsert_brand_profile_color", { p_version_id: versionId, p_expected: expectedUpdatedAt, p_color: color });
}

export async function saveBrandStyleAction(tenantId: string, versionId: string, expectedUpdatedAt: string, style: unknown): Promise<ActionResult> {
  return call(tenantId, "upsert_brand_profile_style", { p_version_id: versionId, p_expected: expectedUpdatedAt, p_style: style });
}

export async function archiveBrandItemAction(tenantId: string, versionId: string, expectedUpdatedAt: string, kind: string, id: string): Promise<ActionResult> {
  return call(tenantId, "archive_brand_profile_item", { p_version_id: versionId, p_expected: expectedUpdatedAt, p_kind: kind, p_id: id });
}

export async function saveBrandAssetMetaAction(tenantId: string, versionId: string, expectedUpdatedAt: string, asset: unknown): Promise<ActionResult> {
  return call(tenantId, "update_brand_profile_asset", { p_version_id: versionId, p_expected: expectedUpdatedAt, p_asset: asset });
}

export async function saveBrandPromptAction(tenantId: string, versionId: string, expectedUpdatedAt: string, prompt: unknown): Promise<ActionResult> {
  return call(tenantId, "upsert_brand_profile_prompt", { p_version_id: versionId, p_expected: expectedUpdatedAt, p_prompt: prompt });
}

export async function resolveBrandReviewAction(tenantId: string, versionId: string, expectedUpdatedAt: string, reviewId: string, decision: string, value: string): Promise<ActionResult> {
  return call(tenantId, "resolve_brand_profile_review", {
    p_version_id: versionId,
    p_expected: expectedUpdatedAt,
    p_review_id: reviewId,
    p_decision: decision,
    p_value: value,
  });
}

export async function approveBrandProfileAction(tenantId: string, versionId: string, expectedUpdatedAt: string): Promise<ActionResult> {
  return call(tenantId, "approve_brand_profile", { p_version_id: versionId, p_expected: expectedUpdatedAt });
}

export async function publishBrandProfileAction(tenantId: string, versionId: string): Promise<ActionResult> {
  return call(tenantId, "publish_brand_profile", { p_version_id: versionId });
}

export async function forkBrandProfileAction(tenantId: string, versionId: string): Promise<ActionResult> {
  return call(tenantId, "fork_brand_profile", { p_version_id: versionId });
}

export async function compareBrandSourceAction(tenantId: string, versionId: string, expectedUpdatedAt: string, documentId: string): Promise<ActionResult> {
  const supabase = await authed();
  const current = await readProfile(supabase, tenantId);
  if (!current.ok || !current.data || current.data.access !== "edit" || !current.data.version) return { ok: false, error: "Geen concept om te vergelijken" };
  const profile = current.data;
  const document = await supabase.schema("app").rpc("get_brand_profile_document", { p_document_id: documentId });
  if (document.error || !document.data) return { ok: false, error: migration(document.error?.message ?? "Bron niet gevonden") };
  const row = document.data as { tenantId?: string; markdown?: string };
  if (row.tenantId !== tenantId) return { ok: false, error: "Dit document hoort bij een andere klant." };
  const parsed = parseAuditMarkdown(String(row.markdown ?? ""));
  const version = profile.version;
  const reviews = [
    ...parsed.reviews.map((item) => ({ ...item, label: `Nieuwe bron · ${item.label}` })),
    ...parsed.fields.filter((field) => currentValue(version, field.key) && currentValue(version, field.key) !== field.value).map((field) => ({
      section: "overview",
      label: `Nieuwe bronwaarde · ${field.key}`,
      origin: "established" as const,
      sectionPath: field.sectionPath,
      passage: `Eerder: ${currentValue(version, field.key)}\nNieuw: ${field.value}\n${field.passage}`,
      proposal: { kind: "field" as const, key: field.key, value: field.value },
    })),
  ];
  const removed = profile.provenance.filter((item) => item.passage && !String(row.markdown ?? "").includes(item.passage));
  for (const item of removed) {
    reviews.push({
      section: "overview",
      label: "Bron vermeldt dit niet meer",
      origin: "unknown",
      sectionPath: item.sectionPath,
      passage: item.passage,
      proposal: null,
    });
  }
  const staged = await supabase.schema("app").rpc("insert_brand_profile_reviews", {
    p_version_id: versionId,
    p_expected: expectedUpdatedAt,
    p_reviews: reviews,
  });
  if (staged.error) return { ok: false, error: migration(staged.error.message) };
  revalidatePath(`/klanten/${tenantId}/brand`);
  return { ok: true };
}

export async function loadBrandSourceAction(tenantId: string, documentId: string): Promise<ActionResult<{ markdown: string; status: string }>> {
  const supabase = await authed();
  const document = await supabase.schema("app").rpc("get_brand_profile_document", { p_document_id: documentId });
  if (document.error || !document.data) return { ok: false, error: migration(document.error?.message ?? "Bron niet gevonden") };
  const row = document.data as { tenantId?: string; markdown?: string; status?: string };
  if (row.tenantId !== tenantId) return { ok: false, error: "Dit document hoort bij een andere klant." };
  return { ok: true, data: { markdown: String(row.markdown ?? ""), status: String(row.status ?? "") } };
}

export async function uploadBrandFileAction(tenantId: string, formData: FormData): Promise<ActionResult> {
  const versionId = String(formData.get("versionId") ?? "");
  const expected = String(formData.get("expectedUpdatedAt") ?? "");
  const kind = String(formData.get("kind") ?? "");
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Kies een bestand." };
  if (file.size <= 0 || file.size > 8 * 1024 * 1024) return { ok: false, error: "Gebruik een bestand tot 8 MB." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniff(bytes, kind);
  if (!sniffed) return { ok: false, error: kind === "font" ? "Gebruik een WOFF- of WOFF2-bestand." : "Gebruik SVG, PNG, JPEG of WebP." };
  if (sniffed.ext === "svg") {
    const clean = sanitizeSvg(new TextDecoder().decode(bytes));
    if (!clean) return { ok: false, error: "Deze SVG is niet bruikbaar." };
    const encoded = new TextEncoder().encode(clean);
    return storeFile(tenantId, versionId, expected, kind, encoded, sniffed, formData);
  }
  return storeFile(tenantId, versionId, expected, kind, bytes, sniffed, formData);
}

async function storeFile(tenantId: string, versionId: string, expected: string, kind: string, bytes: Uint8Array, sniffed: { ext: string; mime: string }, formData: FormData): Promise<ActionResult> {
  if (kind === "font" && formData.get("useConfirmed") !== "true") return { ok: false, error: "Bevestig dat dit font gebruikt mag worden." };
  const path = `${tenantId}/${versionId}/${crypto.randomUUID()}.${sniffed.ext}`;
  const admin = createAdminClient();
  const uploaded = await admin.storage.from("brand-kit").upload(path, bytes, { contentType: sniffed.mime, upsert: false });
  if (uploaded.error) return { ok: false, error: /mime|brand-kit|bucket/i.test(uploaded.error.message) ? BRAND_PROFILE_MIGRATION : uploaded.error.message };
  const supabase = await authed();
  const registered = await supabase.schema("app").rpc("register_brand_profile_file", {
    p_version_id: versionId,
    p_expected: expected,
    p_kind: kind,
    p_file: {
      path,
      name: String(formData.get("name") ?? ""),
      kind: String(formData.get("assetKind") ?? "primary"),
      weights: String(formData.get("weights") ?? ""),
      italic: formData.get("italic") === "true",
      variable: formData.get("variable") === "true",
      licenseNote: String(formData.get("licenseNote") ?? ""),
      exportAllowed: formData.get("exportAllowed") === "true",
      useConfirmed: true,
      format: sniffed.ext,
      referenceStatus: String(formData.get("referenceStatus") ?? "official"),
    },
  });
  if (registered.error) {
    await admin.storage.from("brand-kit").remove([path]);
    return { ok: false, error: migration(registered.error.message) };
  }
  revalidatePath(`/klanten/${tenantId}/brand`);
  return { ok: true };
}

async function call(tenantId: string, fn: string, args: Record<string, unknown>): Promise<ActionResult> {
  const supabase = await authed();
  const result = await supabase.schema("app").rpc(fn, args);
  if (result.error) return { ok: false, error: migration(result.error.message) };
  revalidatePath(`/klanten/${tenantId}/brand`);
  return { ok: true };
}

async function readProfile(supabase: Awaited<ReturnType<typeof createClient>>, tenantId: string): Promise<ActionResult<BrandProfileView>> {
  const result = await supabase.schema("app").rpc("get_brand_profile", { p_tenant_id: tenantId });
  if (result.error || !result.data) return { ok: false, error: migration(result.error?.message ?? "Merkprofiel laden mislukt") };
  const raw = result.data as { access?: string; empty?: boolean; tenantName?: string };
  if (raw.access === "published" && raw.empty) {
    return { ok: true, data: { access: "published", empty: true, tenantName: raw.tenantName ?? "" } };
  }
  return { ok: true, data: mapBrandProfile(result.data as Record<string, unknown>) };
}

async function importDocument(supabase: Awaited<ReturnType<typeof createClient>>, tenantId: string, versionId: string, expected: string | null, documentId: string): Promise<ActionResult> {
  const document = await supabase.schema("app").rpc("get_brand_profile_document", { p_document_id: documentId });
  if (document.error || !document.data) return { ok: false, error: migration(document.error?.message ?? "Bron niet gevonden") };
  const row = document.data as { tenantId?: string; markdown?: string };
  if (row.tenantId !== tenantId) return { ok: false, error: "Dit document hoort bij een andere klant." };
  const parsed = parseAuditMarkdown(String(row.markdown ?? ""));
  const applied = await supabase.schema("app").rpc("apply_brand_profile_import", {
    p_version_id: versionId,
    p_expected: expected,
    p_document_id: documentId,
    p_payload: parsed,
  });
  if (applied.error) return { ok: false, error: migration(applied.error.message) };
  return { ok: true };
}

function chooseDocument(documents: SourceDocument[]): SourceDocument | null {
  const finals = documents.filter((document) => document.status === "final");
  if (finals.length === 1) return finals[0];
  if (finals.length === 0 && documents.length === 1) return documents[0];
  return null;
}

function currentValue(version: BrandProfileWorkbench["version"], key: string): string {
  if (!version) return "";
  if (key === "brandName") return version.brandName;
  if (key === "essence") return version.essence;
  if (key === "positioning") return version.positioning;
  if (key === "promise") return version.promise;
  if (key === "audience") return version.audience;
  if (key === "values") return version.valuesText;
  if (key === "voice") return version.voice.summary;
  if (key === "visual") return version.visual.summary;
  return "";
}

async function signProfile<T extends BrandProfileView>(data: T): Promise<T> {
  if (data.access === "published" && data.empty) return data;
  const fonts = "fonts" in data ? data.fonts : [];
  const assets = "assets" in data ? data.assets : [];
  const paths = [...fonts, ...assets].map((item) => item.path).filter(Boolean);
  if (paths.length === 0) return data;
  try {
    const admin = createAdminClient();
    const signed = new Map<string, string>();
    for (const path of paths) {
      const url = await admin.storage.from("brand-kit").createSignedUrl(path, 60 * 60);
      if (url.data?.signedUrl) signed.set(path, url.data.signedUrl);
    }
    return {
      ...data,
      fonts: fonts.map((font) => ({ ...font, url: signed.get(font.path) ?? null })),
      assets: assets.map((asset) => ({ ...asset, url: signed.get(asset.path) ?? null })),
    };
  } catch {
    return data;
  }
}

function sniff(bytes: Uint8Array, kind: string): { ext: string; mime: string } | null {
  if (kind === "font") {
    const mark = String.fromCharCode(...bytes.slice(0, 4));
    if (mark === "wOFF") return { ext: "woff", mime: "font/woff" };
    if (mark === "wOF2") return { ext: "woff2", mime: "font/woff2" };
    return null;
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return { ext: "png", mime: "image/png" };
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return { ext: "jpg", mime: "image/jpeg" };
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return { ext: "webp", mime: "image/webp" };
  const head = new TextDecoder().decode(bytes.slice(0, 200)).trimStart().toLowerCase();
  if (head.startsWith("<svg") || head.startsWith("<?xml")) return { ext: "svg", mime: "image/svg+xml" };
  return null;
}
