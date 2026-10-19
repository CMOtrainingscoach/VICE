"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdminMfa, requireSession } from "@/lib/auth/session";
import {
  generateCarouselOutline,
  generateSocialCaption,
  generateSocialImage,
  slidesFromBlogHtml,
} from "@/lib/content/social-ai";
import {
  SOCIAL_MIGRATION,
  type SocialCarouselSlide,
  type SocialChannel,
  type SocialFormat,
  type SocialPostAsset,
  type SocialPostConcept,
  type SocialPostConceptSummary,
  type SocialTopicMode,
  type JobStatus,
} from "@/lib/content/social-types";
import { loadBlogBrandContextAction } from "@/modules/content/blog-actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const MISSING =
  /list_social_post|get_social_post|create_social_post|save_social_post|add_social_post|delete_social_post|schema cache|does not exist|Could not find the function/i;

function migration(message: string) {
  return MISSING.test(message) ? SOCIAL_MIGRATION : message;
}

async function authed() {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);
  return createClient();
}

const CHANNELS = new Set<SocialChannel>(["instagram", "linkedin", "facebook", "tiktok", "x"]);
const FORMATS = new Set<SocialFormat>(["single", "carousel", "reel"]);
const TOPIC_MODES = new Set<SocialTopicMode>(["manual", "blog", "meeting"]);

function asChannels(value: unknown): SocialChannel[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).filter((item): item is SocialChannel => CHANNELS.has(item as SocialChannel));
}

function asFormat(value: unknown): SocialFormat {
  return FORMATS.has(value as SocialFormat) ? (value as SocialFormat) : "single";
}

function asTopicMode(value: unknown): SocialTopicMode {
  return TOPIC_MODES.has(value as SocialTopicMode) ? (value as SocialTopicMode) : "manual";
}

function asJob(value: unknown): JobStatus {
  if (value === "queued" || value === "running" || value === "ready" || value === "failed") return value;
  return "idle";
}

async function mapAsset(raw: unknown): Promise<SocialPostAsset | null> {
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
    kind: row.kind === "upload" ? "upload" : "ai",
    prompt: String(row.prompt ?? ""),
    styleSummary: String(row.styleSummary ?? ""),
    altText: String(row.altText ?? ""),
    sortOrder: Number(row.sortOrder) || 0,
    createdAt: String(row.createdAt ?? ""),
    url,
  };
}

async function mapConcept(raw: unknown): Promise<SocialPostConcept | null> {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (!row.id) return null;
  const assets = (await Promise.all((Array.isArray(row.assets) ? row.assets : []).map(mapAsset))).filter(
    (item): item is SocialPostAsset => Boolean(item),
  );
  const selected = row.selectedAsset ? await mapAsset(row.selectedAsset) : null;
  return {
    id: String(row.id),
    tenantId: String(row.tenantId ?? ""),
    channels: asChannels(row.channels),
    format: asFormat(row.format),
    topicMode: asTopicMode(row.topicMode),
    topicText: String(row.topicText ?? ""),
    blogConceptId: row.blogConceptId ? String(row.blogConceptId) : null,
    meetingRecordingId: row.meetingRecordingId ? String(row.meetingRecordingId) : null,
    caption: String(row.caption ?? ""),
    hashtags: String(row.hashtags ?? ""),
    language: String(row.language ?? "nl"),
    brandId: row.brandId ? String(row.brandId) : null,
    brandVersionNumber: row.brandVersionNumber != null ? Number(row.brandVersionNumber) : null,
    brandVoiceSnapshot: String(row.brandVoiceSnapshot ?? ""),
    brandVisualSnapshot:
      row.brandVisualSnapshot && typeof row.brandVisualSnapshot === "object"
        ? (row.brandVisualSnapshot as Record<string, unknown>)
        : {},
    selectedAssetId: row.selectedAssetId ? String(row.selectedAssetId) : null,
    selectedAsset: selected,
    assets,
    textJobStatus: asJob(row.textJobStatus),
    textJobError: String(row.textJobError ?? ""),
    imageJobStatus: asJob(row.imageJobStatus),
    imageJobError: String(row.imageJobError ?? ""),
    createdAt: String(row.createdAt ?? ""),
    updatedAt: String(row.updatedAt ?? ""),
  };
}

function revalidateSocial(tenantId: string, conceptId?: string) {
  revalidatePath(`/klanten/${tenantId}/content`);
  revalidatePath(`/klanten/${tenantId}/content/social`);
  if (conceptId) revalidatePath(`/klanten/${tenantId}/content/social/${conceptId}`);
}

