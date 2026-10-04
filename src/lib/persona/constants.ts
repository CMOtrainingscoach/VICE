export { PERSONA_FRAMEWORK_INDEX, PERSONA_ROUTE, STP_ROUTE } from "@/lib/value-chain/constants";

export const PERSONA_STEPS = ["basis", "personas", "journey", "finish"] as const;
export type PersonaStep = (typeof PERSONA_STEPS)[number];

export const PERSONA_STEP_LABELS: Record<PersonaStep, string> = {
  basis: "Basis",
  personas: "Persona's",
  journey: "Klantreis",
  finish: "Afronden",
};

export const DECISION_ROLES = ["initiator", "user", "influencer", "decider", "budget", "approver", "gatekeeper"] as const;
export type DecisionRole = (typeof DECISION_ROLES)[number];

export const DECISION_ROLE_LABELS: Record<DecisionRole, string> = {
  initiator: "Initiatiefnemer",
  user: "Gebruiker",
  influencer: "Beïnvloeder",
  decider: "Beslisser",
  budget: "Budgethouder",
  approver: "Goedkeurder",
  gatekeeper: "Gatekeeper",
};

export const EVIDENCE_LEVELS = ["supported", "client", "strategist", "hypothesis", "unknown"] as const;
export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number];

export const EVIDENCE_LABELS: Record<EvidenceLevel, string> = {
  supported: "Onderbouwd inzicht",
  client: "Klantverklaring",
  strategist: "Strategistinput",
  hypothesis: "AI-hypothese",
  unknown: "Onbekend",
};

export const PORTRAIT_STATUS_LABELS = {
  queued: "In wachtrij",
  running: "Bezig",
  ready: "Gereed",
  failed: "Mislukt",
} as const;

export const PHASE_STARTERS = ["Aanleiding", "Verkennen", "Beslissen", "Samenwerken", "Verlengen"] as const;
