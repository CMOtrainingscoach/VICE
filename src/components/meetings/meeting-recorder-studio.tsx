"use client";

import {
  Info,
  Mic,
  Monitor,
  Pause,
  ShieldCheck,
  Square,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAudioAnalyser } from "@/hooks/use-audio-analyser";
import {
  type CaptureMode,
  useMeetingRecorder,
} from "@/hooks/use-meeting-recorder";
import { formatRecorderTimer } from "@/lib/recording/format-timer";
import { cn } from "@/lib/utils";
import { updateMeetingRecordingAction } from "@/modules/meetings/actions";

type MeetingRecorderStudioProps = {
  tenantId: string;
  tenantName: string;
};

function LevelMeter({ level, active }: { level: number; active: boolean }) {
  const bars = 12;
  const lit = Math.round(level * bars);
  return (
    <div className="flex gap-0.5" aria-hidden>
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "h-4 w-1 rounded-sm",
            active && i < lit ? "bg-vice-gold" : "bg-vice-border",
          )}
        />
      ))}
    </div>
  );
}

function Waveform({ samples, live }: { samples: number[]; live: boolean }) {
  return (
    <div
      className="flex h-16 items-end justify-center gap-[3px] px-2"
      aria-hidden
    >
      {samples.map((h, i) => (
        <span
          key={i}
          className={cn(
            "w-[3px] rounded-full transition-[height] duration-75",
            live && i < samples.length / 2 ? "bg-vice-gold" : "bg-vice-border",
          )}
          style={{ height: `${Math.max(8, h * 56)}px` }}
        />
      ))}
    </div>
  );
}

