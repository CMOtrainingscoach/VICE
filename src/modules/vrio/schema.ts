import { z } from "zod";
import { VRIO_CRITERIA } from "@/lib/vrio/constants";
import { zodString } from "@/lib/pestel/zod-form";

const uuid = z.string().uuid();

export const vrioResourceSchema = z.object({
  versionId: uuid,
  resourceId: uuid.nullable(),
  title: zodString(300, 2),
  description: zodString(4000),
  kind: z.enum(["resource", "competence"]),
  evidenceLevel: z.enum(["provided", "observed", "hypothesis"]),
  origin: z.enum(["swot", "ai", "manual"]).optional(),
  swotItemId: uuid.nullable().optional(),
  partnerOwned: z.boolean().optional(),
  accessNote: zodString(2000).optional(),
  marketContext: zodString(500).optional(),
  refKeys: z.array(zodString(200, 3)).max(30).optional(),
});

export const vrioSelectionSchema = z.object({
  resourceId: uuid,
  selected: z.boolean(),
  reason: zodString(1000),
});

export const vrioResourceIdSchema = z.object({
  resourceId: uuid,
});

export const vrioMergeSchema = z.object({
  targetId: uuid,
  sourceIds: z.array(uuid).min(1).max(10),
  title: zodString(300),
});

export const vrioSplitSchema = z.object({
  resourceId: uuid,
  parts: z
    .array(
      z.object({
        title: zodString(300, 2),
        description: zodString(4000),
        kind: z.enum(["resource", "competence"]).optional(),
      }),
    )
    .min(2)
    .max(6),
});

export const vrioAssessmentSchema = z.object({
  versionId: uuid,
  assessmentId: uuid,
  answer: z.enum(["yes", "no", "unknown", "not_assessed"]),
  motivation: zodString(4000),
  evidenceLevel: z.enum(["provided", "observed", "hypothesis"]),
  advisorNote: zodString(2000),
  openQuestion: zodString(1000),
  skippedReason: zodString(1000),
  refKeys: z.array(zodString(200, 3)).max(30),
  confirm: z.boolean(),
});

export const vrioQuestionSchema = z.object({
  assessmentId: uuid,
  status: z.enum(["open", "answered", "queued_meeting", "accepted_open"]),
  answer: zodString(4000),
});

export const vrioResourceReviewSchema = z.object({
  resourceId: uuid,
  reviewed: z.boolean(),
  revisionNote: zodString(1000),
});

export const vrioAiProposalSchema = z.object({
  assessmentId: uuid,
  accept: z.boolean(),
});

export const vrioPrepareSchema = z.object({
  versionId: uuid,
  resourceIds: z.array(uuid).max(50).optional(),
});

export const vrioSynthesisSchema = z.object({
  versionId: uuid,
  synthesisText: zodString(12000),
  priorities: z
    .array(
      z.object({
        resource_id: uuid.optional(),
        action: z.enum(["protect", "organize", "substantiate", "reconsider"]),
        note: zodString(1000),
      }),
    )
    .max(50)
    .optional(),
  reviewed: z.boolean(),
});

export const vrioVersionSchema = z.object({
  versionId: uuid,
});

export const vrioApproveSchema = z.object({
  versionId: uuid,
  expectedUpdatedAt: z.string().min(10),
});

export const VRIO_CRITERION_ENUM = z.enum(VRIO_CRITERIA);
