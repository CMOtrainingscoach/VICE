import { exampleFirstMarketerFormSchema, exampleFirstMarketerWorkflow } from "@/lib/salesbrain/graph/example-first-marketer";
import type { SbRunDetail, SbRunSummary, SbWorkflowSummary } from "@/lib/salesbrain/types";

export const SALESBRAIN_FIXTURE_BANNER =
  "Demogegevens — geen live workflow. Zet SALESBRAIN_FIXTURES uit en pas migratie 36400 toe.";

const WF_ID = "00000000-0000-4000-8000-000000000010";
const RUN_ID = "00000000-0000-4000-8000-000000000011";

export function fixtureWorkflows(): SbWorkflowSummary[] {
  return [
    {
      id: WF_ID,
      name: "Eerste marketeer — groeisignalen",
      status: "published",
      purpose: "Bedrijven die hun eerste marketeer zoeken",
      updatedAt: new Date().toISOString(),
      publishedVersionId: "00000000-0000-4000-8000-000000000012",
      lastTestAt: null,
    },
  ];
}

export function fixtureRuns(): SbRunSummary[] {
  return [
    {
      id: RUN_ID,
      name: "Bedrijven met groeisignalen",
      workflowName: "Eerste marketeer — groeisignalen",
      status: "completed",
      isTest: false,
      prospectCount: 2,
      insightCount: 0,
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
}

export function fixtureRunDetail(runId: string): SbRunDetail | null {
  if (runId !== RUN_ID) return null;
  const s = fixtureRuns()[0];
  return {
    ...s,
    progress: { phase: "done", message: "Demo voltooid", qualified: 2 },
    errorMessage: null,
    inputs: { goalText: "Bedrijven die hun eerste marketeer zoeken" },
    workflowVersionId: "00000000-0000-4000-8000-000000000012",
  };
}

export function fixtureGraphJson() {
  return exampleFirstMarketerWorkflow();
}

export function fixtureFormSchema() {
  return exampleFirstMarketerFormSchema();
}
