import { z } from "zod";
import { PESTEL_DIMENSIONS } from "@/lib/pestel/constants";
import { zodString } from "@/lib/pestel/zod-form";

const pestelResearchInputSchema = z
  .object({
    kind: z.enum(["meeting", "website", "document", "note"]),
    meeting_recording_id: z.preprocess(
      (v) => (v == null ? "" : String(v)),
      z.string().uuid().optional().or(z.literal("")),
    ),
    label: zodString(500),
    url: zodString(2000),
    excerpt: zodString(12_000),
  })
  .superRefine((val, ctx) => {
    if (val.kind === "meeting" && !val.meeting_recording_id) {
      ctx.addIssue({ code: "custom", message: "Kies een meeting" });
    }
    if (val.kind === "website" && !val.url.trim()) {
      ctx.addIssue({ code: "custom", message: "Website vereist URL" });
    }
    if (val.kind === "document" && !val.label.trim() && !val.excerpt.trim()) {
      ctx.addIssue({ code: "custom", message: "Document vereist titel of inhoud" });
    }
    if (val.kind === "note" && !val.excerpt.trim()) {
      ctx.addIssue({ code: "custom", message: "Notitie vereist tekst" });
    }
  });

export const pestelScopeSchema = z.object({
  versionId: z.string().uuid(),
  marketSector: zodString(500),
  geoMarkets: z.array(zodString(200)).max(20),
  timeHorizon: zodString(200),
  servicesOfferings: zodString(4000),
  offeringAudience: zodString(4000),
  researchQuestion: zodString(2000),
  researchInputs: z.array(pestelResearchInputSchema).max(40).optional(),
});

const pestelSourceSchema = z.object({
  source_type: z.enum(["website", "document", "meeting", "manual"]),
  label: zodString(500),
  url: zodString(2000),
  publisher: zodString(500),
  excerpt: zodString(4000),
  meeting_recording_id: z.preprocess(
    (v) => (v == null ? "" : String(v)),
    z.string().uuid().optional().or(z.literal("")),
  ),
  meeting_offset_ms: z.number().int().min(0).optional(),
});

export const pestelInsightSchema = z.object({
  versionId: z.string().uuid(),
  insightId: z.string().uuid().optional().nullable(),
  dimension: z.enum(PESTEL_DIMENSIONS),
  title: zodString(300),
  observation: zodString(8000),
  clientRelevance: zodString(4000),
  opportunityRisk: z.enum(["opportunity", "risk", "both", "unclear"]),
  impact: z.enum(["low", "medium", "high", "unknown"]),
  impactNote: zodString(1000),
  insightTimeHorizon: zodString(200),
  evidenceLevel: z.enum(["provided", "observed", "hypothesis"]),
  advisorNote: zodString(4000),
  markReviewed: z.boolean().optional(),
  sources: z.array(pestelSourceSchema).max(20),
});

export const pestelSynthesisSchema = z.object({
  versionId: z.string().uuid(),
  synthesisText: zodString(12_000),
});

export const pestelSynthesisAiSchema = z.object({
  versionId: z.string().uuid(),
  tenantName: zodString(500, 1),
});

export const pestelInsightRelevanceAiSchema = z.object({
  versionId: z.string().uuid(),
  tenantName: zodString(500, 1),
  dimension: z.enum(PESTEL_DIMENSIONS),
  title: zodString(300, 1),
  observation: zodString(8000, 20),
  sourceExcerpts: z.array(zodString(2000)).max(8).optional(),
});
