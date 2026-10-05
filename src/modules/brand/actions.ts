"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { describeUploadedVisual, proposeBrandAssessment } from "@/lib/brand/brand-ai";
import { BRAND_MIGRATION, BRAND_ROUTE } from "@/lib/brand/constants";
import { fetchPublicPageText } from "@/lib/brand/fetch-page";
import { searchBrandMentions } from "@/lib/brand/mentions";
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

async function withSourceUrls(wb: BrandWorkbench): Promise<BrandWorkbench> {
  const paths = wb.sources.filter((source) => source.storage_path && source.mime.startsWith("image/")).map((source) => source.storage_path);
  const urls = await signBrandPaths(paths);
  return { ...wb, sources: wb.sources.map((source) => ({ ...source, url: urls[source.storage_path] })) };
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
  return { ok: true, data: await withSourceUrls(mapWorkbench(data as Record<string, unknown>)) };
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
