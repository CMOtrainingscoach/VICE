"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdminMfa, requireSession } from "@/lib/auth/session";
import {
  countWords,
  generateBlogImage,
  generateBlogText,
  htmlToPlain,
  sanitizeBlogHtml,
} from "@/lib/content/blog-ai";
import {
  BLOG_MIGRATION,
  type BlogConcept,
  type BlogConceptSummary,
  type BlogLength,
  type BlogMode,
  type BlogVisual,
  type BrandContext,
  type JobStatus,
} from "@/lib/content/blog-types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const MISSING = /list_blog_concepts|get_blog_concept|create_blog_concept|save_blog_concept|add_blog_|schema cache|does not exist|Could not find the function/i;

function migration(message: string): string {
  return MISSING.test(message) ? BLOG_MIGRATION : message;
}

async function authed() {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);
  return createClient();
}

export async function loadBlogBrandContextAction(tenantId: string): Promise<ActionResult<BrandContext>> {
  const supabase = await authed();
  const brand = await supabase.schema("app").rpc("get_client_brand", { p_tenant_id: tenantId });
  if (brand.error) {
    return {
      ok: false,
      error: /get_client_brand|schema cache|does not exist/i.test(brand.error.message)
        ? "Pas migratie 20260330134700 toe in de Supabase SQL-editor, na 20260330134600."
        : brand.error.message,
    };
  }
  const raw = brand.data as { tenantName?: string; brand?: Record<string, unknown> | null } | null;
  const row = raw?.brand && typeof raw.brand === "object" ? raw.brand : null;
  const voice = String(row?.voice ?? "").trim();
  const visualRaw = (row?.visual && typeof row.visual === "object" ? row.visual : {}) as Record<string, unknown>;
  const stylePrompt = String(visualRaw.stylePrompt ?? "").trim();
  const tags = Array.isArray(visualRaw.tags) ? visualRaw.tags.map(String).filter(Boolean) : [];
  const colors = Array.isArray(row?.colors)
    ? row.colors
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
        .map((item) => ({
          name: String(item.name ?? ""),
          hex: String(item.hex ?? ""),
          role: String(item.role ?? ""),
        }))
    : [];

  return {
    ok: true,
    data: {
      tenantName: String(raw?.tenantName ?? ""),
      brandName: String(row?.brandName ?? raw?.tenantName ?? ""),
      versionNumber: row?.versionNumber != null ? Number(row.versionNumber) : null,
      approved: row?.status === "approved",
      voice,
      hasVoice: voice.length >= 20,
      hasVisual: stylePrompt.length >= 20 || tags.length > 0,
      visual: {
        tags,
        do: String(visualRaw.do ?? ""),
        avoid: String(visualRaw.avoid ?? ""),
        stylePrompt,
      },
      colors,
      brandHref: `/klanten/${tenantId}/strategie/brand`,
    },
  };
}

export async function listBlogConceptsAction(tenantId: string): Promise<ActionResult<BlogConceptSummary[]>> {
  const supabase = await authed();
  const listed = await supabase.schema("app").rpc("list_blog_concepts", { p_tenant_id: tenantId });
  if (listed.error) return { ok: false, error: migration(listed.error.message) };
  const rows = Array.isArray(listed.data) ? listed.data : [];
  return {
    ok: true,
    data: rows.map((item) => {
      const row = item as Record<string, unknown>;
      return {
        id: String(row.id),
        title: row.title ? String(row.title) : null,
        sourceText: String(row.sourceText ?? ""),
        updatedAt: String(row.updatedAt ?? ""),
        wordCount: Number(row.wordCount) || 0,
        brandVersionNumber: row.brandVersionNumber != null ? Number(row.brandVersionNumber) : null,
      };
    }),
  };
}