export async function listSocialPostConceptsAction(
  tenantId: string,
): Promise<ActionResult<SocialPostConceptSummary[]>> {
  const supabase = await authed();
  const listed = await supabase.schema("app").rpc("list_social_post_concepts", { p_tenant_id: tenantId });
  if (listed.error) return { ok: false, error: migration(listed.error.message) };
  const rows = Array.isArray(listed.data) ? listed.data : [];
  return {
    ok: true,
    data: rows
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((row) => ({
        id: String(row.id),
        caption: String(row.caption ?? ""),
        topicText: String(row.topicText ?? ""),
        format: asFormat(row.format),
        channels: asChannels(row.channels),
        updatedAt: String(row.updatedAt ?? ""),
      })),
  };
}

export async function loadSocialPostConceptAction(
  conceptId: string,
): Promise<ActionResult<SocialPostConcept>> {
  const supabase = await authed();
  const loaded = await supabase.schema("app").rpc("get_social_post_concept", { p_concept_id: conceptId });
  if (loaded.error || !loaded.data) {
    return { ok: false, error: migration(loaded.error?.message ?? "Concept laden mislukt") };
  }
  const mapped = await mapConcept(loaded.data);
  if (!mapped) return { ok: false, error: "Concept laden mislukt" };
  return { ok: true, data: mapped };
}

export async function createSocialPostConceptAction(input: {
  tenantId: string;
  channels: SocialChannel[];
  format: SocialFormat;
  topicMode: SocialTopicMode;
  topicText: string;
  blogConceptId?: string | null;
  meetingRecordingId?: string | null;
}): Promise<ActionResult<SocialPostConcept>> {
  if (input.channels.length === 0) return { ok: false, error: "Kies minstens één kanaal." };
  if (!FORMATS.has(input.format)) return { ok: false, error: "Kies een geldig formaat." };

  const brand = await loadBlogBrandContextAction(input.tenantId);
  if (!brand.ok || !brand.data) return { ok: false, error: brand.ok ? "Merkcontext ontbreekt." : brand.error };

  const supabase = await authed();
  const brandRow = await supabase.schema("app").rpc("get_client_brand", { p_tenant_id: input.tenantId });
  const brandData =
    (brandRow.data as { brand?: { id?: string; versionNumber?: number } | null } | null)?.brand ?? null;

  const created = await supabase.schema("app").rpc("create_social_post_concept", {
    p_tenant_id: input.tenantId,
    p_channels: input.channels,
    p_format: input.format,
    p_topic_mode: input.topicMode,
    p_topic_text: input.topicText.trim(),
    p_blog_concept_id: input.blogConceptId || null,
    p_meeting_recording_id: input.meetingRecordingId || null,
    p_brand_id: brandData?.id ?? null,
    p_brand_version_number: brandData?.versionNumber ?? brand.data.versionNumber,
    p_brand_voice_snapshot: brand.data.voice,
    p_brand_visual_snapshot: brand.data.visual,
  });
  if (created.error || !created.data) {
    return { ok: false, error: migration(created.error?.message ?? "Concept aanmaken mislukt") };
  }
  const mapped = await mapConcept(created.data);
  if (!mapped) return { ok: false, error: "Concept aanmaken mislukt" };
  revalidateSocial(input.tenantId, mapped.id);
  return { ok: true, data: mapped };
}

export async function saveSocialPostConceptAction(
  conceptId: string,
  expectedUpdatedAt: string,
  patch: Record<string, unknown>,
): Promise<ActionResult<SocialPostConcept>> {
  const supabase = await authed();
  const saved = await supabase.schema("app").rpc("save_social_post_concept", {
    p_concept_id: conceptId,
    p_expected: expectedUpdatedAt,
    p_patch: patch,
  });
  if (saved.error || !saved.data) {
    return { ok: false, error: migration(saved.error?.message ?? "Opslaan mislukt") };
  }
  const mapped = await mapConcept(saved.data);
  if (!mapped) return { ok: false, error: "Opslaan mislukt" };
  revalidateSocial(mapped.tenantId, mapped.id);
  return { ok: true, data: mapped };
}

