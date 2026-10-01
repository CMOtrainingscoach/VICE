/** Speech-first defaults: small files, later transcription stays within token budget. */
export const RECORDING_LIMITS = {
  /** Hard stop for upload + storage bucket (bytes). */
  maxBytes: 26_214_400,
  /** Auto-stop recording (ms). ~90 min at 32 kbps ≈ well under 25 MiB. */
  maxDurationMs: 90 * 60 * 1000,
  /** Opus/WebM target bitrate for MediaRecorder. */
  audioBitsPerSecond: 32_000,
  /** Timeslice for size monitoring during capture. */
  chunkMs: 2_000,
  /** Warn in UI above this size (bytes). */
  warnBytes: 20 * 972_800,
} as const;

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
] as const;

export function pickRecordingMimeType(): string {
  if (typeof MediaRecorder === "undefined") {
    return "audio/webm";
  }
  for (const mime of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return "audio/webm";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Rough upper bound for transcript tokens (chars / 4) — planning only, no API call. */
export function estimateTranscriptTokensFromBytes(bytes: number): number {
  const assumedChars = (bytes / 32) * 10;
  return Math.ceil(assumedChars / 4);
}
