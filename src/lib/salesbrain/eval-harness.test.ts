import { describe, expect, it } from "vitest";
import { buildEvalHarness } from "@/lib/salesbrain/eval-harness";

describe("eval-harness", () => {
  it("documents baseline comparison cases", () => {
    const { summary, rows } = buildEvalHarness();
    expect(summary.caseCount).toBeGreaterThan(0);
    expect(rows.length).toBe(summary.caseCount);
    expect(rows.every((r) => r.status === "documented")).toBe(true);
  });
});
