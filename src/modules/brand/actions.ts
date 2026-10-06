"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { describeUploadedVisual, proposeBrandAssessment, proposeBrandFindings, proposeSnapshotFindings } from "@/lib/brand/brand-ai";
import { BRAND_MIGRATION, BRAND_ROUTE, type PageRole } from "@/lib/brand/constants";
import { extractDocumentText } from "@/lib/brand/documents";
import { fetchPublicPageText } from "@/lib/brand/fetch-page";
import { capturePublicScreenshot } from "@/lib/brand/screenshot";
import { brandSearchConfigured, searchBrandMentions } from "@/lib/brand/mentions";
import { samePage, selectScanTargets } from "@/lib/brand/scan-plan";
import type { BrandDimension, BrandFinding, BrandPage, BrandPriority, BrandPublished, BrandSource, BrandWorkbench } from "@/lib/brand/types";
import { sniffPersonaPhoto } from "@/lib/persona/photo";
import { formatZodIssue } from "@/lib/pestel/zod-form";
import { requirePlatformAdminMfa, requireSession } from "@/lib/auth/session";
import { PERSONA_ROUTE } from "@/lib/persona/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  brandConclusionSchema,
  brandDimensionSchema,
  brandExpectedSchema,
  brandFindingSchema,
  brandIdSchema,
  brandPageSchema,
  brandPrioritySchema,
  brandSetupSchema,
  brandSourceMetaSchema,
  brandStepSchema,
  brandVersionSchema,
} from "@/modules/brand/schema";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const MAX_BYTES = 8 * 1024 * 1024;

function revalidateBrand(tenantId: string) {
  revalidatePath(`/klanten/${tenantId}/strategie/${BRAND_ROUTE}`);
  revalidatePath(`/klanten/${tenantId}/strategie/${PERSONA_ROUTE}`);
  revalidatePath(`/klanten/${tenantId}/strategie`);
  revalidatePath(`/klanten/${tenantId}`);
}

async function authed() {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);
  return createClient();
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function mapWorkbench(raw: Record<string, unknown>): BrandWorkbench {
  const links = (raw.links ?? {}) as BrandWorkbench["links"];
  return {
    version: raw.version as BrandWorkbench["version"],
    links: {
      stp: links.stp ?? { present: false },
      personas: { present: Boolean(links.personas?.present), confirmed: links.personas?.confirmed, version_number: links.personas?.version_number, people: asArray(links.personas?.people) },
      journeys: links.journeys ?? { count: 0 },
    },
    tenant: raw.tenant as BrandWorkbench["tenant"],
    sources: asArray<BrandSource>(raw.sources),
    pages: asArray<BrandPage>(raw.pages),
    findings: asArray<BrandFinding>(raw.findings),
    dimensions: asArray<BrandDimension>(raw.dimensions),
    priorities: asArray<BrandPriority>(raw.priorities),
  };
}

async function withMedia(wb: BrandWorkbench): Promise<BrandWorkbench> {
  const supabase = await authed();
  const { data, error } = await supabase.schema("app").rpc("get_brand_media", { p_version_id: wb.version.id });
  if (error || !data || typeof data !== "object") return wb;
  const media = data as { pages?: { id: string; screenshot_path: string }[]; findings?: { id: string; pin_x: number | null; pin_y: number | null }[] };
  const pages = new Map((media.pages ?? []).map((page) => [page.id, page.screenshot_path ?? ""]));
  const pins = new Map((media.findings ?? []).map((finding) => [finding.id, finding]));
  return {
    ...wb,
    pages: wb.pages.map((page) => ({ ...page, screenshot_path: pages.get(page.id) ?? "" })),
    findings: wb.findings.map((finding) => {
      const pin = pins.get(finding.id);
      return { ...finding, pin_x: pin?.pin_x ?? null, pin_y: pin?.pin_y ?? null };
    }),
  };
}

async function withSourceUrls(wb: BrandWorkbench): Promise<BrandWorkbench> {
  const paths = [
    ...wb.sources.filter((source) => source.storage_path && source.mime.startsWith("image/")).map((source) => source.storage_path),
    ...wb.pages.map((page) => page.screenshot_path ?? "").filter(Boolean),
  ];
  const urls = await signBrandPaths(paths);
  return {
    ...wb,
    sources: wb.sources.map((source) => ({ ...source, url: urls[source.storage_path] })),
    pages: wb.pages.map((page) => ({ ...page, screenshot_url: page.screenshot_path ? urls[page.screenshot_path] : undefined })),
  };
}

