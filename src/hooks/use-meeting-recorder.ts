"use client";

import { useCallback, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  RECORDING_LIMITS,
  pickRecordingMimeType,
} from "@/lib/recording/config";
import {
  completeMeetingRecordingAction,
  failMeetingRecordingAction,
  startMeetingRecordingAction,
  transcribeMeetingRecordingAction,
} from "@/modules/meetings/actions";

export type RecorderPhase =
  | "idle"
  | "recording"
  | "paused"
  | "uploading"
  | "transcribing"
  | "done"
  | "error";

export type CaptureMode = "microphone" | "tab_audio";

type UseMeetingRecorderOptions = {
  tenantId: string;
  captureMode: CaptureMode;
};

export function useMeetingRecorder({
  tenantId,
  captureMode,
}: UseMeetingRecorderOptions) {
  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [bytesEstimate, setBytesEstimate] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [tokenCount, setTokenCount] = useState<number | null>(null);
  const [transcriptPreview, setTranscriptPreview] = useState<string | null>(
    null,
  );
  const [lastRecordingId, setLastRecordingId] = useState<string | null>(null);
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const tickRef = useRef<number | null>(null);
  const recordingIdRef = useRef<string | null>(null);
  const [mimeType, setMimeType] = useState("audio/webm");

  const stopStreams = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLiveStream(null);
    if (tickRef.current != null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const startTick = useCallback(() => {
    if (tickRef.current != null) window.clearInterval(tickRef.current);
    tickRef.current = window.setInterval(() => {
      setElapsedMs(Math.max(0, Date.now() - startedAtRef.current));
      if (Date.now() - startedAtRef.current >= RECORDING_LIMITS.maxDurationMs) {
        setError("Maximumduur bereikt (90 min) — opname gestopt.");
        recorderRef.current?.stop();
      }
    }, 250);
  }, []);

  const stopForLimit = useCallback((reason: string) => {
    setError(reason);
    recorderRef.current?.stop();
  }, []);

  const acquireStream = useCallback(async (): Promise<MediaStream> => {
    if (captureMode === "microphone") {
      return navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: false,
      });
    }

    const display = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });
    display.getVideoTracks().forEach((track) => {
      track.stop();
      display.removeTrack(track);
    });
    if (display.getAudioTracks().length === 0) {
      display.getTracks().forEach((t) => t.stop());
      throw new Error(
        "Geen audiotrack. Kies een tabblad met audio en vink 'Audio delen' aan.",
      );
    }
    return display;
  }, [captureMode]);

  const start = useCallback(async () => {
    setError(null);
    setBytesEstimate(0);
    setElapsedMs(0);
    chunksRef.current = [];
    recordingIdRef.current = null;

    const pickedMime = pickRecordingMimeType();
    setMimeType(pickedMime);

    const started = await startMeetingRecordingAction({
      tenantId,
      captureMode,
      mimeType: pickedMime,
    });
    if (!started.ok || !started.data) {
      setPhase("error");
      setError(started.ok ? "Opname starten mislukt." : started.error);
      return;
    }

    recordingIdRef.current = started.data.recordingId;
    const storagePath = started.data.storagePath;

    try {
      const stream = await acquireStream();
      streamRef.current = stream;
      setLiveStream(stream);

      const recorder = new MediaRecorder(stream, {
        mimeType: pickedMime,
        audioBitsPerSecond: RECORDING_LIMITS.audioBitsPerSecond,
      });
      recorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) {
          chunksRef.current.push(ev.data);
          const total = chunksRef.current.reduce((n, b) => n + b.size, 0);
          setBytesEstimate(total);
          if (total >= RECORDING_LIMITS.maxBytes) {
            stopForLimit("Limiet van 25 MB bereikt — opname gestopt.");
          }
        }
      };

      recorder.onstop = async () => {
        stopStreams();
        const durationMs = Math.max(0, Date.now() - startedAtRef.current);
        setElapsedMs(durationMs);

        const blob = new Blob(chunksRef.current, { type: pickedMime });
        const recordingId = recordingIdRef.current;

        if (!recordingId || blob.size === 0) {
          setPhase("error");
          setError("Geen audiodata opgenomen.");
          if (recordingId) {
            await failMeetingRecordingAction(recordingId);
          }
          return;
        }

        if (blob.size > RECORDING_LIMITS.maxBytes) {
          setPhase("error");
          setError("Bestand te groot voor upload (max. 25 MB).");
          await failMeetingRecordingAction(recordingId);
          return;
        }

        setPhase("uploading");
        const supabase = createClient();
        const { error: uploadError } = await supabase.storage
          .from("meeting-recordings")
          .upload(storagePath, blob, {
            contentType: pickedMime,
            upsert: false,
          });

        if (uploadError) {
          setPhase("error");
          setError(uploadError.message);
          await failMeetingRecordingAction(recordingId);
          return;
        }

        const completed = await completeMeetingRecordingAction({
          tenantId,
          recordingId,
          byteSize: blob.size,
          durationMs,
        });

        if (!completed.ok) {
          setPhase("error");
          setError(completed.error);
          return;
        }

        setLastRecordingId(recordingId);
        setPhase("transcribing");
        const transcribed = await transcribeMeetingRecordingAction({
          tenantId,
          recordingId,
        });

        if (!transcribed.ok || !transcribed.data) {
          setPhase("error");
          setError(
            transcribed.ok ? "Transcriptie mislukt." : transcribed.error,
          );
          return;
        }

        setTokenCount(transcribed.data.tokenCount);
        setTranscriptPreview(transcribed.data.preview);
        setPhase("done");
      };

      recorder.onerror = () => {
        setPhase("error");
        setError("Opname mislukt in de browser.");
        stopStreams();
      };

      startedAtRef.current = Date.now();
      setPhase("recording");
      recorder.start(RECORDING_LIMITS.chunkMs);
      startTick();
    } catch (err) {
      stopStreams();
      setPhase("error");
      setError(err instanceof Error ? err.message : "Microfoon/tabblad niet beschikbaar.");
      if (recordingIdRef.current) {
        await failMeetingRecordingAction(recordingIdRef.current);
      }
    }
  }, [tenantId, captureMode, acquireStream, stopStreams, stopForLimit, startTick]);

  const pause = useCallback(() => {
    const rec = recorderRef.current;
    if (rec?.state === "recording") {
      rec.pause();
      if (tickRef.current != null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
      setPhase("paused");
    }
  }, []);

  const resume = useCallback(() => {
    const rec = recorderRef.current;
    if (rec?.state === "paused") {
      rec.resume();
      setPhase("recording");
      startTick();
    }
  }, [startTick]);

  const stop = useCallback(() => {
    if (
      recorderRef.current?.state === "recording" ||
      recorderRef.current?.state === "paused"
    ) {
      recorderRef.current.stop();
    }
  }, []);

  const reset = useCallback(() => {
    stopStreams();
    recorderRef.current = null;
    chunksRef.current = [];
    recordingIdRef.current = null;
    setPhase("idle");
    setError(null);
    setBytesEstimate(0);
    setElapsedMs(0);
    setTokenCount(null);
    setTranscriptPreview(null);
    setLastRecordingId(null);
  }, [stopStreams]);

  return {
    phase,
    error,
    bytesEstimate,
    elapsedMs,
    tokenCount,
    transcriptPreview,
    lastRecordingId,
    liveStream,
    mimeType,
    start,
    pause,
    resume,
    stop,
    reset,
  };
}