async function resolveTopicContext(
  concept: SocialPostConcept,
): Promise<{ topic: string; sourceContext: string; blogHtml: string }> {
  const supabase = await authed();
  let topic = concept.topicText.trim();
  let sourceContext = "";
  let blogHtml = "";

  if (concept.topicMode === "blog" && concept.blogConceptId) {
    const blog = await supabase.schema("app").rpc("get_blog_concept", { p_concept_id: concept.blogConceptId });
    if (!blog.error && blog.data && typeof blog.data === "object") {
      const row = blog.data as Record<string, unknown>;
      topic = topic || String(row.title ?? row.sourceText ?? "Blogartikel");
      blogHtml = String(row.bodyHtml ?? "");
      sourceContext = [String(row.title ?? ""), String(row.bodyPlain ?? row.sourceText ?? "")]
        .filter(Boolean)
        .join("\n\n");
    }
  }

  if (concept.topicMode === "meeting" && concept.meetingRecordingId) {
    const { data } = await supabase
      .schema("app")
      .from("meeting_recordings")
      .select("title, subject, summary_text, full_text")
      .eq("id", concept.meetingRecordingId)
      .maybeSingle();
    if (data) {
      const row = data as Record<string, unknown>;
      topic =
        topic ||
        String(row.title ?? row.subject ?? "Meeting").trim() ||
        "Meeting";
      sourceContext = String(row.summary_text || row.full_text || "").slice(0, 8000);
    }
  }

  return { topic: topic || "Socialmediapost", sourceContext, blogHtml };
}

function normalizeCarouselSlides(raw: unknown): SocialCarouselSlide[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const title = String(row.title ?? "").trim();
      const subject = String(row.subject ?? "").trim();
      if (!title && !subject) return null;
      return {
        id: String(row.id ?? crypto.randomUUID()),
        title: (title || subject).slice(0, 80),
        subject: (subject || title).slice(0, 400),
      } satisfies SocialCarouselSlide;
    })
    .filter((item): item is SocialCarouselSlide => Boolean(item))
    .slice(0, 8);
}

export async function generateSocialCaptionAction(
  conceptId: string,
): Promise<ActionResult<SocialPostConcept>> {
  const loaded = await loadSocialPostConceptAction(conceptId);
  if (!loaded.ok || !loaded.data) return loaded;
  const concept = loaded.data;
  if (concept.channels.length === 0) return { ok: false, error: "Kies minstens één kanaal." };
  if (!concept.brandVoiceSnapshot || concept.brandVoiceSnapshot.trim().length < 20) {
    return { ok: false, error: "Tone of voice ontbreekt. Vul die eerst aan bij Brand." };
  }

  const supabase = await authed();
  await supabase.schema("app").rpc("save_social_post_concept", {
    p_concept_id: conceptId,
    p_expected: concept.updatedAt,
    p_patch: { textJobStatus: "running", textJobError: "" },
  });

  try {
    const { topic, sourceContext } = await resolveTopicContext(concept);
    const generated = await generateSocialCaption({
      topic,
      channels: concept.channels,
      format: concept.format,
      language: concept.language,
      voice: concept.brandVoiceSnapshot,
      sourceContext,
    });
    const saved = await supabase.schema("app").rpc("save_social_post_concept", {
      p_concept_id: conceptId,
      p_expected: null,
      p_patch: {
        caption: generated.caption,
        hashtags: generated.hashtags,
        topicText: concept.topicText.trim() || topic,
        textJobStatus: "ready",
        textJobError: "",
      },
    });
    if (saved.error || !saved.data) {
      return { ok: false, error: migration(saved.error?.message ?? "Caption opslaan mislukt") };
    }
    const mapped = await mapConcept(saved.data);
    if (!mapped) return { ok: false, error: "Caption genereren mislukt" };
    revalidateSocial(mapped.tenantId, mapped.id);
    return { ok: true, data: mapped };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Caption genereren mislukt";
    await supabase.schema("app").rpc("save_social_post_concept", {
      p_concept_id: conceptId,
      p_expected: null,
      p_patch: { textJobStatus: "failed", textJobError: message },
    });
    return { ok: false, error: message };
  }
}

export async function planSocialCarouselOutlineAction(
  conceptId: string,
  options?: { caption?: string },
): Promise<ActionResult<SocialCarouselSlide[]>> {
  const loaded = await loadSocialPostConceptAction(conceptId);
  if (!loaded.ok || !loaded.data) return loaded;
  const concept = loaded.data;
  if (concept.format !== "carousel") {
    return { ok: false, error: "Outline is alleen voor carrousel." };
  }

  const caption = (options?.caption ?? concept.caption).trim();
  if (!caption && !concept.topicText.trim() && concept.topicMode === "manual") {
    return { ok: false, error: "Genereer eerst een caption of vul een onderwerp in." };
  }

  try {
    const { topic, sourceContext, blogHtml } = await resolveTopicContext(concept);
    const fromBlog = concept.topicMode === "blog" ? slidesFromBlogHtml(blogHtml) : [];
    const slides = await generateCarouselOutline({
      topic,
      caption: caption || topic,
      language: concept.language,
      sourceContext,
      preferredSlides: fromBlog.length >= 2 ? fromBlog : undefined,
    });
    return { ok: true, data: slides };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Outline maken mislukt";
    return { ok: false, error: message };
  }
}