export async function signBrandPaths(paths: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return {};
  try {
    const admin = createAdminClient();
    const urls: Record<string, string> = {};
    for (const path of unique) {
      const signed = await admin.storage.from("brand-materials").createSignedUrl(path, 60 * 60);
      if (signed.data?.signedUrl) urls[path] = signed.data.signedUrl;
    }
    return urls;
  } catch {
    return {};
  }
}

export async function loadBrandWorkbenchAction(tenantId: string, versionId?: string): Promise<ActionResult<BrandWorkbench>> {
  const supabase = await authed();
  const { data, error } = await supabase.schema("app").rpc("get_brand_workbench", {
    p_tenant_id: tenantId,
    p_version_id: versionId ?? null,
  });
  if (error) return { ok: false, error: /get_brand_workbench|schema cache/i.test(error.message) ? BRAND_MIGRATION : error.message };
  if (!data || typeof data !== "object") return { ok: false, error: "Workbench gaf geen data terug." };
  return { ok: true, data: await withSourceUrls(await withMedia(mapWorkbench(data as Record<string, unknown>))) };
}

async function call(tenantId: string, fn: string, args: Record<string, unknown>): Promise<ActionResult> {
  const supabase = await authed();
  const { error } = await supabase.schema("app").rpc(fn, args);
  if (error) return { ok: false, error: /schema cache/i.test(error.message) ? BRAND_MIGRATION : error.message };
  revalidateBrand(tenantId);
  return { ok: true };
}

export async function setBrandStepAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = brandStepSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  return call(tenantId, "set_brand_step", { p_version_id: parsed.data.versionId, p_step: parsed.data.step });
}

export async function saveBrandSetupAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = brandSetupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const d = parsed.data;
  return call(tenantId, "save_brand_setup", {
    p_version_id: d.versionId,
    p_payload: {
      model: d.model,
      website_url: d.websiteUrl,
      period_label: d.periodLabel,
      research_availability: d.researchAvailability,
      scope_note: d.scopeNote,
      positioning_intended: d.positioningIntended,
    },
  });
}

function sniffBrandFile(name: string, bytes: Uint8Array): { mime: string; ext: string } | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".doc") && !lower.endsWith(".docx")) return null;
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return { mime: "application/pdf", ext: "pdf" };
  if (lower.endsWith(".docx") && bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    return { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: "docx" };
  }
  const image = sniffPersonaPhoto(bytes);
  return image ? { mime: image.mime, ext: image.ext } : null;
}

export async function uploadBrandSourceAction(tenantId: string, formData: FormData): Promise<ActionResult> {
  const versionId = String(formData.get("versionId") ?? "");
  const file = formData.get("file");
  const parsed = brandVersionSchema.safeParse({ versionId });
  if (!parsed.success) return { ok: false, error: "Kies eerst een auditversie." };
  if (!(file instanceof File)) return { ok: false, error: "Kies een bestand." };
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".doc") && !lower.endsWith(".docx")) {
    return { ok: false, error: "Oude DOC-bestanden worden niet gelezen. Sla het bestand op als DOCX of PDF." };
  }
  if (file.size <= 0) return { ok: false, error: "Het bestand is leeg." };
  if (file.size > MAX_BYTES) return { ok: false, error: "Het bestand is groter dan 8 MB." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffBrandFile(file.name, bytes);
  if (!sniffed) return { ok: false, error: "Gebruik PDF, DOCX, JPEG, PNG of WebP." };
  const tenant = brandVersionSchema.safeParse({ versionId: tenantId });
  if (!tenant.success) return { ok: false, error: "Klant niet gevonden." };
  const hash = createHash("sha256").update(bytes).digest("hex");
  const path = `${tenant.data.versionId.toLowerCase()}/${parsed.data.versionId.toLowerCase()}/${randomUUID()}.${sniffed.ext}`;
  let excerpt = "";
  let status = "stored";
  let errorMessage = "";
  if (sniffed.mime.startsWith("image/")) {
    try {
      excerpt = await describeUploadedVisual(bytes, sniffed.mime);
      status = excerpt ? "ready" : "partial";
      if (!excerpt) errorMessage = "Het beeld is bewaard. Een visuele beschrijving lukte niet.";
    } catch (err) {
      status = "partial";
      errorMessage = err instanceof Error ? err.message : "Het beeld is bewaard. De beschrijving lukte niet.";
    }
  }
  const admin = createAdminClient();
  const uploaded = await admin.storage.from("brand-materials").upload(path, bytes, { contentType: sniffed.mime, upsert: false });
  if (uploaded.error) return { ok: false, error: uploaded.error.message };
  const supabase = await authed();
  const registered = await supabase.schema("app").rpc("register_brand_source", {
    p_version_id: parsed.data.versionId,
    p_payload: {
      kind: "upload",
      material_type: sniffed.mime.startsWith("image/") ? "visual" : "other",
      label: file.name.slice(0, 200),
      storage_path: path,
      mime: sniffed.mime,
      content_hash: hash,
      status,
      error_message: errorMessage,
      excerpt,
    },
  });
  if (registered.error) {
    await admin.storage.from("brand-materials").remove([path]);
    return { ok: false, error: /schema cache/i.test(registered.error.message) ? BRAND_MIGRATION : registered.error.message };
  }
  revalidateBrand(tenantId);
  return { ok: true };
}

