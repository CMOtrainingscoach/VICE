import { z } from "zod";
import { zodString } from "@/lib/pestel/zod-form";
import {
  VC_BUSINESS_TYPES,
  VC_CATEGORIES,
  VC_EFFECTS,
  VC_EXECUTION,
  VC_TIME_BASIS,
} from "@/lib/value-chain/constants";

export const vcChainSchema = z.object({
  chainId: z.string().uuid(),
  offering: zodString(200, 2),
  businessType: z.enum(VC_BUSINESS_TYPES),
  market: zodString(200),
  periodLabel: zodString(120),
  goal: zodString(500),
});

export const vcActivitySchema = z.object({
  chainId: z.string().uuid(),
  activityId: z.string().uuid().nullable(),
  expectedUpdatedAt: z.string().nullable(),
  name: zodString(160, 2),
  category: z.enum(VC_CATEGORIES),
  description: zodString(4000),
  inputsText: zodString(2000),
  outputsText: zodString(2000),
  customerValue: zodString(2000),
  capabilitiesNote: zodString(2000),
  ownerName: zodString(160),
  execution: z.enum(VC_EXECUTION),
  timeValue: zodString(40),
  timeUnit: zodString(40),
  timeScope: zodString(160),
  timeBasis: z.enum(VC_TIME_BASIS),
  timeSource: zodString(240),
  observation: zodString(2000),
  explanation: zodString(2000),
  improvement: zodString(2000),
  effect: z.enum(VC_EFFECTS),
  motivation: zodString(1000),
  openQuestion: zodString(500),
  questionStatus: z.enum(["open", "answered", "queued_meeting", "accepted_open"]),
  questionAnswer: zodString(2000),
  advisorNote: zodString(2000),
  evidenceLevel: z.enum(["provided", "observed", "hypothesis"]),
  refKeys: z.array(z.string().max(80)).max(40),
  subactivities: z.array(zodString(160)).max(20),
});

export const vcActivityIdSchema = z.object({
  activityId: z.string().uuid(),
  detach: z.boolean().optional(),
  applicable: z.boolean().optional(),
  reason: zodString(500).optional(),
  reviewed: z.boolean().optional(),
});

export const vcMergeSchema = z.object({
  targetId: z.string().uuid(),
  sourceId: z.string().uuid(),
});

export const vcDependencySchema = z.object({
  activityId: z.string().uuid(),
  dependencyId: z.string().uuid().nullable(),
  toActivityId: z.string().uuid().nullable(),
  vrioResourceId: z.string().uuid().nullable(),
  partnerLabel: zodString(200),
  kind: zodString(40),
  description: zodString(1000),
  evidenceLevel: z.enum(["provided", "observed", "hypothesis"]),
});

export const vcPrepareSchema = z.object({
  chainId: z.string().uuid(),
  activityId: z.string().uuid().nullable().optional(),
});

export const vcResolveSchema = z.object({
  activityId: z.string().uuid(),
  accept: z.boolean(),
});

export const vcSynthesisSchema = z.object({
  versionId: z.string().uuid(),
  synthesisText: zodString(8000),
  synthesisPublic: zodString(8000),
  reviewed: z.boolean(),
});

export const vcActionSchema = z.object({
  versionId: z.string().uuid(),
  actionId: z.string().uuid().nullable(),
  activityId: z.string().uuid().nullable(),
  title: zodString(200, 3),
  problem: zodString(1000),
  expectedOutcome: zodString(1000),
  ownerName: zodString(160),
  evaluation: zodString(500),
  deadline: zodString(40),
  status: z.enum(["proposed", "confirmed", "dismissed"]),
});

export const vcImportSchema = z.object({
  versionId: z.string().uuid(),
  chainId: z.string().uuid(),
  fileKind: z.enum(["xlsx", "csv", "pdf", "pasted"]),
  fileName: zodString(240),
  entityLabel: zodString(200, 2),
  periodLabel: zodString(120, 2),
  currency: zodString(8, 3),
  scale: z.enum(["units", "thousands", "millions"]),
  figureType: z.enum(["actual", "budget", "forecast"]),
  scopeLevel: z.enum(["company", "department", "product_group", "service"]),
  decimal: z.enum(["comma", "point", "auto"]),
  descriptionColumn: z.number().int().min(0).max(40),
  amountColumn: z.number().int().min(0).max(40),
  codeColumn: z.number().int().min(0).max(40).nullable(),
  csvText: zodString(500_000, 1),
});

export const vcLineSchema = z.object({
  lineId: z.string().uuid(),
  description: zodString(400),
  amount: zodString(40),
  inScope: z.boolean(),
  outReason: zodString(300),
  isRevenue: z.boolean(),
  status: z.enum(["proposed", "confirmed", "excluded", "uncertain"]),
  kind: z.enum(["detail", "subtotal", "total"]),
});

export const vcAllocationSchema = z.object({
  lineId: z.string().uuid(),
  activityId: z.string().uuid(),
  amount: zodString(40, 1),
  method: zodString(40),
  motivation: zodString(1000),
  formula: zodString(2000),
  confirm: z.boolean(),
});

export const vcCostRateSchema = z.object({
  versionId: z.string().uuid(),
  rate: zodString(40),
  currency: zodString(8),
  unit: zodString(40),
  confirmed: z.boolean(),
});

export const vcFinanceFlagsSchema = z.object({
  versionId: z.string().uuid(),
  deferred: z.boolean(),
  publish: z.boolean(),
});

export const vcApproveSchema = z.object({
  versionId: z.string().uuid(),
  expectedUpdatedAt: z.string().min(10),
});

export const vcVersionSchema = z.object({
  versionId: z.string().uuid(),
});
