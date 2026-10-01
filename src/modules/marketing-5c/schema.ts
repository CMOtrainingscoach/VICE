import { z } from "zod";
import { FIVE_C_KEYS } from "@/lib/marketing-5c/constants";
import { zodString } from "@/lib/pestel/zod-form";

const cKey = z.enum(FIVE_C_KEYS);
const uuid = z.string().uuid();

export const fiveCItemSchema = z.object({
  versionId: uuid,
  itemId: uuid.nullable(),
  cKey,
  title: zodString(300, 1),
  finding: zodString(6000),
  clientRelevance: zodString(3000),
  contentType: z.enum(["adopted", "derived", "input_needed"]),
  evidenceLevel: z.enum(["provided", "observed", "hypothesis"]),
  qualifier: zodString(100),
  advisorNote: zodString(4000),
  openQuestion: zodString(1000),
  gapReason: zodString(1000),
  refKeys: z.array(zodString(200, 3)).max(30),
  markReviewed: z.boolean(),
});

export const fiveCItemReviewSchema = z.object({
  itemId: uuid,
  status: z.enum(["pending", "reviewed", "rejected"]),
  reason: zodString(1000),
});

export const fiveCGapSchema = z.object({
  itemId: uuid,
  gapStatus: z.enum(["open", "answered", "queued_meeting", "accepted_open"]),
  gapAnswer: zodString(4000),
});

export const fiveCSectionReviewSchema = z.object({
  sectionId: uuid,
  reviewed: z.boolean(),
  gapsAccepted: z.boolean(),
  gapsNote: zodString(2000),
  summary: zodString(2000).nullable(),
});

export const fiveCSynthesisSchema = z.object({
  versionId: uuid,
  synthesisText: zodString(12000),
  reviewed: z.boolean(),
});

export const fiveCExcludedInputsSchema = z.object({
  versionId: uuid,
  keys: z.array(zodString(200, 3)).max(500),
});

export const fiveCContradictionSchema = z.object({
  contradictionId: uuid,
  resolution: z.enum(["open", "clarified", "a_outdated", "b_outdated"]),
  note: zodString(2000),
});

export const fiveCUpstreamRequestSchema = z.object({
  versionId: uuid,
  target: z.enum(["pestel", "porter"]),
  cKey: cKey.nullable(),
  note: zodString(2000, 5),
});

export const fiveCComposeSchema = z.object({
  versionId: uuid,
  cKeys: z.array(cKey).min(1).max(5).optional(),
});

export const fiveCVersionSchema = z.object({
  versionId: uuid,
});

export const fiveCApproveSchema = z.object({
  versionId: uuid,
  expectedUpdatedAt: z.string().min(10),
});