export async function updateBrandSourceAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = brandSourceMetaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const d = parsed.data;
  return call(tenantId, "update_brand_source", {
    p_source_id: d.sourceId,
    p_payload: {
      material_type: d.materialType, label: d.label, period_label: d.periodLabel, currency: d.currency,
      channel: d.channel, audience: d.audience, note: d.note, excerpt: d.excerpt,
    },
  });
}

export async function archiveBrandSourceAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = brandIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  return call(tenantId, "archive_brand_source", { p_source_id: parsed.data.id });
}

export async function saveBrandPageAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = brandPageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const d = parsed.data;
  return call(tenantId, "save_brand_page", {
    p_version_id: d.versionId,
    p_payload: {
      id: d.pageId, url: d.url, role: d.role, included: d.included, status: d.status,
      error_message: d.errorMessage, excerpt: d.excerpt,
    },
  });
}

export async function fetchBrandPageAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = brandPageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const fetched = await fetchPublicPageText(parsed.data.url);
  const payload = fetched.ok
    ? { ...parsed.data, url: fetched.finalUrl, status: "ready" as const, excerpt: fetched.excerpt, errorMessage: "" }
    : { ...parsed.data, status: "failed" as const, excerpt: "", errorMessage: fetched.error };
  return saveBrandPageAction(tenantId, payload);
}

export async function saveBrandFindingAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = brandFindingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const d = parsed.data;
  return call(tenantId, "upsert_brand_finding", {
    p_version_id: d.versionId,
    p_payload: {
      id: d.findingId, page_id: d.pageId, source_id: d.sourceId, lens: d.lens,
      observation: d.observation, meaning: d.meaning, proposal: d.proposal, hypothesis: d.hypothesis,
      persona_label: d.personaLabel, phase_label: d.phaseLabel,
    },
  });
}

export async function archiveBrandFindingAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = brandIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  return call(tenantId, "archive_brand_finding", { p_finding_id: parsed.data.id });
}

export async function saveBrandDimensionAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = brandDimensionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const d = parsed.data;
  return call(tenantId, "upsert_brand_dimension", {
    p_dimension_id: d.dimensionId,
    p_payload: {
      intended: d.intended, observed: d.observed, gap_note: d.gapNote, evidence_status: d.evidenceStatus,
      judgement: d.judgement, limits_note: d.limitsNote, open_question: d.openQuestion, hypothesis: d.hypothesis,
    },
  });
}

export async function saveBrandPriorityAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = brandPrioritySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const d = parsed.data;
  return call(tenantId, "upsert_brand_priority", {
    p_version_id: d.versionId,
    p_payload: {
      id: d.priorityId, title: d.title, problem: d.problem, action: d.action, outcome: d.outcome,
      validation_question: d.validationQuestion, kind: d.kind, priority: d.priority, reason: d.reason,
      persona_label: d.personaLabel, phase_label: d.phaseLabel,
    },
  });
}

export async function archiveBrandPriorityAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = brandIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  return call(tenantId, "archive_brand_priority", { p_priority_id: parsed.data.id });
}

export async function saveBrandConclusionAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = brandConclusionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const d = parsed.data;
  return call(tenantId, "save_brand_conclusion", {
    p_version_id: d.versionId,
    p_payload: {
      verdict: d.verdict, strongest: d.strongest, weakest: d.weakest, unassessed: d.unassessed,
      gap_summary: d.gapSummary, positioning_intended: d.positioningIntended, perception_observed: d.perceptionObserved,
      accepted_uncertainty: d.acceptedUncertainty, open_questions: d.openQuestions,
    },
  });
}

