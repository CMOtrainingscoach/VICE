export type DriveItemKind = "folder" | "document" | "spreadsheet" | "file" | "image" | "other";

export type DriveBrowseItem = {
  id: string;
  name: string;
  kind: DriveItemKind;
  mimeType: string;
  webViewLink: string | null;
  iconLink: string | null;
  modifiedTime: string | null;
};

const FOLDER_MIME = "application/vnd.google-apps.folder";
const DOC_MIME = "application/vnd.google-apps.document";
const SHEET_MIME = "application/vnd.google-apps.spreadsheet";

function kindFromMime(mimeType: string): DriveItemKind {
  if (mimeType === FOLDER_MIME) return "folder";
  if (mimeType === DOC_MIME) return "document";
  if (mimeType === SHEET_MIME) return "spreadsheet";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("application/vnd.google-apps.")) return "other";
  return "file";
}

function mapDriveFile(row: {
  id?: string;
  name?: string;
  mimeType?: string;
  webViewLink?: string;
  iconLink?: string;
  modifiedTime?: string;
}): DriveBrowseItem | null {
  if (!row.id || !row.name || !row.mimeType) return null;
  return {
    id: row.id,
    name: row.name,
    mimeType: row.mimeType,
    kind: kindFromMime(row.mimeType),
    webViewLink: row.webViewLink ?? null,
    iconLink: row.iconLink ?? null,
    modifiedTime: row.modifiedTime ?? null,
  };
}

async function driveJson<T>(accessToken: string, url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });
  const json = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) {
    throw new Error(json.error?.message || "Google Drive-verzoek mislukt");
  }
  return json;
}

export async function listDriveFolder(
  accessToken: string,
  folderId: string,
): Promise<DriveBrowseItem[]> {
  const parent = folderId === "root" ? "root" : folderId;
  const q = encodeURIComponent(`'${parent}' in parents and trashed=false`);
  const fields = encodeURIComponent("files(id,name,mimeType,webViewLink,iconLink,modifiedTime)");
  const json = await driveJson<{ files?: unknown[] }>(
    accessToken,
    `https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=200&orderBy=folder,name&fields=${fields}`,
  );
  const files = (json.files ?? []) as Parameters<typeof mapDriveFile>[0][];
  return files
    .map(mapDriveFile)
    .filter((item): item is DriveBrowseItem => item !== null)
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : b.kind === "folder" ? 1 : 0;
      return a.name.localeCompare(b.name, "nl");
    });
}

export async function getDriveItem(accessToken: string, fileId: string): Promise<DriveBrowseItem> {
  const fields = encodeURIComponent("id,name,mimeType,webViewLink,iconLink,modifiedTime");
  const json = await driveJson<Parameters<typeof mapDriveFile>[0]>(
    accessToken,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=${fields}`,
  );
  const mapped = mapDriveFile(json);
  if (!mapped) throw new Error("Bestand niet gevonden");
  return mapped;
}

export async function createDriveFolder(
  accessToken: string,
  parentId: string,
  name: string,
): Promise<DriveBrowseItem> {
  const parent = parentId === "root" ? "root" : parentId;
  const json = await driveJson<{ id?: string }>(accessToken, "https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: name.trim(),
      mimeType: FOLDER_MIME,
      parents: [parent],
    }),
  });
  if (!json.id) throw new Error("Map aanmaken mislukt");
  return getDriveItem(accessToken, json.id);
}

export async function createGoogleDocument(
  accessToken: string,
  parentId: string,
  title: string,
): Promise<DriveBrowseItem> {
  const parent = parentId === "root" ? "root" : parentId;
  const json = await driveJson<{ id?: string }>(accessToken, "https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: title.trim() || "Naamloos document",
      mimeType: DOC_MIME,
      parents: [parent],
    }),
  });
  if (!json.id) throw new Error("Document aanmaken mislukt");
  return getDriveItem(accessToken, json.id);
}

export async function renameDriveItem(
  accessToken: string,
  fileId: string,
  name: string,
): Promise<DriveBrowseItem> {
  await driveJson(
    accessToken,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    },
  );
  return getDriveItem(accessToken, fileId);
}

export async function deleteDriveItem(accessToken: string, fileId: string): Promise<void> {
  await driveJson(
    accessToken,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
    { method: "DELETE" },
  );
}

export async function uploadDriveFile(
  accessToken: string,
  parentId: string,
  fileName: string,
  mimeType: string,
  bytes: Uint8Array,
): Promise<DriveBrowseItem> {
  const parent = parentId === "root" ? "root" : parentId;
  const metadata = JSON.stringify({ name: fileName, parents: [parent] });
  const boundary = "vice_drive_upload_boundary";
  const bodyParts = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
  ];
  const tail = `\r\n--${boundary}--`;
  const encoder = new TextEncoder();
  const head = encoder.encode(bodyParts[0] + bodyParts[1]);
  const foot = encoder.encode(tail);
  const payload = new Uint8Array(head.length + bytes.length + foot.length);
  payload.set(head, 0);
  payload.set(bytes, head.length);
  payload.set(foot, head.length + bytes.length);

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: payload,
    },
  );
  const json = (await res.json()) as { id?: string; error?: { message?: string } };
  if (!res.ok || !json.id) {
    throw new Error(json.error?.message || "Upload mislukt");
  }
  return getDriveItem(accessToken, json.id);
}
