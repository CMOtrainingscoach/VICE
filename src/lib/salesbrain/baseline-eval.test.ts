import { describe, expect, it } from "vitest";
import { BASELINE_EVAL_CASES, baselineEvalSummary } from "@/lib/salesbrain/baseline-eval";

describe("salesbrain baseline eval", () => {
  it("defines representative quality cases", () => {
    expect(BASELINE_EVAL_CASES.length).toBeGreaterThanOrEqual(5);
    expect(BASELINE_EVAL_CASES.map((c) => c.id)).toContain("good-1");
  });

  it("summarizes categories", () => {
    const summary = baselineEvalSummary();
    expect(summary.caseCount).toBe(BASELINE_EVAL_CASES.length);
    expect(summary.categories.good_match).toBe(1);
  });
});