export async function confirmBrandImageAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = brandVersionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  return call(tenantId, "confirm_brand_image", { p_version_id: parsed.data.versionId });
}

const SCAN_MIGRATION = "Pas migratie 20260330133400 toe in de Supabase SQL-editor, na 20260330133300.";

function scanError(message: string): string {
  return /apply_brand_scan|conclusion_locked/i.test(message) ? SCAN_MIGRATION : message;
}

export async function runBrandAuditAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = brandVersionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const loaded = await loadBrandWorkbenchAction(tenantId, parsed.data.versionId);
  if (!loaded.ok || !loaded.data) return { ok: false, error: loaded.ok ? "Geen data" : loaded.error };
  const website = loaded.data.version.website_url.trim();
  const images = loaded.data.sources.filter((source) => source.mime.startsWith("image/") && source.storage_path);
  const documents = loaded.data.sources.filter(isStoredDocument);
  if (website.length < 8 && images.length === 0 && documents.length === 0) {
    return { ok: false, error: "Er is nog geen website, document of beeld om te lezen. Zet een website of upload materiaal." };
  }
  const supabase = await authed();
  let snapshot: { bytes: Uint8Array; mime: "image/jpeg" } | null = null;
  try {
    if (website.length >= 8) await scanWebsite(supabase, loaded.data);
    await readStoredDocuments(supabase, loaded.data);
    await describeMissingVisuals(supabase, loaded.data);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "De site of de documenten konden niet worden gelezen." };
  }
  if (website.length >= 8) {
    const prepared = await loadBrandWorkbenchAction(tenantId, parsed.data.versionId);
    const home = prepared.ok ? prepared.data?.pages.find((page) => page.included && (page.role === "home" || samePage(page.url, website))) : undefined;
    const captured = await capturePublicScreenshot(home?.url || website);
    if (captured.ok) {
      snapshot = captured;
      if (home?.id) await storeScreenshot(supabase, tenantId, parsed.data.versionId, home.id, captured.bytes);
    }
  }
  if (brandSearchConfigured()) {
    await searchBrandMentionsAction(tenantId, { versionId: parsed.data.versionId });
  }
  const read = await loadBrandWorkbenchAction(tenantId, parsed.data.versionId);
  if (!read.ok || !read.data) return { ok: false, error: read.ok ? "Geen data" : read.error };
  const readable = read.data.pages.some((page) => page.included && page.excerpt.trim().length >= 40)
    || read.data.sources.some((source) => source.excerpt.trim().length >= 20)
    || snapshot !== null;
  const stepped = await supabase.schema("app").rpc("set_brand_step", { p_version_id: parsed.data.versionId, p_step: "website" });
  if (stepped.error) return { ok: false, error: stepped.error.message };
  if (!readable) {
    revalidateBrand(tenantId);
    return { ok: false, error: "Er is geen leesbare paginatekst, documenttekst of snapshot. De velden blijven leeg." };
  }
  try {
    const findings = await proposeBrandFindings(read.data);
    if (snapshot) {
      const home = read.data.pages.find((page) => page.included && page.screenshot_path) ?? read.data.pages.find((page) => page.role === "home");
      const pins = await proposeSnapshotFindings(snapshot.bytes, snapshot.mime);
      findings.findings = [
        ...pins.map((item) => ({ ...item, page_url: home?.url ?? "" })),
        ...findings.findings.filter((item) => item.lens !== "visual" || item.scan_key),
      ];
    }
    const stored = await supabase.schema("app").rpc("apply_brand_scan", {
      p_version_id: parsed.data.versionId,
      p_payload: findings,
    });
    if (stored.error) {
      revalidateBrand(tenantId);
      return { ok: false, error: scanError(stored.error.message) };
    }
    const assessed = await loadBrandWorkbenchAction(tenantId, parsed.data.versionId);
    if (!assessed.ok || !assessed.data) return { ok: false, error: assessed.ok ? "Geen data" : assessed.error };
    const proposal = await proposeBrandAssessment(assessed.data);
    const applied = await supabase.schema("app").rpc("apply_brand_ai", {
      p_version_id: parsed.data.versionId,
      p_payload: { ...proposal, replace_unlocked: true },
    });
    if (applied.error) {
      revalidateBrand(tenantId);
      return { ok: false, error: scanError(applied.error.message) };
    }
  } catch (err) {
    revalidateBrand(tenantId);
    return { ok: false, error: err instanceof Error ? err.message : "De AI kon de velden niet invullen. De gelezen tekst blijft staan." };
  }
  revalidateBrand(tenantId);
  return { ok: true };
}

