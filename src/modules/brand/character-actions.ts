"use server";

import { revalidatePath } from "next/cache";
import {
  BRAND_CHARACTER_MIGRATION,
  type BrandCharacter,
  type BrandCharacterAssetSlot,
} from "@/lib/brand/character-types";
import { sniffImage } from "@/lib/brand/image-sniff";
import { requirePlatformAdminMfa, requireSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const MISSING =
  /list_brand_characters|upsert_brand_character|set_brand_character_asset|delete_brand_character|brand-characters|schema cache|does not exist/i;

function migrationError(message: string): string {
  return MISSING.test(message) ? BRAND_CHARACTER_MIGRATION : message;
}

async function client() {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);
  return createClient();
}

function mapCharacter(raw: unknown, urls: Map<string, string>): BrandCharacter | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = String(row.id ?? "");
  if (!id) return null;
  const assetsRaw = row.assets && typeof row.assets === "object" ? (row.assets as Record<string, unknown>) : {};
  const slot = (key: BrandCharacterAssetSlot) => String(assetsRaw[key] ?? "");
  const assets = {
    face: slot("face"),
    front: slot("front"),
    side: slot("side"),
    back: slot("back"),
    contingency: slot("contingency"),
  };
  const assetUrls: Partial<Record<BrandCharacterAssetSlot, string>> = {};
  for (const key of Object.keys(assets) as BrandCharacterAssetSlot[]) {
    const path = assets[key];
    if (path && urls.has(path)) assetUrls[key] = urls.get(path);
  }
  return {
    id,
    tenantId: String(row.tenantId ?? row.tenant_id ?? ""),
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
    visualPrompt: String(row.visualPrompt ?? row.visual_prompt ?? ""),
    assets,
    assetUrls,
    sortOrder: Number(row.sortOrder ?? row.sort_order ?? 0),
    updatedAt: String(row.updatedAt ?? row.updated_at ?? ""),
    createdAt: String(row.createdAt ?? row.created_at ?? ""),
  };
}

async function signedUrls(paths: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return map;
  const admin = createAdminClient();
  await Promise.all(
    unique.map(async (path) => {
      const signed = await admin.storage.from("brand-characters").createSignedUrl(path, 60 * 60);
      if (signed.data?.signedUrl) map.set(path, signed.data.signedUrl);
    }),
  );
  return map;
}

function collectPaths(characters: BrandCharacter[]): string[] {
  return characters.flatMap((c) => Object.values(c.assets)).filter(Boolean);
}

async function mapList(raw: unknown): Promise<BrandCharacter[]> {
  const rows = Array.isArray(raw) ? raw : [];
  const draft = rows.map((row) => mapCharacter(row, new Map())).filter((c): c is BrandCharacter => c !== null);
  const urls = await signedUrls(collectPaths(draft));
  return rows.map((row) => mapCharacter(row, urls)).filter((c): c is BrandCharacter => c !== null);
}

function revalidateBrand(tenantId: string) {
  revalidatePath(`/klanten/${tenantId}/strategie/brand`);
}

export async function listBrandCharactersAction(tenantId: string): Promise<ActionResult<BrandCharacter[]>> {
  const supabase = await client();
  const { data, error } = await supabase.schema("app").rpc("list_brand_characters", { p_tenant_id: tenantId });
  if (error) return { ok: false, error: migrationError(error.message) };
  return { ok: true, data: await mapList(data) };
}

export async function saveBrandCharacterAction(
  tenantId: string,
  characterId: string | null,
  payload: { name: string; description: string; visualPrompt: string },
): Promise<ActionResult<BrandCharacter>> {
  const supabase = await client();
  const { data, error } = await supabase.schema("app").rpc("upsert_brand_character", {
    p_tenant_id: tenantId,
    p_character_id: characterId,
    p_payload: payload,
  });
  if (error) return { ok: false, error: migrationError(error.message) };
  const mapped = await mapList([data]);
  const character = mapped[0];
  if (!character) return { ok: false, error: "Opslaan mislukt" };
  revalidateBrand(tenantId);
  return { ok: true, data: character };
}

export async function uploadBrandCharacterAssetAction(
  tenantId: string,
  characterId: string,
  slot: BrandCharacterAssetSlot,
  formData: FormData,
): Promise<ActionResult<BrandCharacter>> {
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Kies een afbeelding." };
  if (file.size <= 0 || file.size > 12 * 1024 * 1024) {
    return { ok: false, error: "Gebruik een afbeelding tot 12 MB." };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffImage(bytes);
  if (!sniffed) return { ok: false, error: "Gebruik PNG, JPEG of WebP." };

  const supabase = await client();
  const list = await listBrandCharactersAction(tenantId);
  if (!list.ok) return list;
  const existing = list.data?.find((c) => c.id === characterId);
  if (!existing) return { ok: false, error: "Personage niet gevonden" };

  const path = `${tenantId}/${characterId}/${slot}.${sniffed.ext}`;
  const admin = createAdminClient();
  const oldPath = existing.assets[slot];
  const uploaded = await admin.storage.from("brand-characters").upload(path, bytes, {
    contentType: sniffed.mime,
    upsert: true,
  });
  if (uploaded.error) {
    return { ok: false, error: migrationError(uploaded.error.message) };
  }

  const { data, error } = await supabase.schema("app").rpc("set_brand_character_asset", {
    p_character_id: characterId,
    p_slot: slot,
    p_path: path,
  });
  if (error) {
    await admin.storage.from("brand-characters").remove([path]);
    return { ok: false, error: migrationError(error.message) };
  }

  if (oldPath && oldPath !== path) {
    await admin.storage.from("brand-characters").remove([oldPath]);
  }

  const mapped = await mapList([data]);
  const character = mapped[0];
  if (!character) return { ok: false, error: "Upload mislukt" };
  revalidateBrand(tenantId);
  return { ok: true, data: character };
}

export async function clearBrandCharacterAssetAction(
  tenantId: string,
  characterId: string,
  slot: BrandCharacterAssetSlot,
): Promise<ActionResult<BrandCharacter>> {
  const supabase = await client();
  const list = await listBrandCharactersAction(tenantId);
  if (!list.ok) return list;
  const existing = list.data?.find((c) => c.id === characterId);
  if (!existing) return { ok: false, error: "Personage niet gevonden" };
  const oldPath = existing.assets[slot];

  const { data, error } = await supabase.schema("app").rpc("set_brand_character_asset", {
    p_character_id: characterId,
    p_slot: slot,
    p_path: "",
  });
  if (error) return { ok: false, error: migrationError(error.message) };

  if (oldPath) {
    const admin = createAdminClient();
    await admin.storage.from("brand-characters").remove([oldPath]);
  }

  const mapped = await mapList([data]);
  const character = mapped[0];
  if (!character) return { ok: false, error: "Verwijderen mislukt" };
  revalidateBrand(tenantId);
  return { ok: true, data: character };
}

export async function deleteBrandCharacterAction(tenantId: string, characterId: string): Promise<ActionResult> {
  const supabase = await client();
  const { data, error } = await supabase.schema("app").rpc("delete_brand_character", {
    p_character_id: characterId,
  });
  if (error) return { ok: false, error: migrationError(error.message) };

  const pathsRaw = (data as { storagePaths?: unknown })?.storagePaths;
  const paths = Array.isArray(pathsRaw) ? pathsRaw.map(String).filter(Boolean) : [];
  if (paths.length > 0) {
    const admin = createAdminClient();
    await admin.storage.from("brand-characters").remove(paths);
  }

  revalidateBrand(tenantId);
  return { ok: true };
}
