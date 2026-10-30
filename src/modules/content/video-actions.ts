"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdminMfa, requireSession } from "@/lib/auth/session";
import {
  createKlingImageToVideoTask,
  estimateKlingUnits,
  klingApiConfigured,
  queryKlingTask,
} from "@/lib/integrations/kling";
import {
  VIDEO_MIGRATION,
  type VideoAspectPreset,
  type VideoConcept,
  type VideoConceptSummary,
  type VideoDurationSeconds,
  type VideoIntendedUse,
  type VideoJobStatus,
  type VideoResolution,
  type VideoSourceKind,
} from "@/lib/content/video-types";
import { loadBlogBrandContextAction } from "@/modules/content/blog-actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const MISSING =
  /video_concept|platform_kling|list_video|get_video|create_video|save_video|delete_video|schema cache|does not exist|Could not find the function/i;

function migration(message: string) {
  return MISSING.test(message) ? VIDEO_MIGRATION : message;
}

async function authed() {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);
  return createClient();
}

async function signedUrl(path: string, expires = 60 * 60): Promise<string | null> {
  if (!path) return null;
  try {
    const admin = createAdminClient();
    const signed = await admin.storage.from("content-assets").createSignedUrl(path, expires);
    return signed.data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

async function mapConcept(raw: unknown): Promise<VideoConcept | null> {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (!row.id) return null;
  const sourceImagePath = String(row.sourceImagePath ?? "");
  const outputVideoPath = String(row.outputVideoPath ?? "");
  const [sourceImageUrl, outputVideoUrl] = await Promise.all([
    signedUrl(sourceImagePath),
    signedUrl(outputVideoPath, 60 * 60 * 24),
  ]);
  return {
    id: String(row.id),
    tenantId: String(row.tenantId ?? ""),
    internalName: String(row.internalName ?? ""),
    intendedUse: String(row.intendedUse ?? "general") as VideoIntendedUse,
    aspectPreset: String(row.aspectPreset ?? "reel_9_16") as VideoAspectPreset,
    durationSeconds: (Number(row.durationSeconds) === 10 ? 10 : 5) as VideoDurationSeconds,
    resolution: (row.resolution === "1080p" ? "1080p" : "720p") as VideoResolution,
    motionPrompt: String(row.motionPrompt ?? ""),
    sourceKind: (row.sourceKind === "beeld" ? "beeld" : "upload") as VideoSourceKind,
    sourceImagePath,
    sourceMimeType: String(row.sourceMimeType ?? "image/jpeg"),
    beeldCompositionId: row.beeldCompositionId ? String(row.beeldCompositionId) : null,
    outputVideoPath,
    outputMimeType: String(row.outputMimeType ?? "video/mp4"),
    jobStatus: String(row.jobStatus ?? "idle") as VideoJobStatus,
    klingTaskId: String(row.klingTaskId ?? ""),
    jobError: String(row.jobError ?? ""),
    unitsEstimated: row.unitsEstimated != null ? Number(row.unitsEstimated) : null,
    unitsCharged: row.unitsCharged != null ? Number(row.unitsCharged) : null,
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
    sourceImageUrl,
    outputVideoUrl,
  };
}

function revalidateVideo(tenantId: string, conceptId?: string) {
  revalidatePath(`/klanten/${tenantId}/content`);
  revalidatePath(`/klanten/${tenantId}/content/video`);
  if (conceptId) revalidatePath(`/klanten/${tenantId}/content/video/${conceptId}`);
}

export async function listVideoConceptsAction(
  tenantId: string,
): Promise<ActionResult<VideoConceptSummary[]>> {
  const supabase = await authed();
  const listed = await supabase.schema("app").rpc("list_video_concepts", { p_tenant_id: tenantId });
  if (listed.error) return { ok: false, error: migration(listed.error.message) };
  const rows = Array.isArray(listed.data) ? listed.data : [];
  return {
    ok: true,
    data: rows
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((row) => ({
        id: String(row.id),
        internalName: String(row.internalName ?? ""),
        intendedUse: String(row.intendedUse ?? "general") as VideoIntendedUse,
        aspectPreset: String(row.aspectPreset ?? "reel_9_16") as VideoAspectPreset,
        durationSeconds: (Number(row.durationSeconds) === 10 ? 10 : 5) as VideoDurationSeconds,
        jobStatus: String(row.jobStatus ?? "idle") as VideoJobStatus,
        updatedAt: String(row.updatedAt ?? ""),
      })),
  };
}

export async function loadVideoConceptAction(conceptId: string): Promise<ActionResult<VideoConcept>> {
  const supabase = await authed();
  const loaded = await supabase.schema("app").rpc("get_video_concept", { p_concept_id: conceptId });
  if (loaded.error || !loaded.data) {
    return { ok: false, error: migration(loaded.error?.message ?? "Video laden mislukt") };
  }
  const mapped = await mapConcept(loaded.data);
  if (!mapped) return { ok: false, error: "Video laden mislukt" };
  return { ok: true, data: mapped };
}

export async function createVideoConceptAction(input: {
  tenantId: string;
  internalName?: string;
  intendedUse?: VideoIntendedUse;
  aspectPreset?: VideoAspectPreset;
}): Promise<ActionResult<VideoConcept>> {
  const brand = await loadBlogBrandContextAction(input.tenantId);
  if (!brand.ok || !brand.data) return { ok: false, error: brand.ok ? "Merkcontext ontbreekt." : brand.error };

  const supabase = await authed();
  const brandRow = await supabase.schema("app").rpc("get_client_brand", { p_tenant_id: input.tenantId });
  const brandData =
    (brandRow.data as { brand?: { id?: string; versionNumber?: number } | null } | null)?.brand ?? null;

  const created = await supabase.schema("app").rpc("create_video_concept", {
    p_tenant_id: input.tenantId,
    p_internal_name: input.internalName?.trim() || "Nieuwe video",
    p_intended_use: input.intendedUse ?? "general",
    p_aspect_preset: input.aspectPreset ?? "reel_9_16",
    p_duration_seconds: 5,
    p_resolution: "720p",
    p_brand_id: brandData?.id ?? null,
    p_brand_version_number: brandData?.versionNumber ?? brand.data.versionNumber,
    p_brand_voice_snapshot: brand.data.voice,
    p_brand_visual_snapshot: brand.data.visual,
  });
  if (created.error || !created.data) {
    return { ok: false, error: migration(created.error?.message ?? "Video aanmaken mislukt") };
  }
  const mapped = await mapConcept(created.data);
  if (!mapped) return { ok: false, error: "Video aanmaken mislukt" };
  revalidateVideo(input.tenantId, mapped.id);
  return { ok: true, data: mapped };
}

export async function saveVideoConceptAction(
  conceptId: string,
  expectedUpdatedAt: string,
  patch: Record<string, unknown>,
): Promise<ActionResult<VideoConcept>> {
  const supabase = await authed();
  const saved = await supabase.schema("app").rpc("save_video_concept", {
    p_concept_id: conceptId,
    p_expected: expectedUpdatedAt,
    p_patch: patch,
  });
  if (saved.error || !saved.data) {
    return { ok: false, error: migration(saved.error?.message ?? "Opslaan mislukt") };
  }
  const mapped = await mapConcept(saved.data);
  if (!mapped) return { ok: false, error: "Opslaan mislukt" };
  revalidateVideo(mapped.tenantId, mapped.id);
  return { ok: true, data: mapped };
}

export async function deleteVideoConceptAction(conceptId: string): Promise<ActionResult> {
  const loaded = await loadVideoConceptAction(conceptId);
  if (!loaded.ok || !loaded.data) {
    return { ok: false, error: loaded.ok ? "Video niet gevonden" : loaded.error };
  }
  const supabase = await authed();
  const deleted = await supabase.schema("app").rpc("delete_video_concept", { p_concept_id: conceptId });
  if (deleted.error) return { ok: false, error: migration(deleted.error.message) };
  revalidateVideo(loaded.data.tenantId);
  return { ok: true };
}

export async function uploadVideoSourceImageAction(
  conceptId: string,
  formData: FormData,
): Promise<ActionResult<VideoConcept>> {
  const loaded = await loadVideoConceptAction(conceptId);
  if (!loaded.ok || !loaded.data) return loaded;
  const concept = loaded.data;

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Geen bestand gekozen." };
  if (file.size > 8 * 1024 * 1024) return { ok: false, error: "Bestand is groter dan 8 MB." };
  const mime = file.type || "image/jpeg";
  if (!/^image\/(png|jpeg|webp)$/.test(mime)) {
    return { ok: false, error: "Alleen PNG, JPEG of WebP." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = mime.includes("jpeg") ? "jpg" : mime.includes("webp") ? "webp" : "png";
  const path = `${concept.tenantId}/video/${conceptId}/source_${crypto.randomUUID()}.${ext}`;
  const admin = createAdminClient();
  const uploaded = await admin.storage.from("content-assets").upload(path, bytes, {
    contentType: mime,
    upsert: false,
  });
  if (uploaded.error) return { ok: false, error: uploaded.error.message };

  return saveVideoConceptAction(conceptId, concept.updatedAt, {
    sourceKind: "upload",
    sourceImagePath: path,
    sourceMimeType: mime,
    beeldCompositionId: null,
    jobStatus: "idle",
    jobError: "",
    outputVideoPath: "",
    klingTaskId: "",
  });
}

export async function startVideoGenerationAction(conceptId: string): Promise<ActionResult<VideoConcept>> {
  if (!klingApiConfigured()) {
    return { ok: false, error: "KLING_API_KEY ontbreekt in de serveromgeving." };
  }

  const loaded = await loadVideoConceptAction(conceptId);
  if (!loaded.ok || !loaded.data) return loaded;
  const concept = loaded.data;

  if (!concept.sourceImagePath) {
    return { ok: false, error: "Upload eerst een startbeeld of importeer beeldmateriaal." };
  }
  if (!concept.motionPrompt.trim()) {
    return { ok: false, error: "Vul een motion prompt in (wat moet er gebeuren?)." };
  }
  if (concept.jobStatus === "processing") {
    return { ok: false, error: "Er loopt al een generatie." };
  }

  const imageUrl = await signedUrl(concept.sourceImagePath, 60 * 60);
  if (!imageUrl) return { ok: false, error: "Startbeeld kon niet worden gedeeld met Kling." };

  const units = estimateKlingUnits(concept.durationSeconds, concept.resolution);

  const admin = createAdminClient();
  const balanceRow = await admin.schema("app").from("platform_kling_credits").select("units_balance").eq("id", 1).maybeSingle();
  const balance = Number(balanceRow.data?.units_balance) || 0;
  if (balance < units) {
    return {
      ok: false,
      error: `Onvoldoende Kling-units (nodig ~${units}, saldo ${balance}). Laad op in Instellingen.`,
    };
  }

  try {
    const task = await createKlingImageToVideoTask({
      motionPrompt: concept.motionPrompt,
      imageUrl,
      durationSeconds: concept.durationSeconds,
      resolution: concept.resolution,
      externalTaskId: conceptId,
    });

    return saveVideoConceptAction(conceptId, concept.updatedAt, {
      jobStatus: "processing",
      klingTaskId: task.taskId,
      jobError: "",
      unitsEstimated: units,
      outputVideoPath: "",
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Kling start mislukt" };
  }
}

async function downloadMp4(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("MP4 download van Kling mislukt.");
  return new Uint8Array(await response.arrayBuffer());
}

export async function pollVideoGenerationAction(conceptId: string): Promise<ActionResult<VideoConcept>> {
  const loaded = await loadVideoConceptAction(conceptId);
  if (!loaded.ok || !loaded.data) return loaded;
  const concept = loaded.data;

  if (concept.jobStatus !== "processing" || !concept.klingTaskId) {
    return { ok: true, data: concept };
  }

  try {
    const task = await queryKlingTask(concept.klingTaskId);

    if (task.status === "submitted" || task.status === "processing") {
      return { ok: true, data: concept };
    }

    if (task.status === "failed") {
      return saveVideoConceptAction(conceptId, concept.updatedAt, {
        jobStatus: "failed",
        jobError: task.message || "Kling-generatie mislukt",
      });
    }

    if (!task.video?.url) {
      return saveVideoConceptAction(conceptId, concept.updatedAt, {
        jobStatus: "failed",
        jobError: "Geen video-URL van Kling ontvangen.",
      });
    }

    const bytes = await downloadMp4(task.video.url);
    const path = `${concept.tenantId}/video/${conceptId}/${crypto.randomUUID()}.mp4`;
    const admin = createAdminClient();
    const uploaded = await admin.storage.from("content-assets").upload(path, bytes, {
      contentType: "video/mp4",
      upsert: false,
    });
    if (uploaded.error) {
      return saveVideoConceptAction(conceptId, concept.updatedAt, {
        jobStatus: "failed",
        jobError: uploaded.error.message,
      });
    }

    const units = concept.unitsEstimated ?? estimateKlingUnits(concept.durationSeconds, concept.resolution);
    const deducted = await admin.schema("app").rpc("try_deduct_platform_kling_credits", {
      p_amount: units,
      p_video_concept_id: conceptId,
      p_note: `Video ${concept.internalName || conceptId}`,
    });
    if (deducted.error) {
      await admin.storage.from("content-assets").remove([path]);
      return {
        ok: false,
        error: deducted.error.message,
      };
    }

    return saveVideoConceptAction(conceptId, concept.updatedAt, {
      jobStatus: "ready",
      jobError: "",
      outputVideoPath: path,
      outputMimeType: "video/mp4",
      unitsCharged: units,
    });
  } catch (err) {
    return saveVideoConceptAction(conceptId, concept.updatedAt, {
      jobStatus: "failed",
      jobError: err instanceof Error ? err.message : "Poll mislukt",
    });
  }
}

export async function getKlingCreditsBalanceForVideoAction(): Promise<ActionResult<{ balance: number }>> {
  const supabase = await authed();
  const loaded = await supabase.schema("app").rpc("get_platform_kling_credits_public");
  if (loaded.error) return { ok: false, error: migration(loaded.error.message) };
  const row = (loaded.data ?? {}) as Record<string, unknown>;
  return { ok: true, data: { balance: Number(row.unitsBalance) || 0 } };
}
