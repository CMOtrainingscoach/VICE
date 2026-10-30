const DEFAULT_BASE = "https://api-singapore.klingai.com";

export type KlingTaskStatus = "submitted" | "processing" | "succeeded" | "failed";

export type KlingVideoOutput = {
  url: string;
  durationSeconds: number | null;
};

type KlingResponse<T> = {
  code: number;
  message: string;
  data: T;
};

function apiKey() {
  const key = process.env.KLING_API_KEY?.trim();
  if (!key) throw new Error("KLING_API_KEY ontbreekt. Zet de key in de omgeving (Instellingen → Video).");
  return key;
}

function baseUrl() {
  return (process.env.KLING_API_BASE?.trim() || DEFAULT_BASE).replace(/\/$/, "");
}

async function klingFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey()}`,
      ...(init?.headers ?? {}),
    },
  });
  const json = (await response.json()) as KlingResponse<T>;
  if (!response.ok || json.code !== 0) {
    throw new Error(json.message || `Kling API-fout (${response.status})`);
  }
  return json.data;
}

/** Kling 2.5 Turbo @ 720p ≈ 0.3 units/s (no audio). Conservatief voor 1080p. */
export function estimateKlingUnits(durationSeconds: 5 | 10, resolution: "720p" | "1080p"): number {
  const rate = resolution === "1080p" ? 0.5 : 0.3;
  return Math.round(rate * durationSeconds * 100) / 100;
}

export function klingApiConfigured(): boolean {
  return Boolean(process.env.KLING_API_KEY?.trim());
}

export async function createKlingImageToVideoTask(input: {
  motionPrompt: string;
  imageUrl: string;
  durationSeconds: 5 | 10;
  resolution: "720p" | "1080p";
  externalTaskId?: string;
}): Promise<{ taskId: string; status: KlingTaskStatus }> {
  const data = await klingFetch<{ id: string; status: KlingTaskStatus }>("/image-to-video/kling-2.5-turbo", {
    method: "POST",
    body: JSON.stringify({
      contents: [
        { type: "prompt", text: input.motionPrompt.slice(0, 2500) },
        { type: "first_frame", url: input.imageUrl },
      ],
      settings: {
        resolution: input.resolution,
        duration: input.durationSeconds,
      },
      options: {
        external_task_id: input.externalTaskId || undefined,
        watermark_info: { enabled: false },
      },
    }),
  });
  return { taskId: data.id, status: data.status };
}

export async function queryKlingTask(taskId: string): Promise<{
  status: KlingTaskStatus;
  message: string;
  video: KlingVideoOutput | null;
}> {
  const data = await klingFetch<
    Array<{
      id: string;
      status: KlingTaskStatus;
      message?: string;
      outputs?: Array<{ type: string; url?: string; duration?: string }>;
    }>
  >(`/tasks?task_ids=${encodeURIComponent(taskId)}`, { method: "GET" });

  const row = data[0];
  if (!row) throw new Error("Kling-taak niet gevonden.");

  let video: KlingVideoOutput | null = null;
  const output = row.outputs?.find((item) => item.type === "video" && item.url);
  if (output?.url) {
    video = {
      url: output.url,
      durationSeconds: output.duration ? Number(output.duration) : null,
    };
  }

  return {
    status: row.status,
    message: row.message ?? "",
    video,
  };
}