export async function generateSocialVisualAction(
  conceptId: string,
  options?: { styleId?: string; subject?: string; slides?: SocialCarouselSlide[] },
): Promise<ActionResult<SocialPostConcept>> {
  const loaded = await loadSocialPostConceptAction(conceptId);
  if (!loaded.ok || !loaded.data) return loaded;
  const concept = loaded.data;

  const brand = await loadBlogBrandContextAction(concept.tenantId);
  if (!brand.ok || !brand.data) return { ok: false, error: brand.ok ? "Merkcontext ontbreekt." : brand.error };
  if (!brand.data.hasVisual || brand.data.styles.length === 0) {
    return { ok: false, error: "Beeldstijl ontbreekt. Vul Brand → Beeldstijl aan." };
  }

  const selectedStyle =
    brand.data.styles.find((style) => style.id === options?.styleId) ?? brand.data.styles[0];

  const supabase = await authed();
  await supabase.schema("app").rpc("save_social_post_concept", {
    p_concept_id: conceptId,
    p_expected: concept.updatedAt,
    p_patch: { imageJobStatus: "running", imageJobError: "" },
  });

  try {
    const { topic } = await resolveTopicContext(concept);
    const admin = createAdminClient();

    const carouselSlides =
      concept.format === "carousel" ? normalizeCarouselSlides(options?.slides) : [];

    if (concept.format === "carousel" && carouselSlides.length < 2) {
      throw new Error("Maak eerst een carrousel-outline (minstens 2 slides) in Beeld.");
    }

    const jobs: { subject: string; slideTitle?: string; slideIndex?: number; slideCount?: number }[] =
      concept.format === "carousel"
        ? carouselSlides.map((slide, index) => ({
            subject: slide.subject,
            slideTitle: slide.title,
            slideIndex: index,
            slideCount: carouselSlides.length,
          }))
        : [{ subject: options?.subject?.trim() || topic }];

    let mapped: SocialPostConcept | null = null;
    for (const [index, job] of jobs.entries()) {
      const image = await generateSocialImage({
        topic,
        caption: concept.caption,
        format: concept.format,
        stylePrompt: selectedStyle.stylePrompt,
        tags: selectedStyle.tags,
        doText: selectedStyle.do,
        avoidText: selectedStyle.avoid,
        colors: brand.data.colors,
        brandName: brand.data.brandName || brand.data.tenantName,
        styleName: selectedStyle.name,
        subject: job.subject,
        slideTitle: job.slideTitle,
        slideIndex: job.slideIndex,
        slideCount: job.slideCount,
      });

      const ext = image.mime.includes("jpeg") ? "jpg" : image.mime.includes("webp") ? "webp" : "png";
      const path = `${concept.tenantId}/social/${conceptId}/${crypto.randomUUID()}.${ext}`;
      const uploaded = await admin.storage.from("content-assets").upload(path, image.bytes, {
        contentType: image.mime,
        upsert: false,
      });
      if (uploaded.error) {
        throw new Error(/bucket|mime/i.test(uploaded.error.message) ? SOCIAL_MIGRATION : uploaded.error.message);
      }

      const alt =
        job.slideTitle?.slice(0, 120)
        || job.subject.slice(0, 120)
        || topic.slice(0, 120)
        || "Social visual";

      const added = await supabase.schema("app").rpc("add_social_post_asset", {
        p_concept_id: conceptId,
        p_path: path,
        p_mime: image.mime,
        p_width: image.width,
        p_height: image.height,
        p_kind: "ai",
        p_prompt: image.prompt,
        p_style_summary: image.styleSummary,
        p_alt_text: alt,
        p_select: index === 0,
      });
      if (added.error || !added.data) {
        throw new Error(migration(added.error?.message ?? "Visual opslaan mislukt"));
      }
      mapped = await mapConcept(added.data);
      if (!mapped) throw new Error("Visual opslaan mislukt");
    }

    if (!mapped) throw new Error("Visual opslaan mislukt");
    revalidateSocial(mapped.tenantId, mapped.id);
    return { ok: true, data: mapped };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Visual genereren mislukt";
    await supabase.schema("app").rpc("save_social_post_concept", {
      p_concept_id: conceptId,
      p_expected: null,
      p_patch: { imageJobStatus: "failed", imageJobError: message },
    });
    return { ok: false, error: message };
  }
}

