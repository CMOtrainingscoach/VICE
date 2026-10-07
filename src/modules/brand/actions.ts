"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdminMfa, requireSession } from "@/lib/auth/session";
import {
  BRAND_MIGRATION,
  emptyTypography,
  emptyVisual,
  TYPE_ROLES,
  type BrandColor,
  type BrandPromptTemplate,
  type BrandVisual,
  type ClientBrand,
  type ClientBrandView,
  type TypeRole,
  type TypeStyle,
} from "@/lib/brand/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const MISSING = /get_client_brand|start_client_brand|save_client_brand|set_client_brand_logo|approve_client_brand|reopen_client_brand|schema cache|does not exist|Could not find the function/i;

function migration(message: string): string {
  return MISSING.test(message) ? BRAND_MIGRATION : message;
}

async function authed() {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);
  return createClient();
}

export async function loadClientBrandAction(tenantId: string): Promise<ActionResult<ClientBrandView>> {
  const supabase = await authed();
  const result = await supabase.schema("app").rpc("get_client_brand", { p_tenant_id: tenantId });
  if (result.error) return { ok: false, error: migration(result.error.message) };
  const raw = result.data as { tenantName?: string; brand?: unknown } | null;
  const brand = await mapBrand(raw?.brand ?? null);
  return { ok: true, data: { tenantName: String(raw?.tenantName ?? ""), brand } };
}

export async function startClientBrandAction(tenantId: string): Promise<ActionResult<ClientBrand>> {
  const supabase = await authed();
  const started = await supabase.schema("app").rpc("start_client_brand", { p_tenant_id: tenantId });
  if (started.error || !started.data) return { ok: false, error: migration(started.error?.message ?? "Starten mislukt") };
  const brand = await mapBrand(started.data);
  if (!brand) return { ok: false, error: "Merkdefinitie starten mislukt" };
  revalidateBrand(tenantId);
  return { ok: true, data: brand };
}

export async function saveClientBrandAction(
  tenantId: string,
  expectedUpdatedAt: string,
  patch: Record<string, unknown>,
): Promise<ActionResult<ClientBrand>> {
  const supabase = await authed();
  const saved = await supabase.schema("app").rpc("save_client_brand", {
    p_tenant_id: tenantId,
    p_expected: expectedUpdatedAt,
    p_patch: patch,
  });
  if (saved.error || !saved.data) return { ok: false, error: migration(saved.error?.message ?? "Opslaan mislukt") };
  const brand = await mapBrand(saved.data);
  if (!brand) return { ok: false, error: "Opslaan mislukt" };
  revalidateBrand(tenantId);
  return { ok: true, data: brand };
}

export async function approveClientBrandAction(tenantId: string, expectedUpdatedAt: string): Promise<ActionResult<ClientBrand>> {
  const supabase = await authed();
  const approved = await supabase.schema("app").rpc("approve_client_brand", {
    p_tenant_id: tenantId,
    p_expected: expectedUpdatedAt,
  });
  if (approved.error || !approved.data) return { ok: false, error: migration(approved.error?.message ?? "Goedkeuren mislukt") };
  const brand = await mapBrand(approved.data);
  if (!brand) return { ok: false, error: "Goedkeuren mislukt" };
  revalidateBrand(tenantId);
  return { ok: true, data: brand };
}

export async function reopenClientBrandAction(tenantId: string): Promise<ActionResult<ClientBrand>> {
  const supabase = await authed();
  const reopened = await supabase.schema("app").rpc("reopen_client_brand", { p_tenant_id: tenantId });
  if (reopened.error || !reopened.data) return { ok: false, error: migration(reopened.error?.message ?? "Bewerken mislukt") };
  const brand = await mapBrand(reopened.data);
  if (!brand) return { ok: false, error: "Bewerken mislukt" };
  revalidateBrand(tenantId);
  return { ok: true, data: brand };
}

