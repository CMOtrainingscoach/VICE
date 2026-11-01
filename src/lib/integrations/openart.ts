import { randomUUID } from "crypto";

import type { OpenArtVideoModel } from "@/lib/content/openart-video-models";
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

/** Matches OpenArt suite `UPLOADED_ASSET_*` enums (2026 upload/sign). */
const OPENART_UPLOAD_RESOURCE_TYPE_IMAGE = "image";
const OPENART_UPLOAD_BUSINESS_TYPE_CREATE_VIDEO = "create-video";

export const OPENART_RECONNECT_MESSAGE =
  "OpenArt-sessie verlopen of ongeldig. Ga naar Instellingen → OpenArt opnieuw koppelen.";

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

type OpenArtUploadSignResult = {
  uploadUrl: string;
  assetUrl: string;
  uploadId: string;
};

function extractOpenArtUploadSign(raw: unknown): OpenArtUploadSignResult {
  const roots: unknown[] = [raw];
  if (raw && typeof raw === "object") {
    roots.push(unwrapOpenArtRecord(raw));
  }

  const seen = new Set<unknown>();
  function walk(node: unknown, depth: number): OpenArtUploadSignResult | null {
    if (!node || typeof node !== "object" || depth > 6 || seen.has(node)) return null;
    seen.add(node);
    const row = node as Record<string, unknown>;
    const uploadUrl = pickString(row, [
      "signURL",
      "signUrl",
      "uploadUrl",
      "upload_url",
      "signedUrl",
      "signed_url",
    ]);
    const assetUrl = pickString(row, [
      "accessURL",
      "accessUrl",
      "assetUrl",
      "asset_url",
      "publicUrl",
      "public_url",
      "cdnUrl",
      "cdn_url",
      "fileUrl",
      "file_url",
    ]);
    const uploadId = pickString(row, ["uploadId", "upload_id"]);
    if (uploadUrl) {
      return {
        uploadUrl,
        assetUrl,
        uploadId,
      };
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
  return { uploadUrl: "", assetUrl: "", uploadId: "" };
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
    /** Legacy / Kling suite fields */
    size: number;
    /** Required by Seedance (and Kling) frame validation on OpenArt */
    file_size_bytes: number;
  };
};

export function buildOpenArtImageMetadata(input: {
  contentType: string;
  filename: string;
  bytes: Uint8Array;
}): OpenArtVisualReference["metadata"] {
  const dims =
    readRasterImageDimensions(input.bytes, input.contentType) ?? ({ width: 1024, height: 1024 } as const);
  const format = mimeToFormat(input.contentType, input.filename);
  const file_size_bytes = input.bytes.byteLength;
  return {
    media_type: "image",
    mime_type: input.contentType || "image/jpeg",
    format,
    width: dims.width,
    height: dims.height,
    size: file_size_bytes,
    file_size_bytes,
  };
}

export function buildOpenArtVisualReference(input: {
  url: string;
  resourceId?: string;
  contentType: string;
  filename: string;
  bytes: Uint8Array;
}): OpenArtVisualReference {
  const ref: OpenArtVisualReference = {
    url: input.url,
    mediaType: "image",
    metadata: buildOpenArtImageMetadata({
      contentType: input.contentType,
      filename: input.filename,
      bytes: input.bytes,
    }),
  };
  if (input.resourceId?.trim()) ref.resourceId = input.resourceId.trim();
  return ref;
}

function openArtI2vCapability(model: OpenArtVideoModel): string {
  return `${model}:image2video`;
}

/** Image-to-video `startFrame` shape (OpenArt suite form schema). */
export function buildOpenArtImageStartFrame(input: {
  url: string;
  label: string;
  reference: OpenArtVisualReference;
  resourceId?: string;
}): Record<string, unknown> {
  const url = input.url.trim();
  const id = (input.resourceId ?? input.reference.resourceId ?? "").trim() || randomUUID();
  return {
    type: "image",
    id,
    url,
    label: input.label.trim() || "start-frame",
    metadata: input.reference.metadata,
  };
}

function openArtKling26Resolution(resolution: VideoResolution): "std" | "pro" {
  return resolution === "720p" ? "std" : "pro";
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

function openArtOAuthClientId(row: OpenArtIntegrationRow): string {
  return String(row.metadata?.oauthClientId ?? "") || process.env.OPENART_OAUTH_CLIENT_ID?.trim() || "";
}

function isOpenArtAuthFailure(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("unknown token") ||
    msg.includes("invalid token") ||
    msg.includes("unauthorized") ||
    msg.includes("invalid_grant") ||
    msg.includes("token refresh mislukt") ||
    msg.includes("token exchange mislukt")
  );
}

async function markOpenArtAuthFailure(reason: unknown): Promise<void> {
  const message = reason instanceof Error ? reason.message : String(reason);
  const admin = createAdminClient();
  await admin
    .schema("app")
    .from("platform_integrations")
    .update({
      last_error: message.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq("provider", PLATFORM_OPENART_PROVIDER);
}

async function forceRefreshOpenArtAccessToken(): Promise<string | null> {
  const row = await loadOpenArtRow();
  if (!row?.refresh_token?.trim()) return null;
  const clientId = openArtOAuthClientId(row);
  if (!clientId) return null;
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
  } catch (err) {
    await markOpenArtAuthFailure(err);
    return null;
  }
}

export async function getOpenArtAccessToken(): Promise<string | null> {
  const row = await loadOpenArtRow();
  if (!row?.refresh_token?.trim()) return null;

  const clientId = openArtOAuthClientId(row);
  if (!clientId) return null;

  const expiresAt = row.token_expires_at ? Date.parse(row.token_expires_at) : 0;
  const hasExpiry = Number.isFinite(expiresAt) && expiresAt > 0;
  const stillValid = Boolean(row.access_token && hasExpiry && expiresAt - Date.now() > 60_000);
  if (stillValid) return row.access_token;

  return forceRefreshOpenArtAccessToken();
}

export function isOpenArtReconnectError(err: unknown): boolean {
  if (isOpenArtAuthFailure(err)) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes(OPENART_RECONNECT_MESSAGE);
}

async function warmOpenArtSession(accessToken: string): Promise<void> {
  await Promise.allSettled([
    openArtJsonWithRetry(accessToken, "/user/my-info", { method: "POST", body: "{}" }),
    fetch(`${OPENART_API_BASE}/user/last-active`, {
      method: "GET",
      headers: { ...OPENART_HEADERS, ...OPENART_CLIENT_HEADERS, Authorization: `Bearer ${accessToken}` },
    }),
  ]);
}

function buildUploadSignBody(input: {
  projectId: string;
  filename: string;
  contentType: string;
  size: number;
}): Record<string, unknown> {
  return {
    filename: input.filename,
    contentType: input.contentType,
    size: input.size,
    resourceType: OPENART_UPLOAD_RESOURCE_TYPE_IMAGE,
    businessType: OPENART_UPLOAD_BUSINESS_TYPE_CREATE_VIDEO,
    needThumbnail: true,
    projectId: input.projectId,
  };
}

async function waitForOpenArtUploadValidation(accessToken: string, uploadId: string): Promise<void> {
  if (!uploadId.trim()) return;
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const raw = await openArtJsonWithRetry<unknown>(accessToken, `/uploaded-assets/${uploadId}/status`);
    const row = unwrapOpenArtRecord(raw);
    const status = pickString(row, ["status"]).toUpperCase();
    if (status === "SUCCESS") return;
    if (status === "FAILED") {
      const reason =
        pickString(row, ["errorReason", "error_reason", "message"]) || "Upload failed validation";
      throw new Error(reason);
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
}

async function requestOpenArtUploadSign(input: {
  accessToken: string;
  projectId: string;
  filename: string;
  contentType: string;
  bytes: Uint8Array;
}): Promise<OpenArtUploadSignResult> {
  await warmOpenArtSession(input.accessToken);
  const size = input.bytes.byteLength;
  const bodies: Record<string, unknown>[] = [
    buildUploadSignBody({
      projectId: input.projectId,
      filename: input.filename,
      contentType: input.contentType,
      size,
    }),
    { filename: input.filename, contentType: input.contentType },
  ];

  let lastError = "OpenArt upload/sign mislukt.";
  for (const body of bodies) {
    try {
      const signedRaw = await openArtJsonWithRetry<unknown>(input.accessToken, "/upload/sign", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const signed = extractOpenArtUploadSign(signedRaw);
      if (signed.uploadUrl) return signed;
      lastError = "OpenArt upload/sign gaf geen upload-URL terug.";
    } catch (err) {
      lastError = err instanceof Error ? err.message : lastError;
    }
  }
  if (isOpenArtAuthFailure(new Error(lastError))) {
    throw new Error(OPENART_RECONNECT_MESSAGE);
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

async function openArtJsonWithRetry<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
  retried = false,
): Promise<T> {
  try {
    return await openArtJson<T>(accessToken, path, init);
  } catch (err) {
    if (retried || !isOpenArtAuthFailure(err)) throw err;
    const fresh = await forceRefreshOpenArtAccessToken();
    if (!fresh) throw new Error(OPENART_RECONNECT_MESSAGE);
    return openArtJsonWithRetry<T>(fresh, path, init, true);
  }
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
      const raw = await openArtJsonWithRetry<unknown>(input.accessToken, "/upload/persist", {
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
  return openArtJsonWithRetry<{
    displayName?: string;
    username?: string;
    free_credit_balance?: number;
    subscription_active?: boolean;
  }>(accessToken, "/user/my-info", { method: "POST", body: "{}" });
}

export async function fetchOpenArtDefaultProjectId(accessToken: string): Promise<string> {
  const json = await openArtJsonWithRetry<{ data?: { projectId?: string }; projectId?: string }>(
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
  const signed = await requestOpenArtUploadSign({
    accessToken: input.accessToken,
    projectId: input.projectId,
    filename: input.filename,
    contentType: input.contentType,
    bytes: input.bytes,
  });

  const put = await fetch(signed.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": input.contentType },
    body: Buffer.from(input.bytes),
  });
  if (!put.ok) throw new Error("Upload naar OpenArt storage mislukt.");

  await waitForOpenArtUploadValidation(input.accessToken, signed.uploadId);

  let assetUrl = signed.assetUrl;
  if (!assetUrl) {
    try {
      const persisted = await persistOpenArtUpload({
        accessToken: input.accessToken,
        projectId: input.projectId,
        assetUrl: signed.assetUrl || signed.uploadUrl.split("?")[0] || "",
        filename: input.filename,
        contentType: input.contentType,
        bytes: input.bytes,
      });
      return { url: persisted.url, assetId: persisted.id };
    } catch {
      throw new Error("OpenArt upload: geen publieke asset-URL na upload.");
    }
  }

  try {
    const persisted = await persistOpenArtUpload({
      accessToken: input.accessToken,
      projectId: input.projectId,
      assetUrl,
      filename: input.filename,
      contentType: input.contentType,
      bytes: input.bytes,
    });
    return { url: persisted.url || assetUrl, assetId: persisted.id || signed.uploadId };
  } catch {
    return { url: assetUrl, assetId: signed.uploadId };
  }
}

export async function submitOpenArtImageToVideo(input: {
  accessToken: string;
  projectId: string;
  model: OpenArtVideoModel;
  prompt: string;
  imageUrl: string;
  imageAssetId?: string;
  imageReference: OpenArtVisualReference;
  startFrameLabel: string;
  durationSeconds: VideoDurationSeconds;
  resolution: VideoResolution;
}): Promise<{ resourceId: string; historyId: string }> {
  const capability = encodeURIComponent(openArtI2vCapability(input.model));
  const ref = input.imageReference;
  const refId = input.imageAssetId?.trim() || ref.resourceId?.trim() || "";
  const refUrl = input.imageUrl.trim() || ref.url.trim();
  if (!refUrl) {
    throw new Error("OpenArt startbeeld ontbreekt na upload.");
  }

  const startFrame = buildOpenArtImageStartFrame({
    url: refUrl,
    label: input.startFrameLabel,
    reference: ref,
    resourceId: refId,
  });

  const shared = {
    prompt: input.prompt,
    projectId: input.projectId,
    folderId: null,
    videoCount: 1,
    startFrame,
    duration: input.durationSeconds,
    enableUnlimited: true,
    autoEnhancePrompt: false,
  };

  const body: Record<string, unknown> =
    input.model === "byte-plus-seedance-2-5"
      ? {
          ...shared,
          resolution: input.resolution,
          generateAudio: false,
          seed: -1,
        }
      : {
          ...shared,
          sound: false,
          resolution: openArtKling26Resolution(input.resolution),
        };

  let submitRaw: unknown;
  let lastSubmitError = "OpenArt image-to-video submit mislukt.";
  try {
    submitRaw = await openArtJsonWithRetry<unknown>(input.accessToken, `/forms/creations/${capability}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    lastSubmitError = "";
  } catch (err) {
    lastSubmitError = err instanceof Error ? err.message : lastSubmitError;
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
    const history = await openArtJsonWithRetry<{ history?: { resourceIds?: string[] } }>(
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

/** @deprecated Use submitOpenArtImageToVideo */
export const submitOpenArtKlingImageToVideo = submitOpenArtImageToVideo;

export type OpenArtResourcePoll = {
  status: "pending" | "processing" | "completed" | "failed";
  url: string;
  message: string;
};

function pickOpenArtResourceMediaUrl(row: Record<string, unknown>): string {
  const candidates = [
    pickString(row, ["url"]),
    pickString(row, ["videoUrl", "video_url"]),
    pickString(row, ["downloadUrl", "download_url"]),
  ].filter(Boolean);
  for (const url of candidates) {
    const lower = url.toLowerCase();
    if (lower.includes(".mp4") || lower.includes("/video") || lower.includes("video_")) return url;
  }
  return candidates[0] ?? "";
}

export async function pollOpenArtResource(
  accessToken: string,
  resourceId: string,
): Promise<OpenArtResourcePoll> {
  const raw = await openArtJsonWithRetry<unknown>(accessToken, `/resources/${resourceId}`);
  const row = unwrapOpenArtRecord(raw);
  const statusRaw = pickString(row, ["status"]).toLowerCase();
  const url = pickOpenArtResourceMediaUrl(row);
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
