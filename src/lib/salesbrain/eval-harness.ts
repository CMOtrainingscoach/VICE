import { BASELINE_EVAL_CASES, baselineEvalSummary } from "@/lib/salesbrain/baseline-eval";

export type EvalHarnessRow = {
  caseId: string;
  label: string;
  legacyRisk: string;
  salesbrainExpectation: string;
  status: "documented";
};

/** Static harness for Phase 4 quality comparison — extend with automated runs when fixtures exist. */
export function buildEvalHarness(): { summary: ReturnType<typeof baselineEvalSummary>; rows: EvalHarnessRow[] } {
  return {
    summary: baselineEvalSummary(),
    rows: BASELINE_EVAL_CASES.map((c) => ({
      caseId: c.id,
      label: c.label,
      legacyRisk: c.legacyRisk,
      salesbrainExpectation: c.salesbrainExpectation,
      status: "documented" as const,
    })),
  };
}
