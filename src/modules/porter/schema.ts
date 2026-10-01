import { z } from "zod";
import { PORTER_FORCES } from "@/lib/porter/constants";
import { zodString } from "@/lib/pestel/zod-form";

const competitorSchema = z.object({
  name: zodString(300, 1),
  url: zodString(2000),
});

export const porterScopeSchema = z.object({
  versionId: z.string().uuid(),
  marketSector: zodString(500),
  offeringDescription: zodString(4000),
  geoMarkets: z.array(zodString(200)).max(20),
  clientSegment: zodString(4000),
  timeHorizon: zodString(200),
  researchQuestion: zodString(2000),
  knownCompetitors: z.array(competitorSchema).max(30).optional(),
});

export const porterForceSchema = z.object({
  versionId: z.string().uuid(),
  forceId: z.string().uuid(),
  forceKey: z.enum(PORTER_FORCES),
  intensity: z.enum(["low", "medium", "high", "unknown"]),
  motivation: zodString(8000),
  clientRelevance: zodString(4000),
  advisorNote: zodString(4000),
  headlineFactor: zodString(500),
  markReviewed: z.boolean().optional(),
});

export const porterSynthesisSchema = z.object({
  versionId: z.string().uuid(),
  synthesisText: zodString(12_000),
});

export const porterApprovePestelSchema = z.object({
  versionId: z.string().uuid(),
  expectedUpdatedAt: z.string().min(1),
});