async function scanWebsite(supabase: Awaited<ReturnType<typeof authed>>, wb: BrandWorkbench): Promise<void> {
  const pages = [...wb.pages];
  const website = wb.version.website_url.trim();
  const home = pages.find((page) => page.role === "home") ?? pages.find((page) => samePage(page.url, website));
  const fetched: string[] = [];
  let origin = home?.url || website;
  if (!home || home.included) {
    const result = await fetchPublicPageText(origin);
    if (result.ok) origin = result.finalUrl;
    if (!result.ok && home?.excerpt) {
      fetched.push(origin);
    } else {
      await writePage(supabase, wb.version.id, pages, {
        id: home?.id ?? "",
        url: result.ok ? result.finalUrl : origin,
        role: "home",
        included: true,
        fetched_at: null,
        status: result.ok ? "ready" : "failed",
        error_message: result.ok ? "" : result.error,
        excerpt: result.ok ? result.excerpt : "",
      });
      fetched.push(result.ok ? result.finalUrl : origin);
    }
    let targets: ReturnType<typeof selectScanTargets> = [];
    try {
      targets = selectScanTargets(origin, result.ok ? result.links : []).slice(0, 6);
    } catch {
      targets = [];
    }
    for (const target of targets) {
      if (fetched.some((url) => samePage(url, target.url))) continue;
      if (fetched.length >= 6) break;
      const existing = pages.find((page) => samePage(page.url, target.url));
      if (existing && !existing.included) continue;
      const page = await fetchPublicPageText(target.url);
      const finalUrl = page.ok ? page.finalUrl : target.url;
      const match = pages.find((item) => samePage(item.url, target.url) || samePage(item.url, finalUrl));
      if (match && !match.included) continue;
      if (!page.ok && match?.excerpt) {
        fetched.push(finalUrl);
        continue;
      }
      await writePage(supabase, wb.version.id, pages, {
        id: match?.id ?? "",
        url: finalUrl,
        role: target.role,
        included: true,
        fetched_at: null,
        status: page.ok ? "ready" : "failed",
        error_message: page.ok ? "" : page.error,
        excerpt: page.ok ? page.excerpt : "",
      });
      fetched.push(finalUrl);
    }
  } else {
    for (const existing of pages.filter((page) => page.included).slice(0, 6)) {
      const page = await fetchPublicPageText(existing.url);
      if (!page.ok && existing.excerpt) continue;
      await writePage(supabase, wb.version.id, pages, {
        ...existing,
        url: page.ok ? page.finalUrl : existing.url,
        status: page.ok ? "ready" : "failed",
        error_message: page.ok ? "" : page.error,
        excerpt: page.ok ? page.excerpt : existing.excerpt,
      });
    }
  }
}

async function writePage(supabase: Awaited<ReturnType<typeof authed>>, versionId: string, pages: BrandPage[], page: BrandPage): Promise<void> {
  const match = pages.find((item) => (page.id && item.id === page.id) || samePage(item.url, page.url));
  if (match && !match.included) return;
  const role = (match && match.role !== "other" ? match.role : page.role) as PageRole;
  const { data, error } = await supabase.schema("app").rpc("save_brand_page", {
    p_version_id: versionId,
    p_payload: {
      id: match?.id || null,
      url: page.url,
      role,
      included: true,
      status: page.status,
      error_message: page.error_message,
      excerpt: page.excerpt,
    },
  });
  if (error) throw new Error(error.message);
  const id = typeof data === "string" && data ? data : match?.id ?? page.id;
  const next = { ...page, id, role, included: true };
  const index = pages.findIndex((item) => item.id === id || samePage(item.url, page.url));
  if (index >= 0) pages[index] = { ...pages[index], ...next };
  else pages.push(next);
}

