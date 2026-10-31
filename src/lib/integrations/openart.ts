import type { VideoAspectPreset, VideoDurationSeconds, VideoResolution } from "@/lib/content/video-types";
import { estimateKlingUnits } from "@/lib/integrations/kling";
import {
  OPENART_API_BASE,
  refreshOpenArtAccessToken,
} from "@/lib/integrations/openart-oauth";
import { PLATFORM_OPENART_PROVIDER } from "@/lib/integrations/platform-openart";
import { createAdminClient } from "@/lib/supabase/admin";

const OPENART_HEADERS = {
  Accept: "application/json",
  "Content-Type": "application/json",
};

/** OpenArt’s suite API validates some routes like the in-browser client. */
const OPENART_CLIENT_HEADERS = {
  Origin: "https://openart.ai",
  Referer: "https://openart.ai/suite/create-video",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

const OPENART_I2V_CAPABILITY = "kling2-6:image2video";

function unwrapOpenArtRecord(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  const row = raw as Record<string, unknown>;
  const nested = row.data;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return { ...(nested as Record<string, unknown>), ...row };
  }
  return row;
}

function pickString(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

/** Best-effort raster dimensions for OpenArt reference metadata (no extra deps). */
export function readRasterImageDimensions(
  bytes: Uint8Array,
  contentType: string,
): { width: number; height: number } | null {
  const mime = contentType.toLowerCase();
  if (mime.includes("png") && bytes.length >= 24) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(16, false);
    const height = view.getUint32(20, false);
    if (width > 0 && height > 0) return { width, height };
  }
  if ((mime.includes("jpeg") || mime.includes("jpg")) && bytes.length > 4) {
    let i = 2;
    while (i + 8 < bytes.length) {
      if (bytes[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = bytes[i + 1];
      if (marker === 0xc0 || marker === 0xc2) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const height = view.getUint16(i + 5, false);
        const width = view.getUint16(i + 7, false);
        if (width > 0 && height > 0) return { width, height };
        return null;
      }
      const len = (bytes[i + 2] << 8) + bytes[i + 3];
      if (len < 2) break;
      i += 2 + len;
    }
  }
  if (mime.includes("webp") && bytes.length >= 30) {
    const riff = String.fromCharCode(...bytes.slice(0, 4));
    const webp = String.fromCharCode(...bytes.slice(8, 12));
    if (riff === "RIFF" && webp === "WEBP") {
      const chunk = String.fromCharCode(...bytes.slice(12, 16));
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      if (chunk === "VP8 " && bytes.length >= 30) {
        const width = view.getUint16(26, true) & 0x3fff;
        const height = view.getUint16(28, true) & 0x3fff;
        if (width > 0 && height > 0) return { width, height };
      }
      if (chunk === "VP8L" && bytes.length >= 25) {
        const bits = view.getUint32(21, true);
        const width = (bits & 0x3fff) + 1;
        const height = ((bits >> 14) & 0x3fff) + 1;
        if (width > 0 && height > 0) return { width, height };
      }
    }
  }
  return null;
}

function mimeToFormat(contentType: string, filename: string): string {
  const mime = contentType.toLowerCase();
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "png" || ext === "webp" || ext === "jpg" || ext === "jpeg") {
    return ext === "jpeg" ? "jpg" : ext;
  }
  return "jpg";
}

function extractSignedUploadUrls(raw: unknown): { uploadUrl: string; assetUrl: string } {
  const roots: unknown[] = [raw];
  if (raw && typeof raw === "object") {
    roots.push(unwrapOpenArtRecord(raw));
  }

  const seen = new Set<unknown>();
  function walk(node: unknown, depth: number): { uploadUrl: string; assetUrl: string } | null {
    if (!node || typeof node !== "object" || depth > 6 || seen.has(node)) return null;
    seen.add(node);
    const row = node as Record<string, unknown>;
    const uploadUrl = pickString(row, ["uploadUrl", "upload_url", "signedUrl", "signed_url"]);
    const assetUrl = pickString(row, [
      "assetUrl",
      "asset_url",
      "publicUrl",
      "public_url",
      "cdnUrl",
      "cdn_url",
      "fileUrl",
      "file_url",
    ]);
    if (uploadUrl && assetUrl) return { uploadUrl, assetUrl };
    if (uploadUrl && !assetUrl) {
      const fallbackAsset = pickString(row, ["url"]);
      if (fallbackAsset && fallbackAsset !== uploadUrl) {
        return { uploadUrl, assetUrl: fallbackAsset };
      }
    }
    for (const value of Object.values(row)) {
      if (value && typeof value === "object") {
        const found = walk(value, depth + 1);
        if (found) return found;
      }
    }
    return null;
  }

  for (const root of roots) {
    const found = walk(root, 0);
    if (found) return found;
  }
  return { uploadUrl: "", assetUrl: "" };
}