export async function uploadSocialAssetAction(
  conceptId: string,
  formData: FormData,
): Promise<ActionResult<SocialPostConcept>> {
  const loaded = await loadSocialPostConceptAction(conceptId);
  if (!loaded.ok || !loaded.data) return loaded;
  const concept = loaded.data;

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Geen bestand gekozen." };
  if (file.size > 8 * 1024 * 1024) return { ok: false, error: "Bestand is groter dan 8 MB." };
  const mime = file.type || "image/png";
  if (!/^image\/(png|jpeg|webp)$/.test(mime)) {
    return { ok: false, error: "Alleen PNG, JPEG of WebP." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = mime.includes("jpeg") ? "jpg" : mime.includes("webp") ? "webp" : "png";
  const path = `${concept.tenantId}/social/${conceptId}/${crypto.randomUUID()}.${ext}`;
  const admin = createAdminClient();
  const uploaded = await admin.storage.from("content-assets").upload(path, bytes, {
    contentType: mime,
    upsert: false,
  });
  if (uploaded.error) {
    return { ok: false, error: /bucket|mime/i.test(uploaded.error.message) ? SOCIAL_MIGRATION : uploaded.error.message };
  }

  const supabase = await authed();
  const added = await supabase.schema("app").rpc("add_social_post_asset", {
    p_concept_id: conceptId,
    p_path: path,
    p_mime: mime,
    p_width: null,
    p_height: null,
    p_kind: "upload",
    p_prompt: "",
    p_style_summary: "Geüpload beeld",
    p_alt_text: file.name.replace(/\.[^.]+$/, "").slice(0, 120) || "Upload",
    p_select: true,
  });
  if (added.error || !added.data) {
    return { ok: false, error: migration(added.error?.message ?? "Upload opslaan mislukt") };
  }
  const mapped = await mapConcept(added.data);
  if (!mapped) return { ok: false, error: "Upload opslaan mislukt" };
  revalidateSocial(mapped.tenantId, mapped.id);
  return { ok: true, data: mapped };
}

export async function selectSocialAssetAction(
  conceptId: string,
  expectedUpdatedAt: string,
  assetId: string,
): Promise<ActionResult<SocialPostConcept>> {
  return saveSocialPostConceptAction(conceptId, expectedUpdatedAt, { selectedAssetId: assetId });
}

export async function deleteSocialAssetAction(assetId: string): Promise<ActionResult<SocialPostConcept>> {
  const supabase = await authed();
  const deleted = await supabase.schema("app").rpc("delete_social_post_asset", { p_asset_id: assetId });
  if (deleted.error || !deleted.data) {
    return { ok: false, error: migration(deleted.error?.message ?? "Asset verwijderen mislukt") };
  }
  const row = deleted.data as { concept?: unknown; storagePath?: string };
  if (row.storagePath) {
    try {
      const admin = createAdminClient();
      await admin.storage.from("content-assets").remove([String(row.storagePath)]);
    } catch {
      // orphan later
    }
  }
  const mapped = await mapConcept(row.concept);
  if (!mapped) return { ok: false, error: "Asset verwijderen mislukt" };
  revalidateSocial(mapped.tenantId, mapped.id);
  return { ok: true, data: mapped };
}

export async function deleteSocialPostConceptAction(
  conceptId: string,
): Promise<ActionResult<{ tenantId: string }>> {
  const supabase = await authed();
  const deleted = await supabase.schema("app").rpc("delete_social_post_concept", { p_concept_id: conceptId });
  if (deleted.error || !deleted.data) {
    return { ok: false, error: migration(deleted.error?.message ?? "Concept verwijderen mislukt") };
  }
  const row = deleted.data as { tenantId?: string; storagePaths?: unknown };
  const tenantId = String(row.tenantId ?? "");
  const paths = Array.isArray(row.storagePaths) ? row.storagePaths.map(String).filter(Boolean) : [];
  if (paths.length > 0) {
    try {
      const admin = createAdminClient();
      await admin.storage.from("content-assets").remove(paths);
    } catch {
      // orphan later
    }
  }
  if (tenantId) revalidateSocial(tenantId, conceptId);
  return { ok: true, data: { tenantId } };
}
