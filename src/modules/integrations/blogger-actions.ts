"use server";

import { revalidatePath } from "next/cache";
import {
  listBloggerBlogs,
  parseBloggerPublic,
  parseBloggerSecrets,
  publishBloggerPost,
  refreshBloggerAccessToken,
  toBloggerHtml,
  type BloggerBlog,
  type BloggerPublicStatus,
} from "@/lib/integrations/blogger";
import { hydrateInlineVisualUrls, normalizeBlogDocument } from "@/lib/content/blog-ai";
import { requirePlatformAdminMfa, requireSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const MISSING = /get_tenant_integration|upsert_tenant_integration|disconnect_tenant_integration|schema cache|does not exist|Could not find the function/i;

function migration(message: string) {
  return MISSING.test(message)
    ? "Pas migratie 20260330135100_tenant_integrations.sql toe in de Supabase SQL-editor."
    : message;
}

async function authed() {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);
  return createClient();
}

export async function getBloggerStatusAction(tenantId: string): Promise<ActionResult<BloggerPublicStatus>> {
  const supabase = await authed();
  const result = await supabase.schema("app").rpc("get_tenant_integration_public", {
    p_tenant_id: tenantId,
    p_provider: "blogger",
  });
  if (result.error) return { ok: false, error: migration(result.error.message) };
  return { ok: true, data: parseBloggerPublic(result.data) };
}

export async function listTenantBloggerBlogsAction(tenantId: string): Promise<ActionResult<BloggerBlog[]>> {
  try {
    const accessToken = await ensureBloggerAccessToken(tenantId);
    const blogs = await listBloggerBlogs(accessToken);
    return { ok: true, data: blogs };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Blogs ophalen mislukt" };
  }
}

export async function selectBloggerBlogAction(
  tenantId: string,
  blog: BloggerBlog,
): Promise<ActionResult<BloggerPublicStatus>> {
  const supabase = await authed();
  const updated = await supabase.schema("app").rpc("update_tenant_integration_metadata", {
    p_tenant_id: tenantId,
    p_provider: "blogger",
    p_metadata: {
      blogId: blog.id,
      blogName: blog.name,
      blogUrl: blog.url,
    },
  });
  if (updated.error) return { ok: false, error: migration(updated.error.message) };
  revalidatePath(`/klanten/${tenantId}`);
  return { ok: true, data: parseBloggerPublic(updated.data) };
}

export async function disconnectBloggerAction(tenantId: string): Promise<ActionResult> {
  const supabase = await authed();
  const result = await supabase.schema("app").rpc("disconnect_tenant_integration", {
    p_tenant_id: tenantId,
    p_provider: "blogger",
  });
  if (result.error) return { ok: false, error: migration(result.error.message) };
  revalidatePath(`/klanten/${tenantId}`);
  return { ok: true };
}

export async function publishBlogConceptToBloggerAction(
  conceptId: string,
  options?: { asDraft?: boolean },
): Promise<ActionResult<{ url: string; postId: string }>> {
  const supabase = await authed();
  const loaded = await supabase.schema("app").rpc("get_blog_concept", { p_concept_id: conceptId });
  if (loaded.error || !loaded.data) {
    return { ok: false, error: loaded.error?.message ?? "Concept niet gevonden" };
  }

  const row = loaded.data as Record<string, unknown>;
  const tenantId = String(row.tenantId ?? "");
  if (!tenantId) return { ok: false, error: "Concept mist klant" };

  const statusResult = await supabase.schema("app").rpc("get_tenant_integration_public", {
    p_tenant_id: tenantId,
    p_provider: "blogger",
  });
  if (statusResult.error) return { ok: false, error: migration(statusResult.error.message) };
  const status = parseBloggerPublic(statusResult.data);
  if (!status.connected || !status.blogId) {
    return {
      ok: false,
      error: "Koppel eerst Google Blogger en kies een blog bij Instellingen van deze klant.",
    };
  }

  const title = String(row.title ?? "").trim();
  const rawBody = String(row.bodyHtml ?? "");
  if (!title || !rawBody.trim()) {
    return { ok: false, error: "Het concept heeft nog geen titel of tekst om te publiceren." };
  }

  const visuals = Array.isArray(row.visuals) ? row.visuals : [];
  const mappedVisuals = await Promise.all(
    visuals.map(async (item) => {
      if (!item || typeof item !== "object") return null;
      const visual = item as Record<string, unknown>;
      if (!visual.id || !visual.storagePath) return null;
      let url: string | null = null;
      try {
        const admin = createAdminClient();
        const signed = await admin.storage
          .from("content-assets")
          .createSignedUrl(String(visual.storagePath), 60 * 60 * 24 * 7);
        url = signed.data?.signedUrl ?? null;
      } catch {
        url = null;
      }
      return {
        id: String(visual.id),
        url,
        altText: String(visual.altText ?? ""),
      };
    }),
  );
  const withUrls = mappedVisuals.filter((item): item is { id: string; url: string | null; altText: string } => Boolean(item));
  const document = normalizeBlogDocument(title, rawBody);
  let body = hydrateInlineVisualUrls(document.bodyHtml, withUrls);

  const selectedId = row.selectedVisualId ? String(row.selectedVisualId) : null;
  if (selectedId && !body.includes(`data-visual-id="${selectedId}"`) && !body.includes(`data-visual-id='${selectedId}'`)) {
    const selected = withUrls.find((item) => item.id === selectedId);
    if (selected?.url) {
      body = `<p><img src="${selected.url}" alt="${selected.altText.replace(/"/g, "&quot;")}" /></p>${body}`;
    }
  }

  try {
    const accessToken = await ensureBloggerAccessToken(tenantId);
    const published = await publishBloggerPost({
      accessToken,
      blogId: status.blogId,
      title: document.title,
      content: toBloggerHtml(body),
      isDraft: options?.asDraft ?? false,
    });
    return { ok: true, data: published };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Publiceren mislukt" };
  }
}

async function ensureBloggerAccessToken(tenantId: string): Promise<string> {
  const supabase = await authed();
  const secretsResult = await supabase.schema("app").rpc("get_tenant_integration_secrets", {
    p_tenant_id: tenantId,
    p_provider: "blogger",
  });
  if (secretsResult.error) throw new Error(migration(secretsResult.error.message));
  const secrets = parseBloggerSecrets(secretsResult.data);
  if (!secrets?.refreshToken && !secrets?.accessToken) {
    throw new Error("Geen Blogger-koppeling gevonden");
  }

  const expiresAt = secrets.tokenExpiresAt ? new Date(secrets.tokenExpiresAt).getTime() : 0;
  const stillValid = secrets.accessToken && expiresAt > Date.now() + 60_000;
  if (stillValid) return secrets.accessToken;

  if (!secrets.refreshToken) {
    throw new Error("Blogger-sessie verlopen. Koppel Google Blogger opnieuw.");
  }

  const refreshed = await refreshBloggerAccessToken(secrets.refreshToken);
  const expires = new Date(Date.now() + refreshed.expiresIn * 1000).toISOString();
  const upsert = await supabase.schema("app").rpc("upsert_tenant_integration_tokens", {
    p_tenant_id: tenantId,
    p_provider: "blogger",
    p_account_email: secrets.accountEmail,
    p_access_token: refreshed.accessToken,
    p_refresh_token: secrets.refreshToken,
    p_token_expires_at: expires,
    p_metadata: {},
  });
  if (upsert.error) throw new Error(migration(upsert.error.message));
  return refreshed.accessToken;
}
