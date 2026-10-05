import { z } from "zod";
import {
  BRAND_STEPS,
  EVIDENCE_STATUSES,
  JUDGEMENTS,
  MATERIAL_TYPES,
  PAGE_ROLES,
  PRIORITY_KINDS,
} from "@/lib/brand/constants";
import { zodString } from "@/lib/pestel/zod-form";

const uuid = z.string().uuid();

export const brandVersionSchema = z.object({ versionId: uuid });
export const brandExpectedSchema = brandVersionSchema.extend({ expectedUpdatedAt: z.string().min(4) });
export const brandStepSchema = z.object({ versionId: uuid, step: z.enum(BRAND_STEPS) });
export const brandSetupSchema = z.object({
  versionId: uuid,
  model: z.enum(["keller", "aaker"]),
  websiteUrl: zodString(300),
  periodLabel: zodString(120),
  researchAvailability: z.enum(["uploaded", "linked", "unavailable", "unknown"]),
  scopeNote: zodString(800),
  positioningIntended: zodString(800),
});
export const brandSourceMetaSchema = z.object({
  sourceId: uuid,
  materialType: z.enum(MATERIAL_TYPES),
  label: zodString(200, 1),
  periodLabel: zodString(120),
  currency: z.enum(["current", "historical", "unknown"]),
  channel: zodString(120),
  audience: zodString(160),
  note: zodString(800),
  excerpt: zodString(4000),
});
export const brandPageSchema = z.object({
  versionId: uuid,
  pageId: uuid.nullable(),
  url: zodString(400, 8),
  role: z.enum(PAGE_ROLES),
  included: z.boolean(),
  status: z.enum(["pending", "ready", "failed", "excluded"]),
  errorMessage: zodString(300),
  excerpt: zodString(4000),
});
export const brandFindingSchema = z.object({
  versionId: uuid,
  findingId: uuid.nullable(),
  pageId: uuid.nullable(),
  sourceId: uuid.nullable(),
  lens: z.enum(["visual", "text", "journey"]),
  observation: zodString(1200, 8),
  meaning: zodString(1200),
  proposal: zodString(800),
  hypothesis: z.boolean(),
  personaLabel: zodString(160),
  phaseLabel: zodString(160),
});
export const brandDimensionSchema = z.object({
  dimensionId: uuid,
  intended: zodString(800),
  observed: zodString(800),
  gapNote: zodString(800),
  evidenceStatus: z.enum(EVIDENCE_STATUSES),
  judgement: z.enum(["", ...JUDGEMENTS]),
  limitsNote: zodString(500),
  openQuestion: zodString(500),
  hypothesis: z.boolean(),
});
export const brandPrioritySchema = z.object({
  versionId: uuid,
  priorityId: uuid.nullable(),
  title: zodString(160, 2),
  problem: zodString(800),
  action: zodString(800),
  outcome: zodString(400),
  validationQuestion: zodString(400),
  kind: z.enum(PRIORITY_KINDS),
  priority: z.enum(["low", "medium", "high"]),
  reason: zodString(400),
  personaLabel: zodString(160),
  phaseLabel: zodString(160),
});
export const brandConclusionSchema = z.object({
  versionId: uuid,
  verdict: zodString(800),
  strongest: zodString(800),
  weakest: zodString(800),
  unassessed: zodString(800),
  gapSummary: zodString(800),
  positioningIntended: zodString(800),
  perceptionObserved: zodString(800),
  acceptedUncertainty: zodString(1000),
  openQuestions: zodString(2000),
});
export const brandIdSchema = z.object({ id: uuid });
