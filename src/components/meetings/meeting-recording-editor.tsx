"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deleteMeetingRecordingAction,
  updateMeetingRecordingAction,
} from "@/modules/meetings/actions";

type MeetingRecordingEditorProps = {
  tenantId: string;
  recordingId: string;
  initialTitle: string;
  initialSubject: string;
  initialFullText: string;
  canEditTranscript: boolean;
};

export function MeetingRecordingEditor({
  tenantId,
  recordingId,
  initialTitle,
  initialSubject,
  initialFullText,
  canEditTranscript,
}: MeetingRecordingEditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [subject, setSubject] = useState(initialSubject);
  const [fullText, setFullText] = useState(initialFullText);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const result = await updateMeetingRecordingAction({
      tenantId,
      recordingId,
      values: {
        title,
        subject,
        ...(canEditTranscript ? { fullText } : {}),
      },
    });

    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function onDelete() {
    const ok = window.confirm(
      "Deze meeting permanent verwijderen? Transcript en tokens worden gewist.",
    );
    if (!ok) return;

    setDeleting(true);
    setError(null);
    const result = await deleteMeetingRecordingAction({ tenantId, recordingId });
    setDeleting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(`/klanten/${tenantId}/meetings`);
    router.refresh();
  }

  return (
    <form onSubmit={onSave} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="title">Titel</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="bv. Kick-off Q4"
            maxLength={200}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="subject">Onderwerp</Label>
          <Input
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="bv. Strategie en doelgroep"
            maxLength={500}
          />
        </div>
      </div>

      {canEditTranscript && (
        <div className="space-y-2">
          <Label htmlFor="transcript">Transcript</Label>
          <textarea
            id="transcript"
            className="min-h-[240px] w-full rounded-md border border-vice-border bg-vice-surface px-3 py-2 text-sm text-vice-text"
            value={fullText}
            onChange={(e) => setFullText(e.target.value)}
          />
          <p className="text-xs text-vice-text-muted">
            Bij opslaan worden tokens opnieuw berekend voor latere analyse.
          </p>
        </div>
      )}

      {error && (
        <p className="text-sm text-vice-danger" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={saving || deleting}>
          {saving ? "Opslaan…" : "Opslaan"}
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={saving || deleting}
          onClick={onDelete}
        >
          {deleting ? "Verwijderen…" : "Verwijderen"}
        </Button>
      </div>
    </form>
  );
}