export async function loadBlogConceptAction(conceptId: string): Promise<ActionResult<BlogConcept>> {
  const supabase = await authed();
  const loaded = await supabase.schema("app").rpc("get_blog_concept", { p_concept_id: conceptId });
  if (loaded.error || !loaded.data) return { ok: false, error: migration(loaded.error?.message ?? "Concept laden mislukt") };
  const mapped = await mapConcept(loaded.data);
  if (!mapped) return { ok: false, error: "Concept laden mislukt" };
  return { ok: true, data: mapped };
}

export async function createBlogConceptAction(input: {
  tenantId: string;
  mode: BlogMode;
  language: string;
  lengthKey: BlogLength;
  sourceText: string;
}): Promise<ActionResult<BlogConcept>> {
  const text = input.sourceText.trim();
  if (text.length < 8) return { ok: false, error: "Beschrijf eerst een onderwerp of plak tekst." };

  const brand = await loadBlogBrandContextAction(input.tenantId);
  if (!brand.ok || !brand.data) return { ok: false, error: brand.ok ? "Merkcontext ontbreekt." : brand.error };

  const supabase = await authed();
  const brandRow = await supabase.schema("app").rpc("get_client_brand", { p_tenant_id: input.tenantId });
  const brandData = (brandRow.data as { brand?: { id?: string; versionNumber?: number } | null } | null)?.brand ?? null;

  const created = await supabase.schema("app").rpc("create_blog_concept", {
    p_tenant_id: input.tenantId,
    p_mode: input.mode,
    p_language: input.language,
    p_length_key: input.lengthKey,
    p_source_text: text,
    p_brand_id: brandData?.id ?? null,
    p_brand_version_number: brandData?.versionNumber ?? brand.data.versionNumber,
    p_brand_voice_snapshot: brand.data.voice,
    p_brand_visual_snapshot: brand.data.visual,
  });
  if (created.error || !created.data) return { ok: false, error: migration(created.error?.message ?? "Concept aanmaken mislukt") };
  const mapped = await mapConcept(created.data);
  if (!mapped) return { ok: false, error: "Concept aanmaken mislukt" };
  revalidateBlog(input.tenantId, mapped.id);
  return { ok: true, data: mapped };
}

export async function saveBlogConceptAction(
  conceptId: string,
  expectedUpdatedAt: string,
  patch: Record<string, unknown>,
): Promise<ActionResult<BlogConcept>> {
  const supabase = await authed();
  if (typeof patch.bodyHtml === "string") {
    const html = sanitizeBlogHtml(patch.bodyHtml);
    const plain = htmlToPlain(html);
    patch = { ...patch, bodyHtml: html, bodyPlain: plain, wordCount: countWords(plain) };
  }
  const saved = await supabase.schema("app").rpc("save_blog_concept", {
    p_concept_id: conceptId,
    p_expected: expectedUpdatedAt,
    p_patch: patch,
  });
  if (saved.error || !saved.data) return { ok: false, error: migration(saved.error?.message ?? "Opslaan mislukt") };
  const mapped = await mapConcept(saved.data);
  if (!mapped) return { ok: false, error: "Opslaan mislukt" };
  if (patch.bodyHtml != null || patch.title != null) {
    await supabase.schema("app").rpc("add_blog_revision", {
      p_concept_id: conceptId,
      p_kind: "manual",
      p_title: mapped.title,
      p_body_html: mapped.bodyHtml,
      p_body_plain: mapped.bodyPlain,
      p_instruction: "",
    });
  }
  revalidateBlog(mapped.tenantId, mapped.id);
  return { ok: true, data: mapped };
}

