"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  analysisStatusLabel,
  reviewStatusLabel,
} from "@/lib/meetings/status-labels";
import { MeetingTimelineNotes } from "@/components/meetings/meeting-timeline-notes";
import {
  parseTimelineNotes,
  serializeTimelineNotes,
  type MeetingTimelineNote,
} from "@/lib/meetings/timeline-notes";
import {
  approveMeetingTranscriptAction,
  generateMeetingAnalysisAction,
  updateMeetingRecordingAction,
} from "@/modules/meetings/actions";

type ActionItem = { text: string; done?: boolean };

type MeetingReviewWorkspaceProps = {
  tenantId: string;
  recordingId: string;
  initialTitle: string;
  initialSubject: string;
  initialNotes: string;
  initialFullText: string;
  reviewStatus: string;
  analysisStatus: string;
  summaryText: string | null;
  actionItems: ActionItem[];
  canEditTranscript: boolean;
};

export function MeetingReviewWorkspace({
  tenantId,
  recordingId,
  initialTitle,
  initialSubject,
  initialNotes,
  initialFullText,
  reviewStatus,
  analysisStatus,
  summaryText,
  actionItems: initialActionItems,
  canEditTranscript,
}: MeetingReviewWorkspaceProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [subject, setSubject] = useState(initialSubject);
  const [timelineNotes, setTimelineNotes] = useState<MeetingTimelineNote[]>(() =>
    parseTimelineNotes(initialNotes),
  );
  const [fullText, setFullText] = useState(initialFullText);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function saveMeta() {
    setBusy("save");
    setError(null);
    const result = await updateMeetingRecordingAction({
      tenantId,
      recordingId,
      values: {
        title,
        subject,
        notes: serializeTimelineNotes(timelineNotes),
        ...(canEditTranscript ? { fullText } : {}),
      },
    });
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function approve() {
    setBusy("approve");
    setError(null);
    const result = await approveMeetingTranscriptAction({ tenantId, recordingId });
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function runAnalysis() {
    setBusy("analysis");
    setError(null);
    const result = await generateMeetingAnalysisAction({ tenantId, recordingId });
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-vice-border px-3 py-1 text-vice-text-muted">
          Review: {reviewStatusLabel(reviewStatus)}
        </span>
        <span className="rounded-full border border-vice-border px-3 py-1 text-vice-text-muted">
          Analyse: {analysisStatusLabel(analysisStatus)}
        </span>
      </div>

      <section className="space-y-4 rounded-xl border border-vice-border bg-vice-surface p-6">
        <h2 className="text-lg font-medium">Gegevens</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="title">Titel</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="subject">Onderwerp</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
        </div>
        <Button type="button" disabled={busy !== null} onClick={saveMeta}>
          {busy === "save" ? "Opslaan…" : "Opslaan"}
        </Button>
      </section>

      <MeetingTimelineNotes
        items={timelineNotes}
        onChange={setTimelineNotes}
        canPost={false}
        disabled={busy !== null}
        emptyHint="Geen notities tijdens deze opname."
      />

      <section className="space-y-4 rounded-xl border border-vice-border bg-vice-surface p-6">
        <h2 className="text-lg font-medium">Transcript review</h2>
        {canEditTranscript ? (
          <textarea
            className="min-h-[200px] w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm"
            value={fullText}
            onChange={(e) => setFullText(e.target.value)}
          />
        ) : (
          <p className="text-sm text-vice-text-muted">Transcript nog niet beschikbaar.</p>
        )}
        {reviewStatus !== "approved" && canEditTranscript && (
          <Button
            type="button"
            className="bg-vice-gold text-[#1a1814] hover:bg-vice-gold-hover"
            disabled={busy !== null}
            onClick={approve}
          >
            {busy === "approve" ? "Bezig…" : "Goedkeuren voor analyse"}
          </Button>
        )}
      </section>

      <section className="space-y-4 rounded-xl border border-vice-border bg-vice-surface p-6">
        <h2 className="text-lg font-medium">Analyse</h2>
        {analysisStatus === "ready" && summaryText ? (
          <>
            <p className="whitespace-pre-wrap text-sm text-vice-text">{summaryText}</p>
            {initialActionItems.length > 0 && (
              <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-vice-text">
                {initialActionItems.map((item, i) => (
                  <li key={i}>{item.text}</li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="text-sm text-vice-text-muted">
            {reviewStatus !== "approved"
              ? "Keur eerst het transcript goed. Daarna genereer je samenvatting en actiepunten (demo OpenAI)."
              : "Nog geen analyse. Start wanneer je klaar bent."}
          </p>
        )}
        {reviewStatus === "approved" && (
          <Button
            type="button"
            variant="secondary"
            disabled={busy !== null || analysisStatus === "pending"}
            onClick={runAnalysis}
          >
            {busy === "analysis" || analysisStatus === "pending"
              ? "Analyse bezig…"
              : analysisStatus === "ready"
                ? "Analyse opnieuw genereren"
                : "Genereer samenvatting & actiepunten"}
          </Button>
        )}
      </section>

      {error && (
        <p className="text-sm text-vice-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