async function describeMissingVisuals(supabase: Awaited<ReturnType<typeof authed>>, wb: BrandWorkbench): Promise<void> {
  const pending = wb.sources.filter((source) => source.mime.startsWith("image/") && source.storage_path && source.excerpt.trim().length < 20).slice(0, 4);
  if (pending.length === 0) return;
  const admin = createAdminClient();
  for (const source of pending) {
    const file = await admin.storage.from("brand-materials").download(source.storage_path);
    if (file.error || !file.data) continue;
    let excerpt = "";
    try {
      excerpt = await describeUploadedVisual(new Uint8Array(await file.data.arrayBuffer()), source.mime);
    } catch {
      continue;
    }
    if (excerpt.trim().length < 20) continue;
    const updated = await supabase.schema("app").rpc("update_brand_source", {
      p_source_id: source.id,
      p_payload: {
        material_type: source.material_type || "visual",
        label: source.label,
        period_label: source.period_label,
        currency: source.currency,
        channel: source.channel,
        audience: source.audience,
        note: source.note,
        excerpt,
      },
    });
    if (updated.error) throw new Error(updated.error.message);
  }
}

function isStoredDocument(source: BrandSource): boolean {
  const name = source.label.toLowerCase();
  return Boolean(source.storage_path) && (source.mime === "application/pdf" || source.mime.includes("wordprocessingml") || name.endsWith(".pdf") || name.endsWith(".docx"));
}

async function readStoredDocuments(supabase: Awaited<ReturnType<typeof authed>>, wb: BrandWorkbench): Promise<void> {
  const documents = wb.sources.filter(isStoredDocument).slice(0, 6);
  if (documents.length === 0) return;
  const admin = createAdminClient();
  for (const source of documents) {
    const file = await admin.storage.from("brand-materials").download(source.storage_path);
    if (file.error || !file.data) continue;
    let text = "";
    try {
      text = await extractDocumentText(source.mime, source.label, new Uint8Array(await file.data.arrayBuffer()));
    } catch {
      text = "";
    }
    if (text.length < 40) {
      if (source.excerpt.trim().length >= 40) continue;
      await supabase.schema("app").rpc("set_brand_source_read", {
        p_source_id: source.id,
        p_excerpt: source.excerpt,
        p_status: "partial",
        p_error: "Dit bestand heeft geen leesbare tekstlaag. Een afbeelding in een pdf wordt niet gelezen.",
      });
      continue;
    }
    const saved = await supabase.schema("app").rpc("set_brand_source_read", {
      p_source_id: source.id,
      p_excerpt: text,
      p_status: "ready",
      p_error: "",
    });
    if (saved.error) {
      await supabase.schema("app").rpc("update_brand_source", {
        p_source_id: source.id,
        p_payload: {
          material_type: source.material_type || "other",
          label: source.label,
          period_label: source.period_label,
          currency: source.currency,
          channel: source.channel,
          audience: source.audience,
          note: source.note,
          excerpt: text,
        },
      });
    }
  }
}

async function storeScreenshot(supabase: Awaited<ReturnType<typeof authed>>, tenantId: string, versionId: string, pageId: string, bytes: Uint8Array): Promise<void> {
  const admin = createAdminClient();
  const path = `${tenantId.toLowerCase()}/${versionId.toLowerCase()}/${randomUUID()}.jpg`;
  const uploaded = await admin.storage.from("brand-materials").upload(path, bytes, { contentType: "image/jpeg", upsert: false });
  if (uploaded.error) return;
  const saved = await supabase.schema("app").rpc("set_brand_page_screenshot", { p_page_id: pageId, p_path: path });
  if (saved.error) await admin.storage.from("brand-materials").remove([path]);
}

export async function proposeBrandAssessmentAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = brandExpectedSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const loaded = await loadBrandWorkbenchAction(tenantId, parsed.data.versionId);
  if (!loaded.ok || !loaded.data) return { ok: false, error: loaded.ok ? "Geen data" : loaded.error };
  if (loaded.data.version.updated_at !== parsed.data.expectedUpdatedAt) {
    return { ok: false, error: "De versie is intussen gewijzigd. Haal opnieuw op voor je een voorstel toepast." };
  }
  try {
    const proposal = await proposeBrandAssessment(loaded.data);
    return call(tenantId, "apply_brand_ai", { p_version_id: parsed.data.versionId, p_payload: proposal });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Het voorstel lukte niet. Je tekst blijft staan." };
  }
}

