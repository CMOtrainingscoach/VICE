"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdminMfa, requireSession } from "@/lib/auth/session";
import {
  AD_MIGRATION,
  defaultPayload,
  type AdConcept,
  type AdConceptAsset,
  type AdConceptSummary,
  type AdCopyPayload,
  type AdFolder,
  type AdFormat,
  type AdPlatform,
  type AdStatus,
  type MetaPlacement,
  isGoogleRsa,
} from "@/lib/content/ad-types";
import { generateAdCopy } from "@/lib/content/ad-ai";
import { adTemplateByKey, payloadForNewAd } from "@/lib/content/ad-templates";
import {
  assertBuyerPersonaForGeneration,
  fetchAudiencePromptBlockForTenant,
} from "@/modules/content/audience-actions";
import { fetchContentLearningPromptBlock } from "@/lib/content/content-learning";
import { loadBlogBrandContextAction } from "@/modules/content/blog-actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const MISSING =
  /list_ad_|get_ad_|create_ad_|save_ad_|add_ad_|delete_ad_|upsert_ad_folder|schema cache|does not exist|Could not find the function/i;

function migration(message: string) {
  return MISSING.test(message) ? AD_MIGRATION : message;
}

async function authed() {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);
  return createClient();
}

const PLATFORMS = new Set<AdPlatform>(["google_search", "meta"]);
const FORMATS = new Set<AdFormat>(["rsa", "single_image", "carousel"]);
const STATUSES = new Set<AdStatus>(["draft", "ready_for_export", "archived"]);
const META = new Set<MetaPlacement>(["facebook", "instagram"]);

function asPlatform(value: unknown): AdPlatform {
  return PLATFORMS.has(value as AdPlatform) ? (value as AdPlatform) : "google_search";
}

function asFormat(value: unknown): AdFormat {
  return FORMATS.has(value as AdFormat) ? (value as AdFormat) : "rsa";
}

function asStatus(value: unknown): AdStatus {
  return STATUSES.has(value as AdStatus) ? (value as AdStatus) : "draft";
}

function asMetaPlacements(value: unknown): MetaPlacement[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).filter((item): item is MetaPlacement => META.has(item as MetaPlacement));
}

function asPayload(platform: AdPlatform, format: AdFormat, raw: unknown): AdCopyPayload {
  if (raw && typeof raw === "object") return raw as AdCopyPayload;
  return defaultPayload(platform, format);
}

async function mapAsset(raw: unknown): Promise<AdConceptAsset | null> {
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
    kind: row.kind === "beeld" ? "beeld" : "upload",
    altText: String(row.altText ?? ""),
    sortOrder: Number(row.sortOrder) || 0,
    createdAt: String(row.createdAt ?? ""),
    url,
  };
}

async function mapConcept(raw: unknown): Promise<AdConcept | null> {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (!row.id) return null;
  const platform = asPlatform(row.platform);
  const format = asFormat(row.format);
  const assets = (await Promise.all((Array.isArray(row.assets) ? row.assets : []).map(mapAsset))).filter(
    (item): item is AdConceptAsset => Boolean(item),
  );
  const selected = row.selectedAsset ? await mapAsset(row.selectedAsset) : null;
  const localeRaw =
    row.localePayloads && typeof row.localePayloads === "object"
      ? (row.localePayloads as Record<string, unknown>)
      : {};
  const localePayloads: Record<string, AdCopyPayload> = {};
  for (const [key, value] of Object.entries(localeRaw)) {
    localePayloads[key] = asPayload(platform, format, value);
  }
  return {
    id: String(row.id),
    tenantId: String(row.tenantId ?? ""),
    folderId: row.folderId ? String(row.folderId) : null,
    folderName: row.folderName ? String(row.folderName) : null,
    internalName: String(row.internalName ?? ""),
    platform,
    format,
    metaPlacements: asMetaPlacements(row.metaPlacements),
    status: asStatus(row.status),
    multiLanguageEnabled: Boolean(row.multiLanguageEnabled),
    primaryLanguage: String(row.primaryLanguage ?? "nl"),
    legalReviewRequired: Boolean(row.legalReviewRequired),
    legalReviewCleared: Boolean(row.legalReviewCleared),
    legalNote: String(row.legalNote ?? ""),
    payload: asPayload(platform, format, row.payload),
    localePayloads,
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    templateKey: String(row.templateKey ?? ""),
    beeldCompositionId: row.beeldCompositionId ? String(row.beeldCompositionId) : null,
    selectedAssetId: row.selectedAssetId ? String(row.selectedAssetId) : null,
    selectedAsset: selected,
    assets,
    brandId: row.brandId ? String(row.brandId) : null,
    brandVersionNumber: row.brandVersionNumber != null ? Number(row.brandVersionNumber) : null,
    brandVoiceSnapshot: String(row.brandVoiceSnapshot ?? ""),
    brandVisualSnapshot:
      row.brandVisualSnapshot && typeof row.brandVisualSnapshot === "object"
        ? (row.brandVisualSnapshot as Record<string, unknown>)
        : {},
    buyerPersonaId: row.buyerPersonaId ? String(row.buyerPersonaId) : null,
    brandCharacterId: row.brandCharacterId ? String(row.brandCharacterId) : null,
    createdAt: String(row.createdAt ?? ""),
    updatedAt: String(row.updatedAt ?? ""),
  };
}