export type OpenArtVisualReference = {
  url: string;
  mediaType: "image";
  resourceId?: string;
  metadata: {
    media_type: "image";
    mime_type: string;
    format: string;
    width: number;
    height: number;
    size?: number;
  };
};

export function buildOpenArtVisualReference(input: {
  url: string;
  resourceId?: string;
  contentType: string;
  filename: string;
  bytes: Uint8Array;
}): OpenArtVisualReference {
  const dims =
    readRasterImageDimensions(input.bytes, input.contentType) ?? ({ width: 1024, height: 1024 } as const);
  const format = mimeToFormat(input.contentType, input.filename);
  const ref: OpenArtVisualReference = {
    url: input.url,
    mediaType: "image",
    metadata: {
      media_type: "image",
      mime_type: input.contentType || "image/jpeg",
      format,
      width: dims.width,
      height: dims.height,
      size: input.bytes.byteLength,
    },
  };
  if (input.resourceId?.trim()) ref.resourceId = input.resourceId.trim();
  return ref;
}

/** Frame / reference object shape used by OpenArt I2V + upload/sign (2026 suite). */
export function toOpenArtFramePayload(
  ref: OpenArtVisualReference,
  input?: { resourceId?: string; url?: string },
): Record<string, unknown> {
  const url = (input?.url ?? ref.url).trim();
  const resourceId = (input?.resourceId ?? ref.resourceId ?? "").trim();
  const width = ref.metadata.width;
  const height = ref.metadata.height;
  const size = ref.metadata.size ?? 0;
  return {
    type: "image",
    tool: "create-video",
    url,
    width,
    height,
    size,
    mimeType: ref.metadata.mime_type,
    mediaType: "image",
    metadata: ref.metadata,
    ...(resourceId ? { id: resourceId, resourceId } : {}),
  };
}

function formatOpenArtError(json: unknown, status: number): string {
  if (!json || typeof json !== "object") return `OpenArt API ${status}`;
  const row = json as Record<string, unknown>;
  const message = row.message ?? row.error ?? row.errorMessage;
  if (typeof message === "string" && message.trim()) return message;
  if (Array.isArray(message)) return message.map(String).join(", ");
  return `OpenArt API ${status}`;
}

export function estimateVideoCredits(
  durationSeconds: VideoDurationSeconds,
  resolution: VideoResolution,
): number {
  return estimateKlingUnits(durationSeconds, resolution);
}

export function aspectPresetToOpenArtRatio(preset: VideoAspectPreset): string {
  switch (preset) {
    case "reel_9_16":
    case "ads_9_16":
      return "9:16";
    case "feed_1_1":
    case "ads_1_1":
      return "1:1";
    case "feed_4_5":
      return "4:5";
    case "hero_16_9":
    default:
      return "16:9";
  }
}

type OpenArtIntegrationRow = {
  status: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string | null;
  metadata: Record<string, unknown>;
};

async function loadOpenArtRow(): Promise<OpenArtIntegrationRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .schema("app")
    .from("platform_integrations")
    .select("status, access_token, refresh_token, token_expires_at, metadata")
    .eq("provider", PLATFORM_OPENART_PROVIDER)
    .maybeSingle();
  if (!data || data.status !== "connected") return null;
  return data as OpenArtIntegrationRow;
}

async function persistOpenArtTokens(input: {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  metadataPatch?: Record<string, unknown>;
}) {
  const admin = createAdminClient();
  const row = await loadOpenArtRow();
  const metadata = { ...(row?.metadata ?? {}), ...(input.metadataPatch ?? {}) };
  await admin
    .schema("app")
    .from("platform_integrations")
    .update({
      access_token: input.accessToken,
      refresh_token: input.refreshToken || row?.refresh_token || "",
      token_expires_at: input.expiresAt,
      metadata,
      status: "connected",
      last_error: "",
      updated_at: new Date().toISOString(),
    })
    .eq("provider", PLATFORM_OPENART_PROVIDER);
}

