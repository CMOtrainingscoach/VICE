import { z } from "zod";
import { DECISION_ROLES, EVIDENCE_LEVELS, PERSONA_STEPS } from "@/lib/persona/constants";
import { zodString } from "@/lib/pestel/zod-form";

const uuid = z.string().uuid();

export const personaVersionSchema = z.object({ versionId: uuid });
export const personaExpectedSchema = personaVersionSchema.extend({ expectedUpdatedAt: z.string().min(4) });
export const personaStepSchema = z.object({ versionId: uuid, step: z.enum(PERSONA_STEPS) });

export const personaSaveSchema = z.object({
  versionId: uuid,
  personaId: uuid.nullable(),
  roleTitle: zodString(200, 2),
  displayName: zodString(80),
  summary: zodString(800),
  decisionRoles: z.array(z.enum(DECISION_ROLES)).max(7),
  relevance: zodString(800),
  goals: zodString(800),
  outcomes: zodString(800),
  responsibilities: zodString(800),
  successCriteria: zodString(800),
  pains: zodString(800),
  barriers: zodString(800),
  risks: zodString(800),
  consequences: zodString(800),
  triggers: zodString(800),
  decisionCriteria: zodString(800),
  objections: zodString(800),
  infoNeeded: zodString(800),
  otherRoles: zodString(500),
  touchpoints: zodString(500),
  questions: zodString(800),
  arguments: zodString(800),
  proofNeeded: zodString(800),
  channels: zodString(400),
  assumptions: zodString(800),
  openQuestion: zodString(800),
  conflictNote: zodString(500),
  hypothesis: z.boolean(),
  evidenceLevel: z.enum(EVIDENCE_LEVELS),
  active: z.boolean(),
});

export const personaIdSchema = z.object({ personaId: uuid });
export const personaResolveSchema = personaIdSchema.extend({ accept: z.boolean() });
export const portraitStartSchema = z.object({ personaId: uuid, prompt: zodString(300) });
export const portraitIdSchema = z.object({ portraitId: uuid });
export const journeyEnsureSchema = z.object({
  versionId: uuid,
  kind: z.enum(["current", "desired"]),
  primaryPersonaId: uuid.nullable(),
});
export const phaseSaveSchema = z.object({
  journeyId: uuid,
  phaseId: uuid.nullable(),
  name: zodString(120, 2),
  goal: zodString(500),
  actions: zodString(800),
  questions: zodString(800),
  infoNeed: zodString(500),
  decisionCriteria: zodString(500),
  barriers: zodString(500),
  nextStep: zodString(400),
  touchpoints: zodString(400),
  channels: zodString(300),
  involvedPersonaIds: z.array(uuid).max(12),
  companySide: zodString(300),
  contentNeeded: zodString(400),
  assumption: zodString(500),
  openQuestion: zodString(500),
  emotion: zodString(300),
  improvement: zodString(500),
  proposedAction: zodString(500),
  contribution: zodString(400),
  ownerName: zodString(120),
  priority: z.enum(["low", "medium", "high", "unknown"]),
  hypothesis: z.boolean(),
});
export const phaseMoveSchema = z.object({ phaseId: uuid, direction: z.union([z.literal(-1), z.literal(1)]) });
export const phaseArchiveSchema = z.object({ phaseId: uuid, restore: z.boolean() });
export const journeyProposalSchema = personaExpectedSchema.extend({ journeyId: uuid });
export const journeyProposeSchema = journeyProposalSchema.extend({
  kind: z.enum(["current", "desired"]),
  roleTitle: zodString(200),
});
export const journeyApplySchema = z.object({ journeyId: uuid, replace: z.boolean() });
export const notesSchema = z.object({
  versionId: uuid,
  uncertainty: zodString(1000),
  questions: zodString(2000),
});
