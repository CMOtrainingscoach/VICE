export { STP_FRAMEWORK_INDEX, STP_ROUTE } from "@/lib/value-chain/constants";

export const STP_STEPS = ["segments", "target", "position", "icp"] as const;
export type StpStep = (typeof STP_STEPS)[number] | "intake";

export const STP_STEP_LABELS: Record<StpStep, string> = {
  intake: "Start",
  segments: "Segmentatie",
  target: "Targeting",
  position: "Positionering",
  icp: "ICP",
};

export const STP_DISPOSITIONS = ["unset", "primary", "later", "not_priority", "excluded"] as const;
export type StpDisposition = (typeof STP_DISPOSITIONS)[number];

export const STP_DISPOSITION_LABELS: Record<StpDisposition, string> = {
  unset: "Nog geen keuze",
  primary: "Primair segment",
  later: "Later onderzoeken",
  not_priority: "Niet prioritair",
  excluded: "Uitgesloten",
};

export const STP_RATINGS = ["strong", "mixed", "weak", "unknown"] as const;
export type StpRating = (typeof STP_RATINGS)[number];

export const STP_RATING_LABELS: Record<StpRating, string> = {
  strong: "Sterk",
  mixed: "Gemengd",
  weak: "Zwak",
  unknown: "Onbekend",
};

export const STP_DIMENSIONS = ["need", "offer", "capability", "reach", "delivery", "commercial"] as const;
export type StpDimension = (typeof STP_DIMENSIONS)[number];

export const STP_DIMENSION_LABELS: Record<StpDimension, string> = {
  need: "Behoefte",
  offer: "Fit met aanbod",
  capability: "Fit met expertise",
  reach: "Bereikbaarheid",
  delivery: "Leverbaarheid",
  commercial: "Commerciële aantrekkelijkheid",
};

export const STP_CLAIMS = ["supported", "hypothesis", "missing", "conflict"] as const;
export type StpClaim = (typeof STP_CLAIMS)[number];

export const STP_CLAIM_LABELS: Record<StpClaim, string> = {
  supported: "Onderbouwd",
  hypothesis: "Hypothese",
  missing: "Bewijs ontbreekt",
  conflict: "Tegenstrijdige informatie",
};

export const STP_CRITERION_KINDS = ["must", "plus", "exclude"] as const;
export type StpCriterionKind = (typeof STP_CRITERION_KINDS)[number];

export const STP_CRITERION_LABELS: Record<StpCriterionKind, string> = {
  must: "Moet aanwezig zijn",
  plus: "Is een pluspunt",
  exclude: "Past niet",
};

export const STP_STATUS_LABELS = {
  not_started: "Niet gestart",
  draft: "Concept",
  in_review: "Ter beoordeling",
  approved: "Goedgekeurd",
  needs_revision: "Opnieuw bekijken",
} as const;