export async function openArtPlatformConnected(): Promise<boolean> {
  const row = await loadOpenArtRow();
  return Boolean(row?.refresh_token?.trim());
}

export async function getOpenArtAccessToken(): Promise<string | null> {
  const row = await loadOpenArtRow();
  if (!row?.refresh_token?.trim()) return null;

  const clientId =
    String(row.metadata?.oauthClientId ?? "") || process.env.OPENART_OAUTH_CLIENT_ID?.trim() || "";
  if (!clientId) return null;

  const expiresAt = row.token_expires_at ? Date.parse(row.token_expires_at) : 0;
  const stillValid = row.access_token && expiresAt - Date.now() > 60_000;
  if (stillValid) return row.access_token;

  try {
    const refreshed = await refreshOpenArtAccessToken({
      refreshToken: row.refresh_token,
      clientId,
    });
    const expires = new Date(Date.now() + refreshed.expiresIn * 1000).toISOString();
    await persistOpenArtTokens({
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresAt: expires,
    });
    return refreshed.accessToken;
  } catch {
    return null;
  }
}

async function warmOpenArtSession(accessToken: string): Promise<void> {
  await Promise.allSettled([
    openArtJson(accessToken, "/user/my-info", { method: "POST", body: "{}" }),
    fetch(`${OPENART_API_BASE}/user/last-active`, {
      method: "GET",
      headers: { ...OPENART_HEADERS, ...OPENART_CLIENT_HEADERS, Authorization: `Bearer ${accessToken}` },
    }),
  ]);
}

function buildUploadSignBodies(input: {
  projectId: string;
  filename: string;
  contentType: string;
  width: number;
  height: number;
  size: number;
}): Record<string, unknown>[] {
  const { projectId, filename, contentType, width, height, size } = input;
  const resource = {
    type: "image",
    tool: "create-video",
    width,
    height,
    size,
    filename,
    contentType,
  };
  return [
    { projectId, ...resource },
    {
      projectId,
      filename,
      contentType,
      resourceType: "image",
      requestFormId: "create-video",
      width,
      height,
      size,
    },
    {
      projectId,
      fileName: filename,
      mimeType: contentType,
      mediaType: "image",
      requestFormId: "create-video",
      width,
      height,
      byteSize: size,
    },
    { projectId, resource },
    { projectId, asset: resource },
    { projectId, file: resource },
    { filename, contentType, projectId },
  ];
}

