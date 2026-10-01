import { z } from "zod";
import { SWOT_QUADRANTS } from "@/lib/swot/constants";
import { zodString } from "@/lib/pestel/zod-form";

const quadrant = z.enum(SWOT_QUADRANTS);
const uuid = z.string().uuid();

const swotRefSchema = z.object({
  ref_type: z.string(),
  ref_id: z.string().uuid().nullable(),
  label: z.string().max(500),
  excerpt: z.string().max(2000),
});

export const swotQuadrantSchema = z.object({
  versionId: uuid,
  quadrant,
  statements: z
    .array(
      z.object({
        statement: zodString(2000, 2),
        origin: z.enum(["ai", "manual"]).optional(),
        refs: z.array(swotRefSchema).max(15).optional(),
      }),
    )
    .max(20),
});

export const swotAdjustmentSchema = z.object({
  versionId: uuid,
  note: zodString(4000),
});

export const swotReviewSchema = z.object({
  versionId: uuid,
  reviewed: z.boolean(),
});

export const swotApproveSchema = z.object({
  versionId: uuid,
  expectedUpdatedAt: z.string().min(10),
});

export const swotAiSchema = z.object({
  versionId: uuid,
  adjustmentNote: zodString(4000).optional(),
});