export async function searchBrandMentionsAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = brandVersionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const loaded = await loadBrandWorkbenchAction(tenantId, parsed.data.versionId);
  if (!loaded.ok || !loaded.data) return { ok: false, error: loaded.ok ? "Geen data" : loaded.error };
  const wb = loaded.data;
  const query = [wb.tenant.name, wb.version.website_url, wb.links.stp.sector].filter(Boolean).join(" ");
  if (query.trim().length < 2) return { ok: false, error: "Er is nog geen merknaam of website om op te zoeken." };
  let hits;
  try {
    hits = await searchBrandMentions(query);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Zoeken lukte niet." };
  }
  const ownHost = hostOf(wb.version.website_url);
  const known = new Set(wb.sources.map((source) => source.source_url));
  const fresh = hits.filter((hit) => !known.has(hit.url)).slice(0, 6);
  if (fresh.length === 0) return { ok: true };
  const supabase = await authed();
  for (const hit of fresh) {
    const own = ownHost && hostOf(hit.url) === ownHost;
    const registered = await supabase.schema("app").rpc("register_brand_source", {
      p_version_id: parsed.data.versionId,
      p_payload: {
        kind: "public",
        material_type: own ? "other" : "research",
        label: hit.title,
        source_url: hit.url,
        excerpt: hit.snippet,
        note: own ? "Eigen domein. Dit is merkcommunicatie, geen onafhankelijke review." : "Zoekfragment. Geen volledige dekking van de markt.",
        status: hit.snippet ? "ready" : "partial",
        channel: hit.publisher,
      },
    });
    if (registered.error) return { ok: false, error: registered.error.message };
  }
  revalidateBrand(tenantId);
  return { ok: true };
}

function hostOf(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export async function approveBrandAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = brandExpectedSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  return call(tenantId, "approve_brand_version", { p_version_id: parsed.data.versionId, p_expected: parsed.data.expectedUpdatedAt });
}

export async function publishBrandAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = brandVersionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  return call(tenantId, "publish_brand_version", { p_version_id: parsed.data.versionId });
}

export async function unpublishBrandAction(tenantId: string, input: unknown): Promise<ActionResult> {
  const parsed = brandVersionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  return call(tenantId, "unpublish_brand_version", { p_version_id: parsed.data.versionId });
}

export async function exportBrandTextAction(tenantId: string, input: unknown): Promise<ActionResult<{ text: string }>> {
  const parsed = brandVersionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssue(parsed.error) };
  const loaded = await loadBrandWorkbenchAction(tenantId, parsed.data.versionId);
  if (!loaded.ok || !loaded.data) return { ok: false, error: loaded.ok ? "Geen data" : loaded.error };
  const wb = loaded.data;
  const lines = [
    wb.version.status === "approved" ? "Goedgekeurde brand audit" : "Concept — brand audit",
    `Versie ${wb.version.version_number}`,
    `Model: ${wb.version.model === "aaker" ? "Aaker" : "Keller"}`,
    wb.tenant.name,
    wb.version.positioning_intended ? `Beoogde positionering: ${wb.version.positioning_intended}` : "",
    wb.version.perception_observed ? `Onderbouwde perceptie: ${wb.version.perception_observed}` : "Onderbouwde perceptie: niet beschikbaar",
    wb.version.verdict ? `Conclusie: ${wb.version.verdict}` : "",
    wb.version.unassessed ? `Nog niet te beoordelen: ${wb.version.unassessed}` : "",
    wb.version.gap_summary ? `Verschil: ${wb.version.gap_summary}` : "",
    "",
    ...wb.dimensions.map((item) => `${item.dimension_key}: ${item.judgement || "leeg"} · bewijs ${item.evidence_status}`),
    "",
    ...wb.priorities.map((item) => `- ${item.title} (${item.kind}): ${item.action}`),
    wb.version.accepted_uncertainty ? `Onzekerheid: ${wb.version.accepted_uncertainty}` : "",
    "Geen financiële merkwaardering. Geen volledige siteanalyse.",
  ];
  const supabase = await authed();
  const logged = await supabase.schema("app").rpc("log_brand_export", { p_version_id: parsed.data.versionId });
  if (logged.error) return { ok: false, error: logged.error.message };
  return { ok: true, data: { text: lines.filter(Boolean).join("\n") } };
}

export async function loadBrandPublishedAction(tenantId: string): Promise<BrandPublished | null> {
  const session = await requireSession();
  if (!session) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.schema("app").rpc("get_brand_published", { p_tenant_id: tenantId });
  if (error || !data || typeof data !== "object") return null;
  return data as BrandPublished;
}