async function requestOpenArtUploadSign(input: {
  accessToken: string;
  projectId: string;
  filename: string;
  contentType: string;
  bytes: Uint8Array;
}): Promise<{ uploadUrl: string; assetUrl: string }> {
  await warmOpenArtSession(input.accessToken);
  const dims =
    readRasterImageDimensions(input.bytes, input.contentType) ?? ({ width: 1024, height: 1024 } as const);
  const bodies = buildUploadSignBodies({
    projectId: input.projectId,
    filename: input.filename,
    contentType: input.contentType,
    width: dims.width,
    height: dims.height,
    size: input.bytes.byteLength,
  });

  let lastError = "OpenArt upload/sign mislukt.";
  for (const body of bodies) {
    try {
      const signedRaw = await openArtJson<unknown>(input.accessToken, "/upload/sign", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const urls = extractSignedUploadUrls(signedRaw);
      if (urls.uploadUrl && urls.assetUrl) return urls;
      lastError = "OpenArt upload/sign gaf geen URL terug.";
    } catch (err) {
      lastError = err instanceof Error ? err.message : lastError;
    }
  }
  throw new Error(lastError.startsWith("OpenArt") ? lastError : `OpenArt upload/sign: ${lastError}`);
}

async function openArtJson<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${OPENART_API_BASE}${path}`, {
    ...init,
    headers: {
      ...OPENART_HEADERS,
      ...OPENART_CLIENT_HEADERS,
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });
  const json = (await res.json()) as T;
  if (!res.ok) {
    throw new Error(formatOpenArtError(json, res.status));
  }
  return json;
}

async function persistOpenArtUpload(input: {
  accessToken: string;
  projectId: string;
  assetUrl: string;
  filename: string;
  contentType: string;
  bytes: Uint8Array;
}): Promise<{ id: string; url: string }> {
  const dims =
    readRasterImageDimensions(input.bytes, input.contentType) ?? ({ width: 1024, height: 1024 } as const);
  const format = mimeToFormat(input.contentType, input.filename);
  const size = input.bytes.byteLength;

  const attempts: Record<string, unknown>[] = [
    { url: input.assetUrl, projectId: input.projectId },
    {
      url: input.assetUrl,
      projectId: input.projectId,
      type: "image",
      tool: "create-video",
      width: dims.width,
      height: dims.height,
      size,
      mimeType: input.contentType,
      filename: input.filename,
      metadata: {
        media_type: "image",
        mime_type: input.contentType,
        format,
        width: dims.width,
        height: dims.height,
        size,
      },
    },
  ];

  let lastError = "OpenArt upload/persist mislukt.";
  for (const body of attempts) {
    try {
      const raw = await openArtJson<unknown>(input.accessToken, "/upload/persist", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const row = unwrapOpenArtRecord(raw);
      const url = pickString(row, ["url", "assetUrl"]) || input.assetUrl;
      const id =
        pickString(row, ["id", "resourceId", "assetId"]) ||
        pickString(row, ["resource_id", "asset_id"]);
      if (url) return { id, url };
    } catch (err) {
      lastError = err instanceof Error ? err.message : lastError;
    }
  }
  throw new Error(lastError);
}

export async function fetchOpenArtUserInfo(accessToken: string) {
  return openArtJson<{
    displayName?: string;
    username?: string;
    free_credit_balance?: number;
    subscription_active?: boolean;
  }>(accessToken, "/user/my-info", { method: "POST", body: "{}" });
}

export async function fetchOpenArtDefaultProjectId(accessToken: string): Promise<string> {
  const json = await openArtJson<{ data?: { projectId?: string }; projectId?: string }>(
    accessToken,
    "/projects/default",
  );
  return String(json.data?.projectId ?? json.projectId ?? "");
}

export async function uploadOpenArtReferenceImage(input: {
  accessToken: string;
  projectId: string;
  bytes: Uint8Array;
  contentType: string;
  filename: string;
}): Promise<{ url: string; assetId: string }> {
  const { uploadUrl, assetUrl } = await requestOpenArtUploadSign({
    accessToken: input.accessToken,
    projectId: input.projectId,
    filename: input.filename,
    contentType: input.contentType,
    bytes: input.bytes,
  });

  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": input.contentType },
    body: Buffer.from(input.bytes),
  });
  if (!put.ok) throw new Error("Upload naar OpenArt storage mislukt.");

  try {
    const persisted = await persistOpenArtUpload({
      accessToken: input.accessToken,
      projectId: input.projectId,
      assetUrl,
      filename: input.filename,
      contentType: input.contentType,
      bytes: input.bytes,
    });
    return { url: persisted.url, assetId: persisted.id };
  } catch {
    // Genoeg om de asset-URL als visual reference mee te sturen.
    return { url: assetUrl, assetId: "" };
  }
}

export async function submitOpenArtKlingImageToVideo(input: {
  accessToken: string;
  projectId: string;
  prompt: string;
  imageUrl: string;
  imageAssetId?: string;
  imageReference: OpenArtVisualReference;
  durationSeconds: VideoDurationSeconds;
  resolution: VideoResolution;
  aspectRatio: string;
}): Promise<{ resourceId: string; historyId: string }> {
  const capability = encodeURIComponent(OPENART_I2V_CAPABILITY);
  const ref = input.imageReference;
  const refId = input.imageAssetId?.trim() || ref.resourceId?.trim() || "";
  const refUrl = input.imageUrl.trim() || ref.url.trim();
  if (!refUrl && !refId) {
    throw new Error("OpenArt startbeeld ontbreekt na upload.");
  }

  const base: Record<string, unknown> = {
    prompt: input.prompt,
    model: "kling2-6",
    projectId: input.projectId,
    folderId: null,
    duration: input.durationSeconds,
    resolution: input.resolution,
    aspectRatio: input.aspectRatio,
    videoCount: 1,
    enableUnlimited: true,
    autoEnhancePrompt: false,
    generateAudio: false,
  };

  const frame = toOpenArtFramePayload(ref, { url: refUrl, resourceId: refId });
  const submitBodies: Record<string, unknown>[] = [
    { ...base, startFrame: frame },
    { ...base, startFrame: frame, visualReferences: [frame] },
    { ...base, visualReferences: [frame] },
    ...(refId ? [{ ...base, startFrameResourceId: refId, visualReferences: [refId] }] : []),
    ...(refUrl ? [{ ...base, startFrameUrl: refUrl, visualReferences: [refUrl] }] : []),
  ];

  let submitRaw: unknown;
  let lastSubmitError = "OpenArt image-to-video submit mislukt.";
  for (const body of submitBodies) {
    try {
      submitRaw = await openArtJson<unknown>(input.accessToken, `/forms/creations/${capability}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      lastSubmitError = "";
      break;
    } catch (err) {
      lastSubmitError = err instanceof Error ? err.message : lastSubmitError;
    }
  }
  if (lastSubmitError || submitRaw === undefined) {
    throw new Error(lastSubmitError);
  }

  const submit = unwrapOpenArtRecord(submitRaw);

  const historyId = pickString(submit, ["historyId", "history_id"]);
  const resourceIdsRaw = submit.resourceIds ?? submit.resource_ids;
  const resourceIds = Array.isArray(resourceIdsRaw)
    ? resourceIdsRaw.map(String).filter(Boolean)
    : [];
  const resourceId = pickString(submit, ["resourceId", "resource_id"]) || resourceIds[0] || "";
  if (!resourceId && historyId) {
    const history = await openArtJson<{ history?: { resourceIds?: string[] } }>(
      input.accessToken,
      `/history/${historyId}`,
    );
    const fromHistory = history.history?.resourceIds?.[0];
    if (fromHistory) {
      return { resourceId: String(fromHistory), historyId };
    }
  }
  if (!resourceId) {
    throw new Error("OpenArt gaf geen resource-id terug voor polling.");
  }
  return { resourceId, historyId };
}

