import OpenAI from "openai";
import { createAdminClient } from "@/lib/supabase/admin";
import { textToTokenIds } from "@/lib/transcription/tokens";

export type TranscriptSegment = {
  start_ms: number;
  end_ms: number;
  text: string;
};

export type TranscriptionResult = {
  fullText: string;
  tokenIds: number[];
  segments: TranscriptSegment[];
  sttProvider: string;
  sttModel: string;
};

function segmentsFromVerbose(
  segments: { start: number; end: number; text: string }[] | undefined,
): TranscriptSegment[] {
  if (!segments?.length) return [];
  return segments.map((s) => ({
    start_ms: Math.round(s.start * 1000),
    end_ms: Math.round(s.end * 1000),
    text: s.text.trim(),
  }));
}

export async function transcribeRecordingFromStorage(
  storagePath: string,
  mimeType: string,
): Promise<TranscriptionResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY ontbreekt. Zet deze in .env.local voor STT (demo/synthetisch).",
    );
  }

  const admin = createAdminClient();
  const { data: blob, error: downloadError } = await admin.storage
    .from("meeting-recordings")
    .download(storagePath);

  if (downloadError || !blob) {
    throw new Error(downloadError?.message ?? "Audio download mislukt");
  }

  const buffer = Buffer.from(await blob.arrayBuffer());
  const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "m4a" : "webm";
  const file = new File([buffer], `meeting.${ext}`, { type: mimeType });

  const openai = new OpenAI({ apiKey });
  const verbose = await openai.audio.transcriptions.create({
    file,
    model: process.env.VICE_STT_MODEL ?? "whisper-1",
    response_format: "verbose_json",
    language: "nl",
  });

  const fullText = verbose.text?.trim() ?? "";
  if (!fullText) {
    throw new Error("Geen spraak herkend in de opname.");
  }

  const tokenIds = textToTokenIds(fullText);
  const segments = segmentsFromVerbose(
    verbose.segments as { start: number; end: number; text: string }[] | undefined,
  );

  return {
    fullText,
    tokenIds,
    segments,
    sttProvider: "openai",
    sttModel: process.env.VICE_STT_MODEL ?? "whisper-1",
  };
}

export async function deleteRecordingAudio(storagePath: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.storage.from("meeting-recordings").remove([storagePath]);
  if (error) {
    throw new Error(`Audio verwijderen mislukt: ${error.message}`);
  }
}
