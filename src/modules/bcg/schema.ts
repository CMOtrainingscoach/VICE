import { z } from "zod";
import {
  BCG_BASES,
  BCG_EVIDENCE,
  BCG_GROWTH_METHODS,
  BCG_KINDS,
  BCG_OVERLAP_MODES,
  BCG_PERIOD_KINDS,
  BCG_SCALES,
  BCG_SHARE_METHODS,
} from "@/lib/bcg/constants";
import { zodString } from "@/lib/pestel/zod-form";

const uuid = z.string().uuid();
const blank = z.literal("");

export const bcgVersionSchema = z.object({ versionId: uuid });

export const bcgAddItemSchema = z.object({
  versionId: uuid,
  title: zodString(300, 2),
  kind: z.enum(BCG_KINDS),
});

export const bcgDeleteItemSchema = z.object({
  itemId: uuid,
});

export const bcgScopeSchema = z.object({
  versionId: uuid,
  scopeLabel: zodString(200),
  market: zodString(300),
  geography: zodString(200),
  segment: zodString(200),
  period: zodString(120),
  periodKind: z.enum(["", ...BCG_PERIOD_KINDS]),
  basis: z.enum(["", ...BCG_BASES]),
  currency: zodString(12),
  unit: zodString(40),
});

export const bcgThresholdSchema = z.object({
  versionId: uuid,
  growth: zodString(40),
  note: zodString(2000),
  source: zodString(500),
  share: zodString(40),
  confirm: z.boolean(),
});

export const bcgQualitativeSchema = z.object({
  versionId: uuid,
  on: z.boolean(),
  reason: zodString(2000),
});

const refSchema = z.object({
  ref_type: z.enum([
    "tenant_profile",
    "meeting",
    "pestel_insight",
    "pestel_input",
    "porter_scope",
    "porter_force",
    "porter_factor",
    "five_c_item",
    "five_c_synthesis",
    "swot_item",
    "vrio_resource",
    "manual",
  ]),
  ref_id: uuid.nullable(),
  label: zodString(500),
  excerpt: zodString(2000),
  slot: z.enum(["market", "growth", "share", "general"]),
});

export const bcgItemSchema = z.object({
  versionId: uuid,
  itemId: uuid.nullable(),
  expectedUpdatedAt: z.string().nullable(),
  title: zodString(300, 2),
  description: zodString(4000),
  kind: z.enum(BCG_KINDS),
  marketDefinition: zodString(500),
  geography: zodString(200),
  segment: zodString(200),
  periodLabel: zodString(120),
  periodKind: z.enum(["", ...BCG_PERIOD_KINDS]),
  measureBasis: z.enum(["", ...BCG_BASES]),
  currency: zodString(12),
  unitLabel: zodString(40),
  scopeConfirmed: z.boolean(),
  growthMethod: z.enum(BCG_GROWTH_METHODS),
  growthPercent: zodString(40),
  sizePrevious: zodString(40),
  sizeCurrent: zodString(40),
  sizeScale: z.enum(BCG_SCALES),
  growthEvidence: z.union([z.enum(BCG_EVIDENCE), blank]),
  shareMethod: z.enum(BCG_SHARE_METHODS),
  ownShare: zodString(40),
  leaderShare: zodString(40),
  ownAmount: zodString(40),
  leaderAmount: zodString(40),
  amountScale: z.enum(BCG_SCALES),
  clientIsLeader: z.boolean(),
  leaderName: zodString(200),
  shareEvidence: z.union([z.enum(BCG_EVIDENCE), blank]),
  figuresConflict: zodString(1000),
  conflictAccepted: z.boolean(),
  figuresConfirmed: z.boolean(),
  advisorNote: zodString(4000),
  openQuestion: zodString(1000),
  questionStatus: z.enum(["open", "queued_meeting", "answered"]),
  gapReason: zodString(1000),
  refs: z.array(refSchema).max(20),
});

export const bcgSelectionSchema = z.object({
  itemId: uuid,
  selected: z.boolean(),
  reason: zodString(1000),
});

export const bcgOverlapSchema = z.object({
  itemId: uuid,
  mode: z.enum(BCG_OVERLAP_MODES),
  key: zodString(80),
});

export const bcgSplitSchema = z.object({
  itemId: uuid,
  titles: z.array(zodString(300, 2)).min(2).max(6),
});

export const bcgReviewSchema = z.object({
  itemId: uuid,
  reviewed: z.boolean(),
  gap: zodString(1000),
});

export const bcgPrepareSchema = z.object({
  versionId: uuid,
  itemId: uuid.nullable().optional(),
});

export const bcgResolveSchema = z.object({
  itemId: uuid,
  accept: z.boolean(),
});

export const bcgSynthesisSchema = z.object({
  versionId: uuid,
  text: zodString(12000),
  reviewed: z.boolean(),
});

export const bcgPublishSchema = z.object({
  versionId: uuid,
  publishFigures: z.boolean(),
});

export const bcgScopeCreateSchema = z.object({
  label: zodString(200, 2),
});