function revalidateAds(tenantId: string, conceptId?: string) {
  revalidatePath(`/klanten/${tenantId}/content`);
  revalidatePath(`/klanten/${tenantId}/content/ads`);
  if (conceptId) revalidatePath(`/klanten/${tenantId}/content/ads/${conceptId}`);
}

export async function listAdFoldersAction(tenantId: string): Promise<ActionResult<AdFolder[]>> {
  const supabase = await authed();
  const listed = await supabase.schema("app").rpc("list_ad_folders", { p_tenant_id: tenantId });
  if (listed.error) return { ok: false, error: migration(listed.error.message) };
  const rows = Array.isArray(listed.data) ? listed.data : [];
  return {
    ok: true,
    data: rows
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((row) => ({
        id: String(row.id),
        name: String(row.name ?? ""),
        sortOrder: Number(row.sortOrder) || 0,
      })),
  };
}

export async function upsertAdFolderAction(
  tenantId: string,
  folderId: string | null,
  name: string,
): Promise<ActionResult<AdFolder>> {
  const supabase = await authed();
  const saved = await supabase.schema("app").rpc("upsert_ad_folder", {
    p_tenant_id: tenantId,
    p_folder_id: folderId,
    p_name: name.trim(),
  });
  if (saved.error || !saved.data) {
    return { ok: false, error: migration(saved.error?.message ?? "Map opslaan mislukt") };
  }
  const row = saved.data as Record<string, unknown>;
  revalidateAds(tenantId);
  return {
    ok: true,
    data: {
      id: String(row.id),
      name: String(row.name ?? ""),
      sortOrder: Number(row.sortOrder) || 0,
    },
  };
}

export type AdListVisibility = "active" | "archived" | "all";

export async function listAdConceptsAction(
  tenantId: string,
  folderId?: string | null,
  visibility: AdListVisibility = "active",
): Promise<ActionResult<AdConceptSummary[]>> {
  const supabase = await authed();
  const listed = await supabase.schema("app").rpc("list_ad_concepts", {
    p_tenant_id: tenantId,
    p_folder_id: folderId ?? null,
    p_visibility: visibility,
  });
  if (listed.error) return { ok: false, error: migration(listed.error.message) };
  const rows = Array.isArray(listed.data) ? listed.data : [];
  return {
    ok: true,
    data: rows
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((row) => ({
        id: String(row.id),
        internalName: String(row.internalName ?? ""),
        platform: asPlatform(row.platform),
        format: asFormat(row.format),
        status: asStatus(row.status),
        folderId: row.folderId ? String(row.folderId) : null,
        tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
        legalReviewRequired: Boolean(row.legalReviewRequired),
        legalReviewCleared: Boolean(row.legalReviewCleared),
        updatedAt: String(row.updatedAt ?? ""),
      })),
  };
}

export async function loadAdConceptAction(conceptId: string): Promise<ActionResult<AdConcept>> {
  const supabase = await authed();
  const loaded = await supabase.schema("app").rpc("get_ad_concept", { p_concept_id: conceptId });
  if (loaded.error || !loaded.data) {
    return { ok: false, error: migration(loaded.error?.message ?? "Advertentie laden mislukt") };
  }
  const mapped = await mapConcept(loaded.data);
  if (!mapped) return { ok: false, error: "Advertentie laden mislukt" };
  return { ok: true, data: mapped };
}

