import { describe, expect, it } from "vitest";
import {
  formatTimelineNotesForAnalysis,
  parseTimelineNotes,
  serializeTimelineNotes,
} from "@/lib/meetings/timeline-notes";

describe("timeline notes", () => {
  it("round-trips structured notes", () => {
    const items = [
      { id: "a", atMs: 125_000, text: "Actie voor klant" },
      { id: "b", atMs: 30_000, text: "Eerste punt" },
    ];
    const raw = serializeTimelineNotes(items);
    const parsed = parseTimelineNotes(raw);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.atMs).toBe(30_000);
    expect(parsed[1]?.text).toBe("Actie voor klant");
  });

  it("parses legacy plain text", () => {
    const parsed = parseTimelineNotes("Oude vrije notitie");
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.text).toBe("Oude vrije notitie");
  });

  it("formats for analysis with timestamps", () => {
    const raw = serializeTimelineNotes([
      { id: "1", atMs: 90_000, text: "Follow-up" },
    ]);
    const out = formatTimelineNotesForAnalysis(raw);
    expect(out).toContain("1:30");
    expect(out).toContain("1 min");
    expect(out).toContain("Follow-up");
  });
});