export async function uploadBrandLogoAction(tenantId: string, formData: FormData): Promise<ActionResult<ClientBrand>> {
  const expected = String(formData.get("expectedUpdatedAt") ?? "");
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Kies een logo." };
  if (file.size <= 0 || file.size > 8 * 1024 * 1024) return { ok: false, error: "Gebruik een bestand tot 8 MB." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffImage(bytes);
  if (!sniffed) return { ok: false, error: "Gebruik SVG, PNG, JPEG of WebP." };

  const path = `${tenantId}/logo/${crypto.randomUUID()}.${sniffed.ext}`;
  const admin = createAdminClient();
  const uploaded = await admin.storage.from("brand-kit").upload(path, bytes, { contentType: sniffed.mime, upsert: false });
  if (uploaded.error) {
    return {
      ok: false,
      error: /mime|brand-kit|bucket/i.test(uploaded.error.message) ? BRAND_MIGRATION : uploaded.error.message,
    };
  }

  const supabase = await authed();
  const saved = await supabase.schema("app").rpc("set_client_brand_logo", {
    p_tenant_id: tenantId,
    p_expected: expected || null,
    p_path: path,
    p_name: file.name,
  });
  if (saved.error || !saved.data) {
    await admin.storage.from("brand-kit").remove([path]);
    return { ok: false, error: migration(saved.error?.message ?? "Logo bewaren mislukt") };
  }
  const brand = await mapBrand(saved.data);
  if (!brand) return { ok: false, error: "Logo bewaren mislukt" };
  revalidateBrand(tenantId);
  return { ok: true, data: brand };
}

function revalidateBrand(tenantId: string) {
  revalidatePath(`/klanten/${tenantId}/strategie/brand`);
  revalidatePath(`/klanten/${tenantId}/strategie`);
}

async function mapBrand(raw: unknown): Promise<ClientBrand | null> {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (!row.id) return null;
  const logoPath = String(row.logoPath ?? "");
  let logoUrl: string | null = null;
  if (logoPath) {
    try {
      const admin = createAdminClient();
      const signed = await admin.storage.from("brand-kit").createSignedUrl(logoPath, 60 * 60);
      logoUrl = signed.data?.signedUrl ?? null;
    } catch {
      logoUrl = null;
    }
  }
  return {
    id: String(row.id),
    tenantId: String(row.tenantId ?? ""),
    status: row.status === "approved" ? "approved" : "draft",
    versionNumber: Number(row.versionNumber) || 1,
    brandName: String(row.brandName ?? ""),
    tagline: String(row.tagline ?? ""),
    positioning: String(row.positioning ?? ""),
    voice: String(row.voice ?? ""),
    typography: mapTypography(row.typography),
    colors: mapColors(row.colors),
    visual: mapVisual(row.visual),
    promptTemplates: mapTemplates(row.promptTemplates),
    logoPath,
    logoName: String(row.logoName ?? ""),
    logoUrl,
    sourceNote: String(row.sourceNote ?? ""),
    updatedAt: String(row.updatedAt ?? ""),
    approvedAt: row.approvedAt ? String(row.approvedAt) : null,
  };
}

function mapTypography(value: unknown): Record<TypeRole, TypeStyle> {
  const base = emptyTypography();
  if (!value || typeof value !== "object") return base;
  const raw = value as Record<string, unknown>;
  for (const role of TYPE_ROLES) {
    const item = raw[role];
    if (!item || typeof item !== "object") continue;
    const style = item as Record<string, unknown>;
    base[role] = {
      family: String(style.family ?? ""),
      weight: String(style.weight ?? "400"),
      size: String(style.size ?? ""),
      lineHeight: String(style.lineHeight ?? ""),
      mobileSize: String(style.mobileSize ?? ""),
      mobileLineHeight: String(style.mobileLineHeight ?? ""),
      sample: String(style.sample ?? ""),
    };
  }
  return base;
}

function mapColors(value: unknown): BrandColor[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item, index) => ({
      id: String(item.id ?? `color-${index}`),
      name: String(item.name ?? ""),
      hex: normalizeHex(String(item.hex ?? "")),
      role: String(item.role ?? "primary"),
    }));
}

function mapVisual(value: unknown): BrandVisual {
  const empty = emptyVisual();
  if (!value || typeof value !== "object") return empty;
  const raw = value as Record<string, unknown>;
  return {
    tags: Array.isArray(raw.tags) ? raw.tags.map(String).filter(Boolean) : [],
    do: String(raw.do ?? ""),
    avoid: String(raw.avoid ?? ""),
    stylePrompt: String(raw.stylePrompt ?? ""),
  };
}

function mapTemplates(value: unknown): BrandPromptTemplate[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item, index) => ({
      id: String(item.id ?? `template-${index}`),
      name: String(item.name ?? "Campagnevisual"),
      subject: String(item.subject ?? ""),
      use: String(item.use ?? ""),
      format: String(item.format ?? ""),
      camera: String(item.camera ?? ""),
      light: String(item.light ?? ""),
      body: String(item.body ?? ""),
    }));
}

function normalizeHex(value: string): string {
  const cleaned = value.trim().toUpperCase();
  if (/^#[0-9A-F]{6}$/.test(cleaned)) return cleaned;
  if (/^[0-9A-F]{6}$/.test(cleaned)) return `#${cleaned}`;
  return cleaned || "#000000";
}

function sniffImage(bytes: Uint8Array): { ext: string; mime: string } | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return { ext: "png", mime: "image/png" };
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return { ext: "jpg", mime: "image/jpeg" };
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return { ext: "webp", mime: "image/webp" };
  const head = new TextDecoder().decode(bytes.slice(0, 200)).trimStart().toLowerCase();
  if (head.startsWith("<svg") || head.startsWith("<?xml")) return { ext: "svg", mime: "image/svg+xml" };
  return null;
}
