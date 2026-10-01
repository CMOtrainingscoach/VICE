"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession, requirePlatformAdminMfa } from "@/lib/auth/session";
import { RECORDING_LIMITS } from "@/lib/recording/config";
import {
  deleteRecordingAudio,
  transcribeRecordingFromStorage,
} from "@/lib/transcription/transcribe-recording";
import { generateMeetingAnalysis } from "@/lib/analysis/generate-meeting-analysis";
import { formatTimelineNotesForAnalysis } from "@/lib/meetings/timeline-notes";
import { estimateTokenStorageBytes, textToTokenIds } from "@/lib/transcription/tokens";
import { updateMeetingRecordingSchema } from "@/modules/meetings/schema";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export async function startMeetingRecordingAction(input: {
  tenantId: string;
  captureMode: "microphone" | "tab_audio";
  mimeType: string;
}): Promise<ActionResult<{ recordingId: string; storagePath: string }>> {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);

  const supabase = await createClient();
  const { data, error } = await supabase.schema("app").rpc("start_meeting_recording", {
    p_tenant_id: input.tenantId,
    p_capture_mode: input.captureMode,
    p_mime_type: input.mimeType,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const row = (Array.isArray(data) ? data[0] : data) as {
    recording_id: string;
    storage_path: string;
  };

  return {
    ok: true,
    data: {
      recordingId: row.recording_id,
      storagePath: row.storage_path,
    },
  };
}

export async function completeMeetingRecordingAction(input: {
  tenantId: string;
  recordingId: string;
  byteSize: number;
  durationMs: number;
}): Promise<ActionResult> {
  if (input.byteSize > RECORDING_LIMITS.maxBytes) {
    return { ok: false, error: "Opname overschrijdt de limiet van 25 MB." };
  }

  const session = await requireSession();
  await requirePlatformAdminMfa(session);

  const supabase = await createClient();
  const { error } = await supabase.schema("app").rpc("complete_meeting_recording", {
    p_recording_id: input.recordingId,
    p_byte_size: input.byteSize,
    p_duration_ms: input.durationMs,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath(`/klanten/${input.tenantId}`);
  revalidatePath(`/klanten/${input.tenantId}/meetings`);
  return { ok: true };
}

export async function failMeetingRecordingAction(
  recordingId: string,
): Promise<ActionResult> {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);

  const supabase = await createClient();
  await supabase.schema("app").rpc("fail_meeting_recording", {
    p_recording_id: recordingId,
  });

  return { ok: true };
}

export async function transcribeMeetingRecordingAction(input: {
  tenantId: string;
  recordingId: string;
}): Promise<
  ActionResult<{
    tokenCount: number;
    storageBytes: number;
    preview: string;
    audioDeleted: boolean;
  }>
> {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);

  const supabase = await createClient();

  const { data: row, error: fetchError } = await supabase
    .schema("app")
    .from("meeting_recordings")
    .select("id, storage_path, mime_type, transcript_status")
    .eq("id", input.recordingId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();

  if (fetchError || !row) {
    return { ok: false, error: fetchError?.message ?? "Opname niet gevonden." };
  }

  if (row.transcript_status === "ready") {
    return { ok: false, error: "Transcript staat al klaar." };
  }

  await supabase.schema("app").rpc("set_meeting_transcript_processing", {
    p_recording_id: input.recordingId,
  });

  const deleteAfter =
    process.env.VICE_DELETE_AUDIO_AFTER_TRANSCRIBE !== "false";

  try {
    const result = await transcribeRecordingFromStorage(
      row.storage_path as string,
      (row.mime_type as string) ?? "audio/webm",
    );

    if (deleteAfter) {
      await deleteRecordingAudio(row.storage_path as string);
    }

    const { error: saveError } = await supabase.schema("app").rpc("save_meeting_transcript", {
      p_recording_id: input.recordingId,
      p_full_text: result.fullText,
      p_token_ids: result.tokenIds,
      p_segments: result.segments,
      p_stt_provider: result.sttProvider,
      p_stt_model: result.sttModel,
      p_delete_audio: deleteAfter,
    });

    if (saveError) {
      return { ok: false, error: saveError.message };
    }

    revalidatePathsForMeeting(input.tenantId, input.recordingId);

    const preview =
      result.fullText.length > 280
        ? `${result.fullText.slice(0, 280)}…`
        : result.fullText;

    return {
      ok: true,
      data: {
        tokenCount: result.tokenIds.length,
        storageBytes: estimateTokenStorageBytes(result.tokenIds.length),
        preview,
        audioDeleted: deleteAfter,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transcriptie mislukt";
    await supabase.schema("app").rpc("fail_meeting_transcript", {
      p_recording_id: input.recordingId,
      p_error: message,
    });
    return { ok: false, error: message };
  }
}

export async function updateMeetingRecordingAction(input: {
  tenantId: string;
  recordingId: string;
  values: unknown;
}): Promise<ActionResult> {
  const parsed = updateMeetingRecordingSchema.safeParse(input.values);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Ongeldige invoer",
    };
  }

  const session = await requireSession();
  await requirePlatformAdminMfa(session);

  const supabase = await createClient();

  const { error: metaError } = await supabase.schema("app").rpc(
    "update_meeting_recording_meta",
    {
      p_recording_id: input.recordingId,
      p_title: parsed.data.title,
      p_subject: parsed.data.subject,
      p_notes: parsed.data.notes ?? "",
    },
  );

  if (metaError) {
    return { ok: false, error: metaError.message };
  }

  if (parsed.data.fullText !== undefined) {
    const tokenIds = textToTokenIds(parsed.data.fullText);
    const { error: textError } = await supabase.schema("app").rpc(
      "update_meeting_transcript_text",
      {
        p_recording_id: input.recordingId,
        p_full_text: parsed.data.fullText,
        p_token_ids: tokenIds,
      },
    );
    if (textError) {
      return { ok: false, error: textError.message };
    }
  }

  revalidatePathsForMeeting(input.tenantId, input.recordingId);
  return { ok: true };
}

function revalidatePathsForMeeting(tenantId: string, recordingId?: string) {
  revalidatePath(`/klanten/${tenantId}/meetings`);
  revalidatePath(`/klanten/${tenantId}/meetings/nieuw`);
  revalidatePath(`/klanten/${tenantId}/opnemen`);
  if (recordingId) {
    revalidatePath(`/klanten/${tenantId}/meetings/${recordingId}`);
    revalidatePath(`/klanten/${tenantId}/opnemen/${recordingId}`);
  }
}

export async function approveMeetingTranscriptAction(input: {
  tenantId: string;
  recordingId: string;
}): Promise<ActionResult> {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);

  const supabase = await createClient();
  const { error } = await supabase.schema("app").rpc("approve_meeting_transcript", {
    p_recording_id: input.recordingId,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePathsForMeeting(input.tenantId, input.recordingId);
  return { ok: true };
}

export async function generateMeetingAnalysisAction(input: {
  tenantId: string;
  recordingId: string;
}): Promise<ActionResult<{ summary: string; actionCount: number }>> {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);

  const supabase = await createClient();
  const { data: row, error: fetchError } = await supabase
    .schema("app")
    .from("meeting_recordings")
    .select(
      "title, subject, notes, full_text, review_status, transcript_status",
    )
    .eq("id", input.recordingId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();

  if (fetchError || !row) {
    return { ok: false, error: "Meeting niet gevonden." };
  }

  if (row.review_status !== "approved") {
    return {
      ok: false,
      error: "Keur het transcript eerst goed voor analyse.",
    };
  }

  if (row.transcript_status !== "ready" || !row.full_text) {
    return { ok: false, error: "Geen transcript beschikbaar." };
  }

  await supabase.schema("app").rpc("set_meeting_analysis_pending", {
    p_recording_id: input.recordingId,
  });

  try {
    const result = await generateMeetingAnalysis({
      title: (row.title as string) ?? "",
      subject: (row.subject as string) ?? "",
      notes: formatTimelineNotesForAnalysis((row.notes as string) ?? ""),
      transcript: row.full_text as string,
    });

    const actionItems = result.actionItems.map((item) => ({
      text: item.text,
      done: false,
    }));

    const { error: saveError } = await supabase.schema("app").rpc(
      "save_meeting_analysis",
      {
        p_recording_id: input.recordingId,
        p_summary: result.summary,
        p_action_items: actionItems,
      },
    );

    if (saveError) {
      return { ok: false, error: saveError.message };
    }

    revalidatePathsForMeeting(input.tenantId, input.recordingId);

    return {
      ok: true,
      data: {
        summary: result.summary,
        actionCount: actionItems.length,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analyse mislukt";
    await supabase.schema("app").rpc("fail_meeting_analysis", {
      p_recording_id: input.recordingId,
      p_error: message,
    });
    return { ok: false, error: message };
  }
}

export async function deleteMeetingRecordingAction(input: {
  tenantId: string;
  recordingId: string;
}): Promise<ActionResult> {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);

  const supabase = await createClient();
  const { data: storagePath, error } = await supabase.schema("app").rpc(
    "delete_meeting_recording",
    { p_recording_id: input.recordingId },
  );

  if (error) {
    return { ok: false, error: error.message };
  }

  if (typeof storagePath === "string" && storagePath.length > 0) {
    try {
      await deleteRecordingAudio(storagePath);
    } catch {
      /* rij is al weg; orphan storage kan later worden opgeschoond */
    }
  }

  revalidatePathsForMeeting(input.tenantId);
  return { ok: true };
}
