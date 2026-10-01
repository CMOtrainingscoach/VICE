export type MeetingTimelineNote = {
  id: string;
  atMs: number;
  text: string;
};

type StoredTimelineNotes = {
  v: 1;
  items: MeetingTimelineNote[];
};

const MAX_NOTE_LENGTH = 2_000;
const MAX_ITEMS = 200;

export function formatNoteTimestamp(atMs: number): string {
  const totalSec = Math.max(0, Math.floor(atMs / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h > 0) {
    return `${h}:${String(mm).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${mm}:${String(s).padStart(2, "0")}`;
}

export function formatNoteMinutesLabel(atMs: number): string {
  const minutes = Math.floor(Math.max(0, atMs) / 60_000);
  if (minutes === 0) return "start";
  return `${minutes} min`;
}

export function parseTimelineNotes(raw: string | null | undefined): MeetingTimelineNote[] {
  const trimmed = raw?.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed) as StoredTimelineNotes;
    if (parsed?.v === 1 && Array.isArray(parsed.items)) {
      return parsed.items
        .filter(
          (item): item is MeetingTimelineNote =>
            typeof item?.id === "string" &&
            typeof item?.atMs === "number" &&
            typeof item?.text === "string" &&
            item.text.trim().length > 0,
        )
        .map((item) => ({
          id: item.id,
          atMs: Math.max(0, Math.floor(item.atMs)),
          text: item.text.trim().slice(0, MAX_NOTE_LENGTH),
        }))
        .sort((a, b) => a.atMs - b.atMs || a.id.localeCompare(b.id));
    }
  } catch {
    // legacy plain-text notes
  }

  return [
    {
      id: "legacy",
      atMs: 0,
      text: trimmed.slice(0, MAX_NOTE_LENGTH),
    },
  ];
}

export function serializeTimelineNotes(items: MeetingTimelineNote[]): string {
  const normalized = items
    .map((item) => ({
      id: item.id,
      atMs: Math.max(0, Math.floor(item.atMs)),
      text: item.text.trim().slice(0, MAX_NOTE_LENGTH),
    }))
    .filter((item) => item.text.length > 0)
    .slice(0, MAX_ITEMS);

  if (normalized.length === 0) return "";

  const payload: StoredTimelineNotes = { v: 1, items: normalized };
  return JSON.stringify(payload);
}

export function formatTimelineNotesForAnalysis(raw: string | null | undefined): string {
  const items = parseTimelineNotes(raw);
  if (items.length === 0) return "";

  return items
    .map(
      (n) =>
        `[${formatNoteTimestamp(n.atMs)} / ${formatNoteMinutesLabel(n.atMs)}] ${n.text}`,
    )
    .join("\n");
}

export function createTimelineNote(atMs: number, text: string): MeetingTimelineNote {
  return {
    id: crypto.randomUUID(),
    atMs: Math.max(0, Math.floor(atMs)),
    text: text.trim().slice(0, MAX_NOTE_LENGTH),
  };
}
