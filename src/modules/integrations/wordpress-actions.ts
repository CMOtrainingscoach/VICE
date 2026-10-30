"use server";

import { revalidatePath } from "next/cache";
import { toBloggerHtml } from "@/lib/integrations/blogger";
import {
  normalizeWordPressSiteUrl,
  parseWordPressPublic,
  parseWordPressSecrets,
  publishWordPressPost,
  uploadWordPressMedia,
  verifyWordPressConnection,
  type WordPressPublicStatus,
} from "@/lib/integrations/wordpress";
import { hydrateInlineVisualUrls, normalizeBlogDocument } from "@/lib/content/blog-ai";
import {
  captureBlogContentLearningOnPublish,
  loadBlogConceptAction,
} from "@/modules/content/blog-actions";
import { requirePlatformAdminMfa, requireSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const MISSING = /get_tenant_integration|upsert_tenant_integration|disconnect_tenant_integration|wordpress|schema cache|does not exist|Could not find the function/i;

function migration(message: string) {
  return MISSING.test(message)
    ? "Pas migratie 20260330136413_wordpress_integration.sql toe in de Supabase SQL-editor."
    : message;
}

async function authed() {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);
  return createClient();
}

export async function getWordPressStatusAction(tenantId: string): Promise<ActionResult<WordPressPublicStatus>> {
  const supabase = await authed();
  const result = await supabase.schema("app").rpc("get_tenant_integration_public", {
    p_tenant_id: tenantId,
    p_provider: "wordpress",
  });
  if (result.error) return { ok: false, error: migration(result.error.message) };
  return { ok: true, data: parseWordPressPublic(result.data) };
}

export async function connectWordPressAction(
  tenantId: string,
  input: { siteUrl: string; username: string; applicationPassword: string },
): Promise<ActionResult<WordPressPublicStatus>> {
  try {
    const supabase = await authed();
    const siteUrl = normalizeWordPressSiteUrl(input.siteUrl);
    const username = input.username.trim();
    const applicationPassword = input.applicationPassword.replace(/\s+/g, "").trim();
    if (!siteUrl) return { ok: false, error: "Vul de WordPress-site-URL in." };
    if (!username) return { ok: false, error: "Vul de WordPress-gebruikersnaam in." };
    if (!applicationPassword) {
      return { ok: false, error: "Vul een application password in (Gebruikers → Profiel → Application Passwords)." };
    }

    const verified = await verifyWordPressConnection({ siteUrl, username, applicationPassword });

    const upsert = await supabase.schema("app").rpc("upsert_tenant_integration_tokens", {
      p_tenant_id: tenantId,
      p_provider: "wordpress",
      p_account_email: username,
      p_access_token: applicationPassword,
      p_refresh_token: "",
      p_token_expires_at: null,
      p_metadata: {
        siteUrl,
        siteName: verified.siteName,
        username,
      },
    });
    if (upsert.error) return { ok: false, error: migration(upsert.error.message) };

    revalidatePath(`/klanten/${tenantId}`);
    const status = await getWordPressStatusAction(tenantId);
    if (!status.ok) return status;
    return { ok: true, data: status.data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "WordPress koppelen mislukt" };
  }
}

export async function disconnectWordPressAction(tenantId: string): Promise<ActionResult> {
  const supabase = await authed();
  const result = await supabase.schema("app").rpc("disconnect_tenant_integration", {
    p_tenant_id: tenantId,
    p_provider: "wordpress",
  });
  if (result.error) return { ok: false, error: migration(result.error.message) };
  revalidatePath(`/klanten/${tenantId}`);
  return { ok: true };
}

export async function publishBlogConceptToWordPressAction(
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

  const secrets = await loadWordPressSecrets(tenantId);
  if (!secrets) {
    return {
      ok: false,
      error: "Koppel eerst WordPress bij Instellingen van deze klant (site-URL + application password).",
    };
  }

  const title = String(row.title ?? "").trim();
  const rawBody = String(row.bodyHtml ?? "");
  if (!title || !rawBody.trim()) {
    return { ok: false, error: "Het concept heeft nog geen titel of tekst om te publiceren." };
  }

  const visuals = Array.isArray(row.visuals) ? row.visuals : [];
  const visualRows = visuals
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .filter((item) => item.id && item.storagePath)
    .map((item) => ({
      id: String(item.id),
      storagePath: String(item.storagePath),
      mimeType: String(item.mimeType ?? "image/png"),
      altText: String(item.altText ?? ""),
    }));

  try {
    const admin = createAdminClient();
    const mediaUrls = new Map<string, string>();
    for (const visual of visualRows) {
      const downloaded = await admin.storage.from("content-assets").download(visual.storagePath);
      if (downloaded.error || !downloaded.data) {
        throw new Error(`Visual kon niet worden gelezen: ${visual.id}`);
      }
      const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
      const ext = visual.mimeType.includes("jpeg") || visual.mimeType.includes("jpg")
        ? "jpg"
        : visual.mimeType.includes("webp")
          ? "webp"
          : "png";
      const hosted = await uploadWordPressMedia({
        secrets,
        bytes,
        mimeType: visual.mimeType || "image/png",
        fileName: `vice-${visual.id}.${ext}`,
      });
      mediaUrls.set(visual.id, hosted);
    }

    const withUrls = visualRows.map((visual) => ({
      id: visual.id,
      url: mediaUrls.get(visual.id) ?? null,
      altText: visual.altText,
    }));

    const document = normalizeBlogDocument(title, rawBody);
    let body = hydrateInlineVisualUrls(document.bodyHtml, withUrls);

    const selectedId = row.selectedVisualId ? String(row.selectedVisualId) : null;
    if (
      selectedId &&
      !body.includes(`data-visual-id="${selectedId}"`) &&
      !body.includes(`data-visual-id='${selectedId}'`)
    ) {
      const selected = withUrls.find((item) => item.id === selectedId);
      if (selected?.url) {
        body = `<p><img src="${selected.url}" alt="${selected.altText.replace(/"/g, "&quot;")}" /></p>${body}`;
      }
    }

    const content = toBloggerHtml(body);
    const published = await publishWordPressPost({
      secrets,
      title: document.title,
      content,
      status: options?.asDraft ? "draft" : "publish",
    });

    if (!(options?.asDraft ?? false)) {
      const marked = await supabase.schema("app").rpc("mark_blog_concept_published", {
        p_concept_id: conceptId,
        p_url: published.url,
        p_post_id: published.postId,
      });
      if (marked.error) {
        return { ok: false, error: migration(marked.error.message) };
      }
    }

    const loadedConcept = await loadBlogConceptAction(conceptId);
    if (loadedConcept.ok && loadedConcept.data) {
      await captureBlogContentLearningOnPublish(supabase, loadedConcept.data);
    }

    revalidatePath(`/klanten/${tenantId}/content/blog`);
    return { ok: true, data: published };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Publiceren mislukt" };
  }
}

async function loadWordPressSecrets(tenantId: string) {
  const supabase = await authed();
  const secretsResult = await supabase.schema("app").rpc("get_tenant_integration_secrets", {
    p_tenant_id: tenantId,
    p_provider: "wordpress",
  });
  if (secretsResult.error) throw new Error(migration(secretsResult.error.message));
  const statusResult = await supabase.schema("app").rpc("get_tenant_integration_public", {
    p_tenant_id: tenantId,
    p_provider: "wordpress",
  });
  const siteUrl = statusResult.data
    ? parseWordPressPublic(statusResult.data).siteUrl
    : null;
  return parseWordPressSecrets(secretsResult.data, siteUrl);
}
