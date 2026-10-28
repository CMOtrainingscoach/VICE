"use server";

import { revalidatePath } from "next/cache";
import { generateProviderImage } from "@/lib/ai/image-provider";
import {
  BEELD_MIGRATION,
  beeldPresetById,
  type BeeldComposition,
  type BeeldCompositionSummary,
  type BeeldDocument,
  type BeeldImageQuality,
  type BeeldLayer,
} from "@/lib/content/beeld-types";
import {
  loadBrandCharacterNanoBundleAction,
  type BrandCharacterNanoBundle,
} from "@/modules/brand/character-actions";
import { loadBlogBrandContextAction } from "@/modules/content/blog-actions";
import type { TypeRole } from "@/lib/brand/types";
import { requirePlatformAdminMfa, requireSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const MISSING =
  /list_beeld_compositions|create_beeld_composition|get_beeld_composition|save_beeld_composition|delete_beeld_composition|beeld_compositions|schema cache|does not exist/i;

function migrationError(message: string): string {
  return MISSING.test(message) ? BEELD_MIGRATION : message;
}

async function authed() {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);
  return createClient();
}

function parseLayer(raw: unknown): BeeldLayer | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const kind = String(row.kind ?? "");
  const base = {
    id: String(row.id ?? ""),
    name: String(row.name ?? "Laag"),
    visible: row.visible !== false,
    locked: row.locked === true,
    opacity: Math.min(1, Math.max(0, Number(row.opacity ?? 1))),
  };
  if (!base.id) return null;

  if (kind === "text") {
    return {
      ...base,
      kind: "text",
      text: String(row.text ?? ""),
      typeRole: (["h1", "h2", "h3", "body"].includes(String(row.typeRole))
        ? String(row.typeRole)
        : "h2") as TypeRole,
      color: String(row.color ?? "#ffffff"),
      align: (["left", "center", "right"].includes(String(row.align)) ? row.align : "center") as
        | "left"
        | "center"
        | "right",
      x: Number(row.x ?? 8),
      y: Number(row.y ?? 75),
      width: Number(row.width ?? 84),
      fontSizePx: Number(row.fontSizePx ?? 48),
    };
  }
  if (kind === "logo") {
    return {
      ...base,
      kind: "logo",
      x: Number(row.x ?? 72),
      y: Number(row.y ?? 4),
      width: Number(row.width ?? 24),
      height: Number(row.height ?? 12),
    };
  }
  if (kind === "image") {
    return {
      ...base,
      kind: "image",
      source: row.source === "upload" ? "upload" : "ai",
      storagePath: String(row.storagePath ?? ""),
      mimeType: String(row.mimeType ?? "image/jpeg"),
      url: row.url ? String(row.url) : null,
      prompt: String(row.prompt ?? ""),
      fit: row.fit === "contain" ? "contain" : "cover",
      x: Number(row.x ?? 0),
      y: Number(row.y ?? 0),
      width: Number(row.width ?? 100),
      height: Number(row.height ?? 100),
    };
  }
  return null;
}

function parseDocument(raw: unknown): BeeldDocument {
  const doc = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const layersRaw = Array.isArray(doc.layers) ? doc.layers : [];
  return {
    layers: layersRaw.map(parseLayer).filter((layer): layer is BeeldLayer => layer !== null),
  };
}

async function signLayerUrls(document: BeeldDocument): Promise<BeeldDocument> {
  const admin = createAdminClient();
  const paths = document.layers
    .filter((l): l is Extract<BeeldLayer, { kind: "image" }> => l.kind === "image")
    .map((l) => l.storagePath)
    .filter(Boolean);
  const urls = new Map<string, string>();
  await Promise.all(
    [...new Set(paths)].map(async (path) => {
      const signed = await admin.storage.from("content-assets").createSignedUrl(path, 60 * 60);
      if (signed.data?.signedUrl) urls.set(path, signed.data.signedUrl);
    }),
  );
  return {
    layers: document.layers.map((layer) => {
      if (layer.kind !== "image" || !layer.storagePath) return layer;
      return { ...layer, url: urls.get(layer.storagePath) ?? layer.url ?? null };
    }),
  };
}

