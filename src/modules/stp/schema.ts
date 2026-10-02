import { z } from "zod";
import { STP_CLAIMS, STP_CRITERION_KINDS, STP_DIMENSIONS, STP_DISPOSITIONS, STP_RATINGS, STP_STEPS } from "@/lib/stp/constants";
import { zodString } from "@/lib/pestel/zod-form";

const uuid = z.string().uuid();

export const stpVersionSchema = z.object({ versionId: uuid });
export const stpExpectedSchema = stpVersionSchema.extend({ expectedUpdatedAt: z.string().min(4) });

export const stpScopeSchema = z.object({
  versionId: uuid,
  offering: zodString(300),
  geography: zodString(200),
  note: zodString(2000),
  confirm: z.boolean(),
});

export const stpStepSchema = z.object({
  versionId: uuid,
  step: z.enum(["intake", ...STP_STEPS]),
});

export const stpRefSchema = z.object({
  ref_type: zodString(40, 2),
  ref_id: z.string().uuid().nullable(),
  label: zodString(300),
  excerpt: zodString(500),
  slot: zodString(40),
});

export const stpSegmentSchema = z.object({
  versionId: uuid,
  segmentId: uuid.nullable(),
  name: zodString(200, 2),
  description: zodString(2000),
  need: zodString(1000),
  traits: zodString(1000),
  geography: zodString(200),
  triggerText: zodString(500),
  offering: zodString(300),
  includeCriteria: zodString(1000),
  excludeCriteria: zodString(1000),
  assumptions: zodString(1000),
  openQuestion: zodString(1000),
  hypothesis: z.boolean(),
  refs: z.array(stpRefSchema).max(12),
});

export const stpDispositionSchema = z.object({
  segmentId: uuid,
  disposition: z.enum(STP_DISPOSITIONS),
  reason: zodString(500),
});

export const stpMergeSchema = z.object({ keepId: uuid, dropId: uuid });
export const stpSegmentIdSchema = z.object({ segmentId: uuid });

export const stpScoresSchema = z.object({
  segmentId: uuid,
  scores: z.array(z.object({
    dimension: z.enum(STP_DIMENSIONS),
    rating: z.enum(STP_RATINGS),
    note: zodString(500),
    assumption: zodString(500),
  })).max(6),
});

export const stpTargetSchema = z.object({
  versionId: uuid,
  motivation: zodString(2000, 8),
});

export const stpPositionSchema = z.object({
  versionId: uuid,
  audience: zodString(500),
  problem: zodString(1000),
  promise: zodString(1000),
  distinction: zodString(1000),
  evidenceText: zodString(1500),
  sentence: zodString(400),
  claimStatus: z.enum(STP_CLAIMS),
});

export const stpCriterionSchema = z.object({
  kind: z.enum(STP_CRITERION_KINDS),
  body: zodString(400),
});

export const stpIcpSchema = z.object({
  versionId: uuid,
  icpName: zodString(200),
  icpSummary: zodString(1500),
  icpSector: zodString(300),
  icpStage: zodString(300),
  icpSize: zodString(300),
  icpStructure: zodString(300),
  icpTech: zodString(300),
  icpProblem: zodString(800),
  icpNeed: zodString(800),
  icpOutcome: zodString(800),
  icpTrigger: zodString(500),
  icpInaction: zodString(500),
  icpBudget: zodString(300),
  icpCapacity: zodString(300),
  icpConditions: zodString(500),
  icpTiming: zodString(300),
  assumptions: zodString(2000),
  openQuestions: zodString(2000),
  acceptedUncertainty: zodString(1000),
  criteria: z.array(stpCriterionSchema).max(24),
});

export const stpAiSchema = stpExpectedSchema.extend({
  applyNew: z.boolean().optional(),
});

export const stpApplySchema = z.object({
  versionId: uuid,
  kind: z.enum(["position", "icp"]),
});

export const stpResolveSchema = z.object({
  segmentId: uuid,
  accept: z.boolean(),
});