export async function createAdConceptAction(input: {
  tenantId: string;
  platform: AdPlatform;
  format: AdFormat;
  templateKey?: string;
  folderId?: string | null;
  metaPlacements?: MetaPlacement[];
  internalName?: string;
}): Promise<ActionResult<AdConcept>> {
  if (!PLATFORMS.has(input.platform)) return { ok: false, error: "Onbekend platform." };
  if (!FORMATS.has(input.format)) return { ok: false, error: "Onbekend formaat." };
  if (input.platform === "google_search" && input.format !== "rsa") {
    return { ok: false, error: "Google Search ondersteunt alleen RSA in fase 1." };
  }
  if (input.platform === "meta" && input.format === "rsa") {
    return { ok: false, error: "Kies enkel beeld of carrousel voor Meta." };
  }
  if (input.platform === "meta" && (!input.metaPlacements || input.metaPlacements.length === 0)) {
    return { ok: false, error: "Kies minstens één Meta-plaatsing." };
  }

  const brand = await loadBlogBrandContextAction(input.tenantId);
  if (!brand.ok || !brand.data) return { ok: false, error: brand.ok ? "Merkcontext ontbreekt." : brand.error };

  const template = input.templateKey ? adTemplateByKey(input.templateKey) : undefined;
  const payload = payloadForNewAd(input.platform, input.format, input.templateKey);
  const internalName =
    input.internalName?.trim() ||
    template?.defaultInternalName ||
    (input.platform === "google_search" ? "Nieuwe Google-ad" : "Nieuwe Meta-ad");

  const supabase = await authed();
  const brandRow = await supabase.schema("app").rpc("get_client_brand", { p_tenant_id: input.tenantId });
  const brandData =
    (brandRow.data as { brand?: { id?: string; versionNumber?: number } | null } | null)?.brand ?? null;

  const created = await supabase.schema("app").rpc("create_ad_concept", {
    p_tenant_id: input.tenantId,
    p_platform: input.platform,
    p_format: input.format,
    p_meta_placements: input.platform === "meta" ? input.metaPlacements : [],
    p_folder_id: input.folderId ?? null,
    p_template_key: input.templateKey ?? template?.key ?? "",
    p_payload: payload,
    p_internal_name: internalName,
    p_brand_id: brandData?.id ?? null,
    p_brand_version_number: brandData?.versionNumber ?? brand.data.versionNumber,
    p_brand_voice_snapshot: brand.data.voice,
    p_brand_visual_snapshot: brand.data.visual,
  });
  if (created.error || !created.data) {
    return { ok: false, error: migration(created.error?.message ?? "Advertentie aanmaken mislukt") };
  }
  const mapped = await mapConcept(created.data);
  if (!mapped) return { ok: false, error: "Advertentie aanmaken mislukt" };
  revalidateAds(input.tenantId, mapped.id);
  return { ok: true, data: mapped };
}

export async function saveAdConceptAction(
  conceptId: string,
  expectedUpdatedAt: string,
  patch: Record<string, unknown>,
  options?: { quiet?: boolean },
): Promise<ActionResult<AdConcept>> {
  void options?.quiet;
  const supabase = await authed();
  const saved = await supabase.schema("app").rpc("save_ad_concept", {
    p_concept_id: conceptId,
    p_expected: expectedUpdatedAt,
    p_patch: patch,
  });
  if (saved.error || !saved.data) {
    return { ok: false, error: migration(saved.error?.message ?? "Opslaan mislukt") };
  }
  const mapped = await mapConcept(saved.data);
  if (!mapped) return { ok: false, error: "Opslaan mislukt" };
  revalidateAds(mapped.tenantId, mapped.id);
  return { ok: true, data: mapped };
}

export async function deleteAdConceptAction(conceptId: string): Promise<ActionResult> {
  const loaded = await loadAdConceptAction(conceptId);
  if (!loaded.ok || !loaded.data) return { ok: false, error: loaded.ok ? "Advertentie niet gevonden" : loaded.error };
  const supabase = await authed();
  const deleted = await supabase.schema("app").rpc("delete_ad_concept", { p_concept_id: conceptId });
  if (deleted.error) return { ok: false, error: migration(deleted.error.message) };
  revalidateAds(loaded.data.tenantId);
  return { ok: true };
}