async function mapComposition(raw: unknown): Promise<BeeldComposition | null> {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = String(row.id ?? "");
  if (!id) return null;
  const document = await signLayerUrls(parseDocument(row.document));
  return {
    id,
    tenantId: String(row.tenantId ?? row.tenant_id ?? ""),
    title: String(row.title ?? ""),
    presetId: String(row.presetId ?? row.preset_id ?? "instagram_feed"),
    imageQuality: (["1K", "2K", "4K"].includes(String(row.imageQuality ?? row.image_quality))
      ? String(row.imageQuality ?? row.image_quality)
      : "1K") as BeeldImageQuality,
    brandCharacterId: row.brandCharacterId || row.brand_character_id ? String(row.brandCharacterId ?? row.brand_character_id) : null,
    styleId: String(row.styleId ?? row.style_id ?? ""),
    document,
    updatedAt: String(row.updatedAt ?? row.updated_at ?? ""),
    createdAt: String(row.createdAt ?? row.created_at ?? ""),
  };
}

function revalidateBeeld(tenantId: string) {
  revalidatePath(`/klanten/${tenantId}/content/beeld`);
}

export async function listBeeldCompositionsAction(
  tenantId: string,
): Promise<ActionResult<BeeldCompositionSummary[]>> {
  const supabase = await authed();
  const { data, error } = await supabase.schema("app").rpc("list_beeld_compositions", {
    p_tenant_id: tenantId,
  });
  if (error) return { ok: false, error: migrationError(error.message) };
  const rows = Array.isArray(data) ? data : [];
  return {
    ok: true,
    data: rows
      .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === "object")
      .map((r) => ({
        id: String(r.id ?? ""),
        title: String(r.title ?? ""),
        presetId: String(r.presetId ?? r.preset_id ?? ""),
        updatedAt: String(r.updatedAt ?? r.updated_at ?? ""),
      }))
      .filter((r) => r.id),
  };
}

export async function createBeeldCompositionAction(tenantId: string): Promise<ActionResult<BeeldComposition>> {
  const supabase = await authed();
  const { data, error } = await supabase.schema("app").rpc("create_beeld_composition", {
    p_tenant_id: tenantId,
  });
  if (error) return { ok: false, error: migrationError(error.message) };
  const mapped = await mapComposition(data);
  if (!mapped) return { ok: false, error: "Aanmaken mislukt" };
  revalidateBeeld(tenantId);
  return { ok: true, data: mapped };
}

export async function loadBeeldCompositionAction(
  compositionId: string,
): Promise<ActionResult<BeeldComposition>> {
  const supabase = await authed();
  const { data, error } = await supabase.schema("app").rpc("get_beeld_composition", {
    p_composition_id: compositionId,
  });
  if (error) return { ok: false, error: migrationError(error.message) };
  const mapped = await mapComposition(data);
  if (!mapped) return { ok: false, error: "Compositie niet gevonden" };
  return { ok: true, data: mapped };
}

export async function saveBeeldCompositionAction(
  compositionId: string,
  expectedUpdatedAt: string,
  patch: Record<string, unknown>,
): Promise<ActionResult<BeeldComposition>> {
  const supabase = await authed();
  const { data, error } = await supabase.schema("app").rpc("save_beeld_composition", {
    p_composition_id: compositionId,
    p_expected: expectedUpdatedAt,
    p_patch: patch,
  });
  if (error) return { ok: false, error: migrationError(error.message) };
  const mapped = await mapComposition(data);
  if (!mapped) return { ok: false, error: "Opslaan mislukt" };
  revalidateBeeld(mapped.tenantId);
  return { ok: true, data: mapped };
}

export async function deleteBeeldCompositionAction(compositionId: string): Promise<ActionResult> {
  const supabase = await authed();
  const { data, error } = await supabase.schema("app").rpc("delete_beeld_composition", {
    p_composition_id: compositionId,
  });
  if (error) return { ok: false, error: migrationError(error.message) };
  const tenantId = String((data as { tenantId?: string })?.tenantId ?? "");
  if (tenantId) revalidateBeeld(tenantId);
  return { ok: true };
}

async function characterBundleFor(
  tenantId: string,
  characterId: string | null,
): Promise<BrandCharacterNanoBundle | null> {
  if (!characterId) return null;
  const bundle = await loadBrandCharacterNanoBundleAction(tenantId, characterId);
  if (!bundle.ok || !bundle.data) {
    throw new Error(bundle.ok ? "Personage kon niet worden geladen." : bundle.error);
  }
  return bundle.data;
}

