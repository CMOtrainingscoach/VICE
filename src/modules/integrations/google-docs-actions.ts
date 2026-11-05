"use server";

import { revalidatePath } from "next/cache";
import {
  createDriveFolder,
  createGoogleDocument,
  deleteDriveItem,
  listDriveFolder,
  renameDriveItem,
  uploadDriveFile,
  type DriveBrowseItem,
} from "@/lib/integrations/google-drive-api";
import { parseGoogleDocsPublic, type GoogleDocsPublicStatus } from "@/lib/integrations/google-docs";
import { requirePlatformAdminMfa, requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  ensureTenantIntegrationAccessToken,
  integrationMigrationMessage,
} from "@/modules/integrations/tenant-integration-access";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function authed() {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);
  return createClient();
}

async function driveToken(supabase: Awaited<ReturnType<typeof authed>>, tenantId: string) {
  return ensureTenantIntegrationAccessToken(supabase, tenantId, "google_docs", "Google Drive");
}

function revalidateDocs(tenantId: string) {
  revalidatePath(`/klanten/${tenantId}`);
  revalidatePath(`/klanten/${tenantId}/documenten`);
}

export async function getGoogleDocsStatusAction(
  tenantId: string,
): Promise<ActionResult<GoogleDocsPublicStatus>> {
  const supabase = await authed();
  const result = await supabase.schema("app").rpc("get_tenant_integration_public", {
    p_tenant_id: tenantId,
    p_provider: "google_docs",
  });
  if (result.error) return { ok: false, error: integrationMigrationMessage(result.error.message) };
  return { ok: true, data: parseGoogleDocsPublic(result.data) };
}

export async function listDriveFolderAction(
  tenantId: string,
  folderId: string,
): Promise<ActionResult<DriveBrowseItem[]>> {
  try {
    const supabase = await authed();
    const accessToken = await driveToken(supabase, tenantId);
    const items = await listDriveFolder(accessToken, folderId || "root");
    return { ok: true, data: items };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Map laden mislukt" };
  }
}

export async function createDriveFolderAction(
  tenantId: string,
  parentId: string,
  name: string,
): Promise<ActionResult<DriveBrowseItem>> {
  if (!name.trim()) return { ok: false, error: "Geef een mapnaam." };
  try {
    const supabase = await authed();
    const accessToken = await driveToken(supabase, tenantId);
    const item = await createDriveFolder(accessToken, parentId || "root", name);
    return { ok: true, data: item };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Map aanmaken mislukt" };
  }
}

export async function createGoogleDocumentAction(
  tenantId: string,
  parentId: string,
  title: string,
): Promise<ActionResult<DriveBrowseItem>> {
  try {
    const supabase = await authed();
    const accessToken = await driveToken(supabase, tenantId);
    const item = await createGoogleDocument(accessToken, parentId || "root", title);
    return { ok: true, data: item };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Document aanmaken mislukt" };
  }
}

export async function renameDriveItemAction(
  tenantId: string,
  fileId: string,
  name: string,
): Promise<ActionResult<DriveBrowseItem>> {
  if (!name.trim()) return { ok: false, error: "Geef een naam." };
  try {
    const supabase = await authed();
    const accessToken = await driveToken(supabase, tenantId);
    const item = await renameDriveItem(accessToken, fileId, name);
    return { ok: true, data: item };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Hernoemen mislukt" };
  }
}

export async function deleteDriveItemAction(tenantId: string, fileId: string): Promise<ActionResult> {
  try {
    const supabase = await authed();
    const accessToken = await driveToken(supabase, tenantId);
    await deleteDriveItem(accessToken, fileId);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Verwijderen mislukt" };
  }
}

export async function uploadDriveFileAction(
  tenantId: string,
  parentId: string,
  formData: FormData,
): Promise<ActionResult<DriveBrowseItem>> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size <= 0) {
    return { ok: false, error: "Kies een bestand." };
  }
  if (file.size > 25 * 1024 * 1024) {
    return { ok: false, error: "Bestand mag maximaal 25 MB zijn." };
  }
  try {
    const supabase = await authed();
    const accessToken = await driveToken(supabase, tenantId);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const item = await uploadDriveFile(
      accessToken,
      parentId || "root",
      file.name,
      file.type || "application/octet-stream",
      bytes,
    );
    return { ok: true, data: item };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Upload mislukt" };
  }
}

export async function setGoogleDriveProjectFolderAction(
  tenantId: string,
  folder: { id: string; name: string; webViewLink: string | null },
): Promise<ActionResult<GoogleDocsPublicStatus>> {
  const supabase = await authed();
  const updated = await supabase.schema("app").rpc("update_tenant_integration_metadata", {
    p_tenant_id: tenantId,
    p_provider: "google_docs",
    p_metadata: {
      projectFolderId: folder.id,
      projectFolderName: folder.name,
      projectFolderUrl: folder.webViewLink ?? "",
    },
  });
  if (updated.error) return { ok: false, error: integrationMigrationMessage(updated.error.message) };
  revalidateDocs(tenantId);
  return { ok: true, data: parseGoogleDocsPublic(updated.data) };
}

export async function clearGoogleDriveProjectFolderAction(
  tenantId: string,
): Promise<ActionResult<GoogleDocsPublicStatus>> {
  const supabase = await authed();
  const updated = await supabase.schema("app").rpc("update_tenant_integration_metadata", {
    p_tenant_id: tenantId,
    p_provider: "google_docs",
    p_metadata: {
      projectFolderId: "",
      projectFolderName: "",
      projectFolderUrl: "",
    },
  });
  if (updated.error) return { ok: false, error: integrationMigrationMessage(updated.error.message) };
  revalidateDocs(tenantId);
  return { ok: true, data: parseGoogleDocsPublic(updated.data) };
}

export async function disconnectGoogleDocsAction(tenantId: string): Promise<ActionResult> {
  const supabase = await authed();
  const result = await supabase.schema("app").rpc("disconnect_tenant_integration", {
    p_tenant_id: tenantId,
    p_provider: "google_docs",
  });
  if (result.error) return { ok: false, error: integrationMigrationMessage(result.error.message) };
  revalidateDocs(tenantId);
  return { ok: true };
}