export type OpenArtResourcePoll = {
  status: "pending" | "processing" | "completed" | "failed";
  url: string;
  message: string;
};

export async function pollOpenArtResource(
  accessToken: string,
  resourceId: string,
): Promise<OpenArtResourcePoll> {
  const raw = await openArtJson<unknown>(accessToken, `/resources/${resourceId}`);
  const row = unwrapOpenArtRecord(raw);
  const statusRaw = pickString(row, ["status"]).toLowerCase();
  const url = pickString(row, ["url"]);
  if (statusRaw === "completed" && url) {
    return { status: "completed", url, message: "" };
  }
  if (statusRaw === "failed" || statusRaw === "error") {
    return { status: "failed", url: "", message: "OpenArt-generatie mislukt" };
  }
  if (statusRaw === "processing" || statusRaw === "pending" || statusRaw === "running") {
    return { status: "processing", url: "", message: "" };
  }
  return { status: "pending", url: "", message: "" };
}

export async function loadOpenArtProjectId(): Promise<string | null> {
  const row = await loadOpenArtRow();
  const fromMeta = String(row?.metadata?.projectId ?? "").trim();
  if (fromMeta) return fromMeta;
  const token = await getOpenArtAccessToken();
  if (!token) return null;
  const projectId = await fetchOpenArtDefaultProjectId(token);
  if (projectId) {
    await persistOpenArtTokens({
      accessToken: token,
      refreshToken: row?.refresh_token ?? "",
      expiresAt: row?.token_expires_at ?? new Date(Date.now() + 3600_000).toISOString(),
      metadataPatch: { projectId },
    });
  }
  return projectId || null;
}

export async function syncOpenArtPublicMetadata(): Promise<void> {
  const token = await getOpenArtAccessToken();
  if (!token) return;
  const row = await loadOpenArtRow();
  if (!row) return;
  try {
    const info = await fetchOpenArtUserInfo(token);
    const projectId =
      String(row.metadata?.projectId ?? "") || (await fetchOpenArtDefaultProjectId(token));
    await persistOpenArtTokens({
      accessToken: token,
      refreshToken: row.refresh_token,
      expiresAt: row.token_expires_at ?? new Date(Date.now() + 3600_000).toISOString(),
      metadataPatch: {
        projectId,
        subscriptionActive: Boolean(info.subscription_active),
        openArtCredits: info.free_credit_balance ?? null,
        displayName: info.displayName ?? info.username ?? "",
      },
    });
  } catch {
    /* best-effort cache for Instellingen */
  }
}