export async function uploadAdAssetAction(
  conceptId: string,
  formData: FormData,
): Promise<ActionResult<AdConcept>> {
  const loaded = await loadAdConceptAction(conceptId);
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
  const path = `${concept.tenantId}/ads/${conceptId}/${crypto.randomUUID()}.${ext}`;
  const admin = createAdminClient();
  const uploaded = await admin.storage.from("content-assets").upload(path, bytes, {
    contentType: mime,
    upsert: false,
  });
  if (uploaded.error) {
    return { ok: false, error: uploaded.error.message };
  }

  const supabase = await authed();
  const added = await supabase.schema("app").rpc("add_ad_concept_asset", {
    p_concept_id: conceptId,
    p_path: path,
    p_mime: mime,
    p_width: null,
    p_height: null,
    p_kind: "upload",
    p_alt_text: file.name.replace(/\.[^.]+$/, "").slice(0, 120) || "Upload",
    p_select: true,
  });
  if (added.error || !added.data) {
    return { ok: false, error: migration(added.error?.message ?? "Asset toevoegen mislukt") };
  }
  const mapped = await mapConcept(added.data);
  if (!mapped) return { ok: false, error: "Asset toevoegen mislukt" };
  revalidateAds(mapped.tenantId, mapped.id);
  return { ok: true, data: mapped };
}

export async function deleteAdAssetAction(conceptId: string, assetId: string): Promise<ActionResult<AdConcept>> {
  void conceptId;
  const supabase = await authed();
  const deleted = await supabase.schema("app").rpc("delete_ad_concept_asset", { p_asset_id: assetId });
  if (deleted.error || !deleted.data) {
    return { ok: false, error: migration(deleted.error?.message ?? "Asset verwijderen mislukt") };
  }
  const mapped = await mapConcept(deleted.data);
  if (!mapped) return { ok: false, error: "Asset verwijderen mislukt" };
  revalidateAds(mapped.tenantId, mapped.id);
  return { ok: true, data: mapped };
}

export async function selectAdAssetAction(conceptId: string, assetId: string): Promise<ActionResult<AdConcept>> {
  const loaded = await loadAdConceptAction(conceptId);
  if (!loaded.ok || !loaded.data) return loaded;
  return saveAdConceptAction(conceptId, loaded.data.updatedAt, { selectedAssetId: assetId }, { quiet: true });
}

export async function generateAdCopyAction(
  conceptId: string,
  brief: string,
): Promise<ActionResult<AdConcept>> {
  const loaded = await loadAdConceptAction(conceptId);
  if (!loaded.ok || !loaded.data) {
    return { ok: false, error: loaded.ok ? "Advertentie niet gevonden" : loaded.error };
  }
  const concept = loaded.data;
  if (!concept.brandVoiceSnapshot || concept.brandVoiceSnapshot.trim().length < 20) {
    return { ok: false, error: "Tone of voice ontbreekt. Vul die eerst aan bij Brand." };
  }
  const personaCheck = await assertBuyerPersonaForGeneration(concept.tenantId, concept.buyerPersonaId);
  if (!personaCheck.ok) return personaCheck;

  const topic = brief.trim() || concept.internalName.trim() || "Advertentie";
  const supabase = await authed();
  const [contentLearnings, audienceContext] = await Promise.all([
    fetchContentLearningPromptBlock(supabase, concept.tenantId),
    fetchAudiencePromptBlockForTenant(concept.tenantId, concept.buyerPersonaId),
  ]);

  try {
    const generated = await generateAdCopy({
      platform: concept.platform,
      format: concept.format,
      language: concept.primaryLanguage,
      topic,
      voice: concept.brandVoiceSnapshot,
      audienceContext,
      contentLearnings,
      existingFinalUrl: isGoogleRsa(concept.payload) ? concept.payload.finalUrl : undefined,
    });
    return saveAdConceptAction(conceptId, concept.updatedAt, { payload: generated });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "AI-generatie mislukt",
    };
  }
}