export async function generateBlogTextAction(conceptId: string): Promise<ActionResult<BlogConcept>> {
  const loaded = await loadBlogConceptAction(conceptId);
  if (!loaded.ok || !loaded.data) return loaded;
  const concept = loaded.data;
  if (!concept.brandVoiceSnapshot || concept.brandVoiceSnapshot.trim().length < 20) {
    return { ok: false, error: "Tone of voice ontbreekt. Vul die eerst aan bij Brand." };
  }

  const supabase = await authed();
  await supabase.schema("app").rpc("save_blog_concept", {
    p_concept_id: conceptId,
    p_expected: concept.updatedAt,
    p_patch: { textJobStatus: "running", textJobError: "" },
  });

  try {
    const generated = await generateBlogText({
      mode: concept.mode,
      sourceText: concept.sourceText,
      language: concept.language,
      lengthKey: concept.lengthKey,
      voice: concept.brandVoiceSnapshot,
    });
    const plain = htmlToPlain(generated.bodyHtml);
    const saved = await supabase.schema("app").rpc("save_blog_concept", {
      p_concept_id: conceptId,
      p_expected: null,
      p_patch: {
        title: generated.title,
        bodyHtml: generated.bodyHtml,
        bodyPlain: plain,
        wordCount: countWords(plain),
        textJobStatus: "ready",
        textJobError: "",
      },
    });
    if (saved.error || !saved.data) return { ok: false, error: migration(saved.error?.message ?? "Tekst opslaan mislukt") };
    await supabase.schema("app").rpc("add_blog_revision", {
      p_concept_id: conceptId,
      p_kind: "generate",
      p_title: generated.title,
      p_body_html: generated.bodyHtml,
      p_body_plain: plain,
      p_instruction: "",
    });
    const mapped = await mapConcept(saved.data);
    if (!mapped) return { ok: false, error: "Tekst genereren mislukt" };
    revalidateBlog(mapped.tenantId, mapped.id);
    return { ok: true, data: mapped };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tekstgeneratie mislukt";
    await supabase.schema("app").rpc("save_blog_concept", {
      p_concept_id: conceptId,
      p_expected: null,
      p_patch: { textJobStatus: "failed", textJobError: message },
    });
    return { ok: false, error: message };
  }
}