export async function generateBeeldLayerImageAction(input: {
  compositionId: string;
  layerId: string;
  prompt: string;
  expectedUpdatedAt: string;
}): Promise<ActionResult<BeeldComposition>> {
  const loaded = await loadBeeldCompositionAction(input.compositionId);
  if (!loaded.ok || !loaded.data) return loaded;
  const composition = loaded.data;

  const brand = await loadBlogBrandContextAction(composition.tenantId);
  if (!brand.ok || !brand.data?.hasVisual) {
    return { ok: false, error: "Beeldstijl ontbreekt. Vul Brand → Beeldstijl aan." };
  }
  const style =
    brand.data.styles.find((s) => s.id === composition.styleId) ?? brand.data.styles[0];
  if (!style) return { ok: false, error: "Geen actieve beeldstijl." };

  const layerIndex = composition.document.layers.findIndex((l) => l.id === input.layerId);
  if (layerIndex < 0) return { ok: false, error: "Laag niet gevonden." };
  const layer = composition.document.layers[layerIndex];
  if (layer.kind !== "image") return { ok: false, error: "Alleen beeld-lagen kunnen gegenereerd worden." };

  const preset = beeldPresetById(composition.presetId);
  let characterBundle: BrandCharacterNanoBundle | null = null;
  try {
    characterBundle = await characterBundleFor(composition.tenantId, composition.brandCharacterId);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Personage laden mislukt." };
  }

  const colorLine = brand.data.colors
    .slice(0, 4)
    .map((c) => `${c.name || c.role} ${c.hex}`)
    .join(", ");

  const prompt = [
    "LOCKED BRAND VISUAL STYLE:",
    style.stylePrompt,
    characterBundle?.lockPrompt ?? "",
    input.prompt.trim() || "Brand visual scene matching the style.",
    style.name ? `Style: ${style.name}` : "",
    style.do ? `Do: ${style.do}` : "",
    style.avoid ? `Avoid: ${style.avoid}` : "",
    colorLine ? `Brand colors (atmosphere): ${colorLine}` : "",
    "Photorealistic, no readable text, no watermarks, no UI mockups.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const image = await generateProviderImage({
      prompt,
      aspectRatio: preset.aspectRatio,
      imageSize: composition.imageQuality,
      characterReferences: characterBundle?.references,
      characterName: characterBundle?.name,
    });

    const ext = image.mime.includes("jpeg") ? "jpg" : image.mime.includes("webp") ? "webp" : "png";
    const path = `${composition.tenantId}/beeld/${composition.id}/${input.layerId}.${ext}`;
    const admin = createAdminClient();
    const uploaded = await admin.storage.from("content-assets").upload(path, image.bytes, {
      contentType: image.mime,
      upsert: true,
    });
    if (uploaded.error) throw new Error(uploaded.error.message);

    const nextLayers = [...composition.document.layers];
    nextLayers[layerIndex] = {
      ...layer,
      source: "ai",
      storagePath: path,
      mimeType: image.mime,
      prompt: input.prompt.trim(),
    };

    return saveBeeldCompositionAction(composition.id, input.expectedUpdatedAt, {
      document: { layers: nextLayers },
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Genereren mislukt",
    };
  }
}

export async function uploadBeeldLayerImageAction(
  compositionId: string,
  layerId: string,
  expectedUpdatedAt: string,
  formData: FormData,
): Promise<ActionResult<BeeldComposition>> {
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Kies een afbeelding." };
  if (file.size <= 0 || file.size > 12 * 1024 * 1024) {
    return { ok: false, error: "Gebruik een afbeelding tot 12 MB." };
  }

  const loaded = await loadBeeldCompositionAction(compositionId);
  if (!loaded.ok || !loaded.data) return loaded;
  const composition = loaded.data;
  const layerIndex = composition.document.layers.findIndex((l) => l.id === layerId);
  if (layerIndex < 0) return { ok: false, error: "Laag niet gevonden." };
  const layer = composition.document.layers[layerIndex];
  if (layer.kind !== "image") return { ok: false, error: "Alleen beeld-lagen." };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = file.type || "image/png";
  const ext = mime.includes("jpeg") ? "jpg" : mime.includes("webp") ? "webp" : "png";
  const path = `${composition.tenantId}/beeld/${composition.id}/${layerId}-upload.${ext}`;
  const admin = createAdminClient();
  const uploaded = await admin.storage.from("content-assets").upload(path, bytes, {
    contentType: mime,
    upsert: true,
  });
  if (uploaded.error) return { ok: false, error: uploaded.error.message };

  const nextLayers = [...composition.document.layers];
  nextLayers[layerIndex] = {
    ...layer,
    source: "upload",
    storagePath: path,
    mimeType: mime,
  };

  return saveBeeldCompositionAction(composition.id, expectedUpdatedAt, {
    document: { layers: nextLayers },
  });
}
