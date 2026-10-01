"use client";

import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  createTimelineNote,
  formatNoteMinutesLabel,
  formatNoteTimestamp,
  type MeetingTimelineNote,
} from "@/lib/meetings/timeline-notes";
import { cn } from "@/lib/utils";

type MeetingTimelineNotesProps = {
  items: MeetingTimelineNote[];
  onChange: (items: MeetingTimelineNote[]) => void;
  /** Current recording position when adding live notes */
  captureAtMs?: number;
  canPost?: boolean;
  disabled?: boolean;
  emptyHint?: string;
  className?: string;
};

export function MeetingTimelineNotes({
  items,
  onChange,
  captureAtMs = 0,
  canPost = true,
  disabled = false,
  emptyHint = "Nog geen notities. Plaats een notitie tijdens de opname — elk bericht krijgt een tijdstip in de recording.",
  className,
}: MeetingTimelineNotesProps) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length]);

  function postNote() {
    const text = draft.trim();
    if (!text || !canPost || disabled) return;
    const note = createTimelineNote(captureAtMs, text);
    onChange([...items, note].sort((a, b) => a.atMs - b.atMs || a.id.localeCompare(b.id)));
    setDraft("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      postNote();
    }
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-vice-border bg-vice-surface",
        className,
      )}
    >
      <div className="border-b border-vice-border px-4 py-3">
        <h2 className="text-sm font-medium text-vice-text">Notities</h2>
        <p className="mt-0.5 text-xs text-vice-text-muted">
          Tijdens de opname — elk bericht wordt gelogd op minuten in de recording.
        </p>
      </div>

      <div
        ref={listRef}
        className="max-h-64 space-y-3 overflow-y-auto px-4 py-4"
        aria-live="polite"
      >
        {items.length === 0 ? (
          <p className="text-sm text-vice-text-muted">{emptyHint}</p>
        ) : (
          items.map((note) => (
            <article key={note.id} className="flex gap-3">
              <div
                className="flex size-9 shrink-0 flex-col items-center justify-center rounded-full bg-vice-surface-muted text-[10px] font-medium leading-tight text-vice-gold"
                title={`${formatNoteTimestamp(note.atMs)} in opname (${formatNoteMinutesLabel(note.atMs)})`}
              >
                <span className="font-mono tabular-nums">{formatNoteTimestamp(note.atMs)}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-vice-text-muted">
                  {formatNoteMinutesLabel(note.atMs)} in opname
                </p>
                <p className="mt-0.5 whitespace-pre-wrap rounded-2xl rounded-tl-md bg-vice-surface-muted/80 px-3 py-2 text-sm text-vice-text">
                  {note.text}
                </p>
              </div>
            </article>
          ))
        )}
      </div>

      <div className="flex gap-2 border-t border-vice-border bg-vice-surface-muted/30 p-3">
        <textarea
          rows={2}
          className="min-h-[44px] flex-1 resize-none rounded-xl border border-vice-border bg-vice-surface px-3 py-2 text-sm text-vice-text placeholder:text-vice-text-muted disabled:opacity-60"
          placeholder={
            canPost
              ? "Schrijf een notitie… (Enter = plaatsen, Shift+Enter = nieuwe regel)"
              : "Start de opname om notities te plaatsen"
          }
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled || !canPost}
          aria-label="Nieuwe notitie"
        />
        <Button
          type="button"
          className="h-auto shrink-0 self-end rounded-xl bg-vice-gold px-3 text-[#1a1814] hover:bg-vice-gold-hover"
          disabled={disabled || !canPost || !draft.trim()}
          onClick={postNote}
          aria-label="Notitie plaatsen"
        >
          <Send className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