export async function rewriteBlogTextAction(
  conceptId: string,
  instruction: string,
): Promise<ActionResult<{ proposal: { title: string; bodyHtml: string }; concept: BlogConcept }>> {
  const loaded = await loadBlogConceptAction(conceptId);
  if (!loaded.ok || !loaded.data) return { ok: false, error: loaded.ok ? "Concept ontbreekt" : loaded.error };
  const concept = loaded.data;
  if (!concept.brandVoiceSnapshot || concept.brandVoiceSnapshot.trim().length < 20) {
    return { ok: false, error: "Tone of voice ontbreekt. Vul die eerst aan bij Brand." };
  }
  if (!instruction.trim()) return { ok: false, error: "Beschrijf wat je wilt aanpassen." };

  try {
    const generated = await generateBlogText({
      mode: "rewrite",
      sourceText: concept.sourceText,
      language: concept.language,
      lengthKey: concept.lengthKey,
      voice: concept.brandVoiceSnapshot,
      instruction: instruction.trim(),
      currentTitle: concept.title,
      currentBodyHtml: concept.bodyHtml,
    });
    return {
      ok: true,
      data: {
        proposal: { title: generated.title, bodyHtml: generated.bodyHtml },
        concept,
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Herschrijven mislukt" };
  }
}

export async function applyBlogRewriteAction(
  conceptId: string,
  expectedUpdatedAt: string,
  title: string,
  bodyHtml: string,
  instruction: string,
): Promise<ActionResult<BlogConcept>> {
  const html = sanitizeBlogHtml(bodyHtml);
  const plain = htmlToPlain(html);
  const supabase = await authed();
  const saved = await supabase.schema("app").rpc("save_blog_concept", {
    p_concept_id: conceptId,
    p_expected: expectedUpdatedAt,
    p_patch: {
      title,
      bodyHtml: html,
      bodyPlain: plain,
      wordCount: countWords(plain),
      textJobStatus: "ready",
      textJobError: "",
    },
  });
  if (saved.error || !saved.data) return { ok: false, error: migration(saved.error?.message ?? "Voorstel toepassen mislukt") };
  await supabase.schema("app").rpc("add_blog_revision", {
    p_concept_id: conceptId,
    p_kind: "rewrite",
    p_title: title,
    p_body_html: html,
    p_body_plain: plain,
    p_instruction: instruction,
  });
  const mapped = await mapConcept(saved.data);
  if (!mapped) return { ok: false, error: "Voorstel toepassen mislukt" };
  revalidateBlog(mapped.tenantId, mapped.id);
  return { ok: true, data: mapped };
}

export async function generateBlogVisualAction(
  conceptId: string,
  tweak?: string,
): Promise<ActionResult<BlogConcept>> {
  const loaded = await loadBlogConceptAction(conceptId);
  if (!loaded.ok || !loaded.data) return loaded;
  const concept = loaded.data;
  const visual = concept.brandVisualSnapshot;
  const hasVisual = Boolean(visual.stylePrompt && visual.stylePrompt.trim().length >= 20) || Boolean(visual.tags?.length);
  if (!hasVisual) return { ok: false, error: "Beeldstijl ontbreekt. Vul die eerst aan bij Brand." };

  const brand = await loadBlogBrandContextAction(concept.tenantId);
  if (!brand.ok || !brand.data) return { ok: false, error: brand.ok ? "Merkcontext ontbreekt." : brand.error };

  const supabase = await authed();
  await supabase.schema("app").rpc("save_blog_concept", {
    p_concept_id: conceptId,
    p_expected: concept.updatedAt,
    p_patch: { imageJobStatus: "running", imageJobError: "" },
  });

  try {
    const summary = concept.bodyPlain || concept.sourceText;
    const image = await generateBlogImage({
      title: concept.title || concept.sourceText.slice(0, 120),
      summary,
      stylePrompt: visual.stylePrompt || brand.data.visual.stylePrompt,
      tags: visual.tags || brand.data.visual.tags,
      doText: visual.do || brand.data.visual.do,
      avoidText: visual.avoid || brand.data.visual.avoid,
      colors: brand.data.colors,
      brandName: brand.data.brandName || brand.data.tenantName,
      tweak,
    });

    const ext = image.mime.includes("jpeg") ? "jpg" : image.mime.includes("webp") ? "webp" : "png";
    const path = `${concept.tenantId}/blog/${conceptId}/${crypto.randomUUID()}.${ext}`;
    const admin = createAdminClient();
    const uploaded = await admin.storage.from("content-assets").upload(path, image.bytes, {
      contentType: image.mime,
      upsert: false,
    });
    if (uploaded.error) {
      throw new Error(/bucket|mime/i.test(uploaded.error.message) ? BLOG_MIGRATION : uploaded.error.message);
    }

    const alt = concept.title
      ? `Illustratief beeld bij: ${concept.title}`
      : "Illustratief blogbeeld in de merkbeeldstijl";

    const added = await supabase.schema("app").rpc("add_blog_visual", {
      p_concept_id: conceptId,
      p_path: path,
      p_mime: image.mime,
      p_width: 1536,
      p_height: 1024,
      p_prompt: image.prompt,
      p_style_summary: image.styleSummary,
      p_alt_text: alt,
      p_brand_version_number: concept.brandVersionNumber,
      p_based_on_title: concept.title,
      p_select: true,
    });
    if (added.error || !added.data) throw new Error(migration(added.error?.message ?? "Visual opslaan mislukt"));
    const mapped = await mapConcept(added.data);
    if (!mapped) throw new Error("Visual opslaan mislukt");
    revalidateBlog(mapped.tenantId, mapped.id);
    return { ok: true, data: mapped };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Beeldgeneratie mislukt";
    await supabase.schema("app").rpc("save_blog_concept", {
      p_concept_id: conceptId,
      p_expected: null,
      p_patch: { imageJobStatus: "failed", imageJobError: message },
    });
    return { ok: false, error: message };
  }
}

export async function selectBlogVisualAction(
  conceptId: string,
  expectedUpdatedAt: string,
  visualId: string,
): Promise<ActionResult<BlogConcept>> {
  return saveBlogConceptAction(conceptId, expectedUpdatedAt, { selectedVisualId: visualId });
}

export async function updateBlogVisualAltAction(visualId: string, altText: string): Promise<ActionResult> {
  const supabase = await authed();
  const updated = await supabase.schema("app").rpc("update_blog_visual_alt", {
    p_visual_id: visualId,
    p_alt_text: altText,
  });
  if (updated.error) return { ok: false, error: migration(updated.error.message) };
  return { ok: true };
}

function revalidateBlog(tenantId: string, conceptId?: string) {
  revalidatePath(`/klanten/${tenantId}/content`);
  revalidatePath(`/klanten/${tenantId}/content/blog`);
  if (conceptId) revalidatePath(`/klanten/${tenantId}/content/blog/${conceptId}`);
}

async function mapConcept(raw: unknown): Promise<BlogConcept | null> {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (!row.id) return null;
  const visuals = await Promise.all(
    (Array.isArray(row.visuals) ? row.visuals : []).map((item) => mapVisual(item)),
  );
  const selected = row.selectedVisual ? await mapVisual(row.selectedVisual) : null;
  return {
    id: String(row.id),
    tenantId: String(row.tenantId ?? ""),
    mode: row.mode === "rewrite" ? "rewrite" : "new",
    language: String(row.language ?? "nl"),
    lengthKey: row.lengthKey === "short" || row.lengthKey === "long" ? row.lengthKey : "medium",
    sourceText: String(row.sourceText ?? ""),
    title: String(row.title ?? ""),
    bodyHtml: String(row.bodyHtml ?? ""),
    bodyPlain: String(row.bodyPlain ?? ""),
    wordCount: Number(row.wordCount) || 0,
    brandId: row.brandId ? String(row.brandId) : null,
    brandVersionNumber: row.brandVersionNumber != null ? Number(row.brandVersionNumber) : null,
    brandVoiceSnapshot: String(row.brandVoiceSnapshot ?? ""),
    brandVisualSnapshot: (row.brandVisualSnapshot && typeof row.brandVisualSnapshot === "object"
      ? row.brandVisualSnapshot
      : {}) as BlogConcept["brandVisualSnapshot"],
    selectedVisualId: row.selectedVisualId ? String(row.selectedVisualId) : null,
    selectedVisual: selected,
    visuals: visuals.filter((item): item is BlogVisual => Boolean(item)),
    textJobStatus: asJob(row.textJobStatus),
    textJobError: String(row.textJobError ?? ""),
    imageJobStatus: asJob(row.imageJobStatus),
    imageJobError: String(row.imageJobError ?? ""),
    createdAt: String(row.createdAt ?? ""),
    updatedAt: String(row.updatedAt ?? ""),
  };
}

async function mapVisual(raw: unknown): Promise<BlogVisual | null> {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (!row.id || !row.storagePath) return null;
  let url: string | null = null;
  try {
    const admin = createAdminClient();
    const signed = await admin.storage.from("content-assets").createSignedUrl(String(row.storagePath), 60 * 60);
    url = signed.data?.signedUrl ?? null;
  } catch {
    url = null;
  }
  return {
    id: String(row.id),
    storagePath: String(row.storagePath),
    mimeType: String(row.mimeType ?? "image/png"),
    width: row.width != null ? Number(row.width) : null,
    height: row.height != null ? Number(row.height) : null,
    prompt: String(row.prompt ?? ""),
    styleSummary: String(row.styleSummary ?? ""),
    altText: String(row.altText ?? ""),
    brandVersionNumber: row.brandVersionNumber != null ? Number(row.brandVersionNumber) : null,
    basedOnTitle: String(row.basedOnTitle ?? ""),
    createdAt: String(row.createdAt ?? ""),
    url,
  };
}

function asJob(value: unknown): JobStatus {
  if (value === "queued" || value === "running" || value === "ready" || value === "failed") return value;
  return "idle";
}
