"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdminMfa, requireSession } from "@/lib/auth/session";
import { extractVisualStylesFromImages } from "@/lib/brand/brand-visual-ai";
import {
  BRAND_MIGRATION,
  emptyTypography,
  emptyVisual,
  emptyVisualStyle,
  TYPE_ROLES,
  type BrandColor,
  type BrandPromptTemplate,
  type BrandVisual,
  type BrandVisualReference,
  type BrandVisualStyle,
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

export async function analyzeBrandVisualStylesAction(
  tenantId: string,
  expectedUpdatedAt: string,
  formData: FormData,
): Promise<ActionResult<ClientBrand>> {
  const files = formData.getAll("files").filter((item): item is File => item instanceof File);
  if (files.length === 0) return { ok: false, error: "Upload minstens één referentiebeeld." };
  if (files.length > 8) return { ok: false, error: "Upload maximaal 8 beelden per analyse." };

  const loaded = await loadClientBrandAction(tenantId);
  if (!loaded.ok || !loaded.data?.brand) return { ok: false, error: loaded.ok ? "Geen merkdefinitie." : loaded.error };
  const brand = loaded.data.brand;

  const images: { bytes: Uint8Array; mime: string; name: string; path: string }[] = [];
  const admin = createAdminClient();
  try {
    for (const file of files) {
      if (file.size <= 0 || file.size > 8 * 1024 * 1024) {
        return { ok: false, error: `Bestand te groot of leeg: ${file.name}` };
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const sniffed = sniffImage(bytes);
      if (!sniffed || sniffed.ext === "svg") {
        return { ok: false, error: `Gebruik PNG, JPEG of WebP (geen SVG): ${file.name}` };
      }
      const path = `${tenantId}/visual-refs/${crypto.randomUUID()}.${sniffed.ext}`;
      const uploaded = await admin.storage.from("brand-kit").upload(path, bytes, {
        contentType: sniffed.mime,
        upsert: false,
      });
      if (uploaded.error) {
        return {
          ok: false,
          error: /mime|brand-kit|bucket/i.test(uploaded.error.message) ? BRAND_MIGRATION : uploaded.error.message,
        };
      }
      images.push({ bytes, mime: sniffed.mime, name: file.name, path });
    }

    const extracted = await extractVisualStylesFromImages({
      brandName: brand.brandName || loaded.data.tenantName,
      images: images.map((image) => ({ bytes: image.bytes, mime: image.mime, name: image.name })),
    });

    const styles: BrandVisualStyle[] = extracted.styles.map((style, styleIndex) => {
      const indexes = extracted.assignment[styleIndex] ?? [];
      const refs: BrandVisualReference[] = (indexes.length > 0 ? indexes : images.map((_, i) => i))
        .filter((index) => index >= 0 && index < images.length)
        .map((index) => ({
          id: crypto.randomUUID(),
          path: images[index].path,
          name: images[index].name,
          url: null,
        }));
      // Deduplicate paths
      const unique = new Map(refs.map((ref) => [ref.path, ref]));
      return emptyVisualStyle({
        ...style,
        references: [...unique.values()],
      });
    });

    // Als er geen assignment was, hang alle refs aan de eerste stijl.
    if (styles.length === 1 && styles[0].references.length === 0) {
      styles[0].references = images.map((image) => ({
        id: crypto.randomUUID(),
        path: image.path,
        name: image.name,
        url: null,
      }));
    }

    const primary = styles[0];
    const nextVisual: BrandVisual = {
      ...brand.visual,
      styles: [...(brand.visual.styles ?? []).filter((style) => style.id !== "legacy-default"), ...styles],
      // Basisvelden volgen de primaire nieuwe stijl zodat bestaande blogflows blijven werken.
      tags: primary?.tags?.length ? primary.tags : brand.visual.tags,
      do: primary?.do || brand.visual.do,
      avoid: primary?.avoid || brand.visual.avoid,
      stylePrompt: primary?.stylePrompt || brand.visual.stylePrompt,
    };

    return saveClientBrandAction(tenantId, expectedUpdatedAt || brand.updatedAt, { visual: nextVisual });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Stijlanalyse mislukt" };
  }
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
  const visual = mapVisual(row.visual);
  if (visual.styles.length > 0) {
    try {
      const adminClient = createAdminClient();
      for (const style of visual.styles) {
        for (const ref of style.references) {
          const signed = await adminClient.storage.from("brand-kit").createSignedUrl(ref.path, 60 * 60);
          ref.url = signed.data?.signedUrl ?? null;
        }
      }
    } catch {
      // URLs blijven null
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
    visual,
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
  const styles = Array.isArray(raw.styles)
    ? raw.styles
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
        .map((item, index) =>
          emptyVisualStyle({
            id: String(item.id ?? `style-${index}`),
            name: String(item.name ?? `Stijl ${index + 1}`),
            active: item.active !== false,
            tags: Array.isArray(item.tags) ? item.tags.map(String).filter(Boolean) : [],
            do: String(item.do ?? ""),
            avoid: String(item.avoid ?? ""),
            stylePrompt: String(item.stylePrompt ?? ""),
            references: Array.isArray(item.references)
              ? item.references
                  .filter((ref): ref is Record<string, unknown> => Boolean(ref) && typeof ref === "object")
                  .map((ref, refIndex) => ({
                    id: String(ref.id ?? `ref-${index}-${refIndex}`),
                    path: String(ref.path ?? ""),
                    name: String(ref.name ?? ""),
                    url: null,
                  }))
                  .filter((ref) => Boolean(ref.path))
              : [],
          }),
        )
    : [];
  return {
    tags: Array.isArray(raw.tags) ? raw.tags.map(String).filter(Boolean) : [],
    do: String(raw.do ?? ""),
    avoid: String(raw.avoid ?? ""),
    stylePrompt: String(raw.stylePrompt ?? ""),
    styles,
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