export function MeetingRecorderStudio({
  tenantId,
  tenantName,
}: MeetingRecorderStudioProps) {
  const router = useRouter();
  const redirectedRef = useRef(false);
  const [captureMode, setCaptureMode] = useState<CaptureMode>("tab_audio");
  const [meetingTitle, setMeetingTitle] = useState("Kennismaking");
  const [meetingSubject, setMeetingSubject] = useState("Online meeting");
  const [notes, setNotes] = useState("");
  const [participantsInformed, setParticipantsInformed] = useState(false);

  const {
    phase,
    error,
    elapsedMs,
    tokenCount,
    transcriptPreview,
    lastRecordingId,
    liveStream,
    start,
    pause,
    resume,
    stop,
    reset,
  } = useMeetingRecorder({ tenantId, captureMode });

  const analyserActive =
    phase === "recording" || phase === "paused";
  const { levels, waveform } = useAudioAnalyser(liveStream, analyserActive);

  const micActive = captureMode === "microphone" || captureMode === "tab_audio";
  const tabActive = captureMode === "tab_audio";

  useEffect(() => {
    if (phase !== "done" || !lastRecordingId || redirectedRef.current) return;
    redirectedRef.current = true;
    void (async () => {
      await updateMeetingRecordingAction({
        tenantId,
        recordingId: lastRecordingId,
        values: {
          title: meetingTitle,
          subject: meetingSubject,
          notes,
        },
      });
      router.push(`/klanten/${tenantId}/meetings/${lastRecordingId}`);
      router.refresh();
    })();
  }, [
    phase,
    lastRecordingId,
    tenantId,
    meetingTitle,
    meetingSubject,
    notes,
    router,
  ]);

  const isLive = phase === "recording" || phase === "paused";
  const busy = phase === "uploading" || phase === "transcribing";

  async function handleStart() {
    if (!participantsInformed) return;
    await start();
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-vice-text-muted">
            Klanten / {tenantName}
          </p>
          {phase === "idle" || phase === "error" || phase === "done" ? (
            <input
              className="mt-2 block w-full max-w-md border-0 bg-transparent p-0 text-3xl font-semibold text-vice-text outline-none focus:ring-0"
              value={meetingTitle}
              onChange={(e) => setMeetingTitle(e.target.value)}
              aria-label="Meetingtitel"
            />
          ) : (
            <h1 className="mt-2 text-3xl font-semibold text-vice-text">
              {meetingTitle}
            </h1>
          )}
          {(phase === "idle" || phase === "error" || phase === "done") ? (
            <input
              className="mt-1 block w-full max-w-md border-0 bg-transparent p-0 text-sm text-vice-text-muted outline-none"
              value={meetingSubject}
              onChange={(e) => setMeetingSubject(e.target.value)}
              aria-label="Meetingonderwerp"
            />
          ) : (
            <p className="mt-1 text-sm text-vice-text-muted">
              {tenantName} · {meetingSubject}
            </p>
          )}
        </div>
        <p className="flex items-center gap-1.5 text-xs text-vice-text-muted">
          <Info className="size-3.5 shrink-0" aria-hidden />
          Interne werkruimte
        </p>
      </header>

      {(phase === "idle" || phase === "error" || phase === "done") && (
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="src"
              checked={captureMode === "microphone"}
              onChange={() => setCaptureMode("microphone")}
            />
            Alleen microfoon
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="src"
              checked={captureMode === "tab_audio"}
              onChange={() => setCaptureMode("tab_audio")}
            />
            Tabblad-audio (Teams/Meet)
          </label>
        </div>
      )}

      <div className="rounded-2xl border border-vice-border bg-vice-surface p-6 shadow-sm md:p-8">
        <div className="flex items-center gap-2 text-sm">
          {phase === "recording" && (
            <>
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-60" />
                <span className="relative inline-flex size-2.5 rounded-full bg-red-600" />
              </span>
              <span className="font-medium text-vice-text">Opname loopt</span>
            </>
          )}
          {phase === "paused" && (
            <>
              <span className="size-2.5 rounded-full bg-vice-gold" />
              <span className="font-medium text-vice-text">Gepauzeerd</span>
            </>
          )}
          {phase === "uploading" && (
            <span className="text-vice-text-muted">Uploaden…</span>
          )}
          {phase === "transcribing" && (
            <span className="text-vice-text-muted">Transcriptie…</span>
          )}
          {phase === "done" && (
            <span className="font-medium text-green-700">Opname verwerkt</span>
          )}
          {phase === "idle" && (
            <span className="text-vice-text-muted">Klaar om te starten</span>
          )}
        </div>

        <p
          className="mt-6 text-center font-mono text-5xl font-medium tabular-nums tracking-tight text-vice-text md:text-6xl"
          aria-live="polite"
        >
          {formatRecorderTimer(elapsedMs)}
        </p>

        <div className="mt-6 rounded-xl bg-vice-surface-muted/60 px-2 py-4">
          <Waveform samples={waveform} live={phase === "recording"} />
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div
            className={cn(
              "rounded-xl border px-4 py-3",
              micActive && isLive
                ? "border-vice-gold/40 bg-vice-surface-muted/50"
                : "border-vice-border bg-vice-surface-muted/30 opacity-70",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-medium text-vice-text">
                <Mic className="size-4" aria-hidden />
                Microfoon
              </span>
              <span className="text-xs text-vice-text-muted">
                {micActive && isLive ? "actief" : "—"}
              </span>
            </div>
            <div className="mt-3">
              <LevelMeter
                level={micActive && isLive ? levels.mic : 0}
                active={micActive && isLive}
              />
            </div>
          </div>
          <div
            className={cn(
              "rounded-xl border px-4 py-3",
              tabActive && isLive
                ? "border-vice-gold/40 bg-vice-surface-muted/50"
                : "border-vice-border bg-vice-surface-muted/30 opacity-70",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-medium text-vice-text">
                <Monitor className="size-4" aria-hidden />
                Tabaudio
              </span>
              <span className="text-xs text-vice-text-muted">
                {tabActive && isLive ? "actief" : "—"}
              </span>
            </div>
            <div className="mt-3">
              <LevelMeter
                level={tabActive && isLive ? levels.tab : 0}
                active={tabActive && isLive}
              />
            </div>
          </div>
        </div>

        <label className="mt-6 flex cursor-pointer items-start gap-2 text-sm text-vice-text-muted">
          <input
            type="checkbox"
            className="mt-1"
            checked={participantsInformed}
            onChange={(e) => setParticipantsInformed(e.target.checked)}
            disabled={isLive || busy}
          />
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-vice-gold" aria-hidden />
          <span>Deelnemers zijn geïnformeerd</span>
        </label>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          {phase === "recording" && (
            <Button
              type="button"
              variant="secondary"
              className="h-12 flex-1 rounded-xl text-base"
              onClick={pause}
            >
              <Pause className="size-4" aria-hidden />
              Pauzeren
            </Button>
          )}
          {phase === "paused" && (
            <Button
              type="button"
              variant="secondary"
              className="h-12 flex-1 rounded-xl text-base"
              onClick={resume}
            >
              Hervatten
            </Button>
          )}
          {(phase === "idle" || phase === "error" || phase === "done") && (
            <Button
              type="button"
              className="h-12 flex-1 rounded-xl bg-vice-gold text-base text-[#1a1814] hover:bg-vice-gold-hover"
              disabled={!participantsInformed || busy}
              onClick={phase === "done" ? reset : handleStart}
            >
              {phase === "done" ? "Nieuwe opname" : "Start opname"}
            </Button>
          )}
          {(phase === "recording" || phase === "paused") && (
            <Button
              type="button"
              className="h-12 flex-1 rounded-xl bg-vice-gold text-base font-medium text-[#1a1814] hover:bg-vice-gold-hover"
              onClick={stop}
            >
              <Square className="size-3.5 fill-current" aria-hidden />
              Stop opname
            </Button>
          )}
          {(phase === "uploading" || phase === "transcribing") && (
            <Button type="button" disabled className="h-12 flex-1 rounded-xl">
              Even geduld…
            </Button>
          )}
        </div>
      </div>

      <div>
        <textarea
          className="min-h-[88px] w-full resize-y rounded-xl border border-vice-border bg-vice-surface px-4 py-3 text-sm text-vice-text placeholder:text-vice-text-muted"
          placeholder="Notitie toevoegen…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={busy}
        />
        <p className="mt-4 text-center text-xs text-vice-text-muted">
          Na afloop: transcript, samenvatting en voorgestelde taken.
          {tokenCount != null && (
            <span className="block mt-1">{tokenCount} tokens opgeslagen.</span>
          )}
        </p>
      </div>

      {phase === "done" && (
        <p className="text-sm text-vice-text-muted" role="status">
          Doorverwijzen naar review…
        </p>
      )}

      {error && (
        <p className="text-sm text-vice-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
