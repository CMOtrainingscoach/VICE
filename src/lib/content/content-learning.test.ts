import { describe, expect, it } from "vitest";
import {
  buildDiffSummary,
  buildLearningDedupeKey,
  meaningfulTextDiff,
  snapshotToComparableText,
} from "@/lib/content/content-learning";

describe("content-learning", () => {
  it("detects meaningful edits", () => {
    const baseline = "Dit is een korte intro over marketing voor KMO in België.";
    const final =
      "Dit is een warme, directe intro over marketing voor kmo in Vlaanderen — zonder jargon.";
    expect(meaningfulTextDiff(baseline, final)).toBe(true);
  });

  it("ignores trivial typo-level changes", () => {
    const a = "Een zin over fractional CMO diensten voor middelgrote bedrijven in België.";
    const b = "Een zin over fractional CMO diensten voor middelgrote bedrijven in Belgie.";
    expect(meaningfulTextDiff(a, b)).toBe(false);
  });

  it("builds stable dedupe keys", () => {
    const keyA = buildLearningDedupeKey({
      contentKind: "blog",
      conceptId: "abc",
      baseline: { title: "T", bodyPlain: "Body" },
      final: { title: "T2", bodyPlain: "Body2" },
    });
    const keyB = buildLearningDedupeKey({
      contentKind: "blog",
      conceptId: "abc",
      baseline: { title: "T", bodyPlain: "Body" },
      final: { title: "T2", bodyPlain: "Body2" },
    });
    expect(keyA).toBe(keyB);
  });

  it("summarizes diffs", () => {
    const summary = buildDiffSummary("alpha beta gamma", "alpha BETA gamma delta");
    expect(summary.length).toBeGreaterThan(0);
  });

  it("flattens social snapshots", () => {
    const text = snapshotToComparableText("social", { caption: "Hello", hashtags: "#vice" });
    expect(text).toContain("Hello");
    expect(text).toContain("#vice");
  });
});
