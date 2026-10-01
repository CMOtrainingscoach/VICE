import { z } from "zod";
import { PESTEL_DIMENSIONS } from "@/lib/pestel/constants";

const pestelResearchInputSchema = z
  .object({
    kind: z.enum(["meeting", "website", "document", "note"]),
    meeting_recording_id: z.string().uuid().optional().or(z.literal("")),
    label: z.string().max(500),
    url: z.string().max(2000).optional().or(z.literal("")),
    excerpt: z.string().max(12_000),
  })
  .superRefine((val, ctx) => {
    if (val.kind === "meeting" && !val.meeting_recording_id) {
      ctx.addIssue({ code: "custom", message: "Kies een meeting" });
    }
    if (val.kind === "website" && !val.url?.trim()) {
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
  marketSector: z.string().max(500),
  geoMarkets: z.array(z.string().max(200)).max(20),
  timeHorizon: z.string().max(200),
  servicesOfferings: z.string().max(4000),
  offeringAudience: z.string().max(4000),
  researchQuestion: z.string().max(2000),
  researchInputs: z.array(pestelResearchInputSchema).max(40).optional(),
});

const pestelSourceSchema = z.object({
  source_type: z.enum(["website", "document", "meeting", "manual"]),
  label: z.string().max(500),
  url: z.string().max(2000).optional().or(z.literal("")),
  publisher: z.string().max(500).optional().or(z.literal("")),
  excerpt: z.string().max(4000),
  meeting_recording_id: z.string().uuid().optional().or(z.literal("")),
  meeting_offset_ms: z.number().int().min(0).optional(),
});

export const pestelInsightSchema = z.object({
  versionId: z.string().uuid(),
  insightId: z.string().uuid().optional().nullable(),
  dimension: z.enum(PESTEL_DIMENSIONS),
  title: z.string().max(300),
  observation: z.string().max(8000),
  clientRelevance: z.string().max(4000),
  opportunityRisk: z.enum(["opportunity", "risk", "both", "unclear"]),
  impact: z.enum(["low", "medium", "high", "unknown"]),
  impactNote: z.string().max(1000),
  insightTimeHorizon: z.string().max(200),
  evidenceLevel: z.enum(["provided", "observed", "hypothesis"]),
  advisorNote: z.string().max(4000),
  markReviewed: z.boolean().optional(),
  sources: z.array(pestelSourceSchema).max(20),
});

export const pestelSynthesisSchema = z.object({
  versionId: z.string().uuid(),
  synthesisText: z.string().max(12_000),
});
