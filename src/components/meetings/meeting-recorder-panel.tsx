"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  RECORDING_LIMITS,
  formatBytes,
  formatDuration,
} from "@/lib/recording/config";
import { estimateTokenStorageBytes } from "@/lib/transcription/tokens";
import {
  type CaptureMode,
  useMeetingRecorder,
} from "@/hooks/use-meeting-recorder";

type MeetingRecorderPanelProps = {
  tenantId: string;
  tenantName: string;
};

export function MeetingRecorderPanel({
  tenantId,
  tenantName,
}: MeetingRecorderPanelProps) {
  const [captureMode, setCaptureMode] = useState<CaptureMode>("microphone");
  const {
    phase,
    error,
    bytesEstimate,
    elapsedMs,
    tokenCount,
    transcriptPreview,
    lastRecordingId,
    start,
    stop,
    reset,
  } = useMeetingRecorder({ tenantId, captureMode });

  const busy =
    phase === "recording" || phase === "uploading" || phase === "transcribing";
  const warnSize = bytesEstimate >= RECORDING_LIMITS.warnBytes;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-vice-border bg-vice-surface-muted/40 p-4 text-sm text-vice-text-muted">
        <p className="font-medium text-vice-text">Lightweight pipeline</p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>Korte Opus-opname (32 kbps) → Whisper STT → tokens in database</li>
          <li>Audio wordt na transcriptie standaard verwijderd (alleen tekst/tokens blijven)</li>
          <li>Later: VAD + edge-STT in browser (Silero / Transformers.js)</li>
        </ul>
      </div>

      <fieldset className="space-y-2" disabled={busy}>
        <legend className="text-sm font-medium text-vice-text">Bron</legend>
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="radio"
            name="capture"
            checked={captureMode === "microphone"}
            onChange={() => setCaptureMode("microphone")}
          />
          <span>
            <strong>Microfoon</strong> — lichtste optie
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="radio"
            name="capture"
            checked={captureMode === "tab_audio"}
            onChange={() => setCaptureMode("tab_audio")}
          />
          <span>
            <strong>Tabblad-audio</strong> — Teams/Meet; audio aanvinken
          </span>
        </label>
      </fieldset>

      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-vice-border bg-vice-surface p-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-vice-text-muted">Duur</p>
          <p className="font-mono text-lg text-vice-text">
            {formatDuration(elapsedMs)}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-vice-text-muted">
            Audio (tijdelijk)
          </p>
          <p
            className={`font-mono text-lg ${warnSize ? "text-vice-danger" : "text-vice-text"}`}
          >
            {formatBytes(bytesEstimate)}
          </p>
        </div>
        {tokenCount != null && (
          <div>
            <p className="text-xs uppercase tracking-wide text-vice-text-muted">
              Tokens opgeslagen
            </p>
            <p className="font-mono text-lg text-vice-text">
              {tokenCount} (~{formatBytes(estimateTokenStorageBytes(tokenCount))})
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        {phase === "idle" || phase === "error" || phase === "done" ? (
          <Button type="button" onClick={start} disabled={busy}>
            {phase === "done" ? "Nieuwe opname" : "Start opname"}
          </Button>
        ) : null}
        {phase === "recording" ? (
          <Button type="button" variant="danger" onClick={stop}>
            Stop → transcriptie
          </Button>
        ) : null}
        {phase === "uploading" ? (
          <Button type="button" disabled>
            Uploaden…
          </Button>
        ) : null}
        {phase === "transcribing" ? (
          <Button type="button" disabled>
            Transcriptie &amp; tokenisatie…
          </Button>
        ) : null}
        {(phase === "done" || phase === "error") && (
          <Button type="button" variant="secondary" onClick={reset}>
            Reset
          </Button>
        )}
      </div>

      {phase === "done" && transcriptPreview && (
        <div className="rounded-lg border border-vice-border bg-vice-surface p-4 text-sm">
          <p className="font-medium text-vice-text">Transcript (preview)</p>
          <p className="mt-2 whitespace-pre-wrap text-vice-text-muted">
            {transcriptPreview}
          </p>
          {lastRecordingId && (
            <Link
              href={`/klanten/${tenantId}/meetings/${lastRecordingId}`}
              className="mt-3 inline-block text-vice-gold hover:underline"
            >
              Volledig transcript →
            </Link>
          )}
        </div>
      )}

      {phase === "done" && (
        <p className="text-sm text-green-700" role="status">
          Klaar voor {tenantName}. Meetingdata staat als tekst + tokens (audio verwijderd
          indien geconfigureerd).
        </p>
      )}

      {(error || phase === "error") && error && (
        <p className="text-sm text-vice-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
