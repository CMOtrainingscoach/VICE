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

async function openArtJson<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${OPENART_API_BASE}${path}`, {
    ...init,
    headers: {
      ...OPENART_HEADERS,
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
}): Promise<{ id: string; url: string }> {
  const attempts: Record<string, unknown>[] = [
    { url: input.assetUrl, projectId: input.projectId },
    {
      url: input.assetUrl,
      projectId: input.projectId,
      type: "image",
      tool: "create-video",
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
      const id = pickString(row, ["id", "resourceId", "assetId"]);
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
  const signedRaw = await openArtJson<unknown>(input.accessToken, "/upload/sign", {
    method: "POST",
    body: JSON.stringify({
      filename: input.filename,
      contentType: input.contentType,
    }),
  });
  const signed = unwrapOpenArtRecord(signedRaw);
  const uploadUrl = pickString(signed, ["uploadUrl", "upload_url"]);
  const assetUrl = pickString(signed, ["assetUrl", "asset_url", "url"]);
  if (!uploadUrl || !assetUrl) {
    throw new Error("OpenArt upload/sign gaf geen URL terug.");
  }

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
  durationSeconds: VideoDurationSeconds;
  resolution: VideoResolution;
  aspectRatio: string;
}): Promise<{ resourceId: string; historyId: string }> {
  const capability = encodeURIComponent(OPENART_I2V_CAPABILITY);
  const visualRef = input.imageAssetId?.trim() || input.imageUrl.trim();
  if (!visualRef) {
    throw new Error("OpenArt startbeeld ontbreekt na upload.");
  }

  const body: Record<string, unknown> = {
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
    visualReferences: [visualRef],
  };

  const submitRaw = await openArtJson<unknown>(input.accessToken, `/forms/creations/${capability}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
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
