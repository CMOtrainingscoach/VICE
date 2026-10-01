export const PESTEL_FRAMEWORK_INDEX = 1;
export const AUDIT_FRAMEWORK_COUNT = 13;

export const PESTEL_DIMENSIONS = [
  "political",
  "economic",
  "social",
  "technological",
  "ecological",
  "legal",
] as const;

export type PestelDimension = (typeof PESTEL_DIMENSIONS)[number];

export const PESTEL_DIMENSION_META: Record<
  PestelDimension,
  { label: string; hint: string; accent: string }
> = {
  political: {
    label: "Politiek",
    hint: "Overheidsbeleid, handelsbeleid, subsidies",
    accent: "border-l-[#6366f1]",
  },
  economic: {
    label: "Economisch",
    hint: "Kosten, koopkracht, investeringsklimaat",
    accent: "border-l-[#22c55e]",
  },
  social: {
    label: "Sociaal",
    hint: "Gedrag, verwachtingen, demografie",
    accent: "border-l-[#f97316]",
  },
  technological: {
    label: "Technologisch",
    hint: "Automatisering, AI, adoptie",
    accent: "border-l-[#3b82f6]",
  },
  ecological: {
    label: "Ecologisch",
    hint: "Klimaat, grondstoffen, duurzaamheid",
    accent: "border-l-[#14b8a6]",
  },
  legal: {
    label: "Juridisch",
    hint: "Regelgeving en verplichtingen",
    accent: "border-l-[#a855f7]",
  },
};

export type PestelVersionStatus =
  | "not_started"
  | "research_running"
  | "draft"
  | "in_review"
  | "approved"
  | "needs_revision";

export const PESTEL_STATUS_LABELS: Record<PestelVersionStatus, string> = {
  not_started: "Nog niet gestart",
  research_running: "Onderzoek bezig",
  draft: "Concept",
  in_review: "Ter beoordeling",
  approved: "Goedgekeurd",
  needs_revision: "Herziening nodig",
};
