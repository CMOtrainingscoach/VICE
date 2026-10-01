export const VRIO_FRAMEWORK_INDEX = 5;

export const VRIO_ROUTE = "vrio" as const;

export const VRIO_LABEL = "VRIO";

export const BCG_FRAMEWORK_INDEX = 6;

export const BCG_ROUTE = "bcg" as const;

export const VRIO_CRITERIA = ["value", "rarity", "imitability", "organization"] as const;

export type VrioCriterion = (typeof VRIO_CRITERIA)[number];

export type VrioAnswer = "yes" | "no" | "unknown" | "not_assessed";

export type VrioEvidenceLevel = "provided" | "observed" | "hypothesis";

export type VrioResourceKind = "resource" | "competence";

export type VrioReview = "pending" | "reviewed";

export type VrioQuestionStatus = "open" | "answered" | "queued_meeting" | "accepted_open";

export type VrioAiState = "none" | "proposed" | "accepted" | "rejected";

export type VrioVersionStatus = "not_started" | "draft" | "in_review" | "approved" | "needs_revision";

export type VrioRefType =
  | "tenant_profile"
  | "meeting"
  | "pestel_insight"
  | "pestel_input"
  | "porter_scope"
  | "porter_force"
  | "porter_factor"
  | "five_c_item"
  | "five_c_synthesis"
  | "swot_item"
  | "manual";

export type VrioOutcome =
  | "disadvantage"
  | "parity"
  | "temporary"
  | "unused_potential"
  | "sustained"
  | "undetermined";

export const VRIO_CRITERION_META: Record<
  VrioCriterion,
  { letter: string; label: string; question: string; evidenceHint: string; gapQuestion: string }
> = {
  value: {
    letter: "V",
    label: "Waardevol",
    question: "Helpt dit kansen te benutten, risico's te beperken of waarde te creëren?",
    evidenceHint: "Klantwaarde, prestaties, kostenvoordeel",
    gapQuestion: "Welke resultaten tonen de waarde hiervan aan?",
  },
  rarity: {
    letter: "R",
    label: "Zeldzaam",
    question: "Beschikken weinig relevante concurrenten hierover?",
    evidenceHint: "Vergelijkende informatie uit het dossier",
    gapQuestion: "Welke concurrenten beschikken over iets vergelijkbaars?",
  },
  imitability: {
    letter: "I",
    label: "Moeilijk te imiteren",
    question: "Is dit voor concurrenten moeilijk of kostbaar na te bootsen of te vervangen?",
    evidenceHint: "Opgebouwde kennis, relaties, historie of beschermde middelen",
    gapQuestion: "Wat maakt nabootsing moeilijk of kostbaar?",
  },
  organization: {
    letter: "O",
    label: "Organisatorisch ondersteund",
    question: "Is het bedrijf ingericht om de waarde hiervan daadwerkelijk te benutten?",
    evidenceHint: "Processen, mensen, verantwoordelijkheden en middelen",
    gapQuestion: "Welke processen zorgen dat het bedrijf dit benut?",
  },
};

export const VRIO_ANSWER_LABELS: Record<VrioAnswer, string> = {
  yes: "Ja",
  no: "Nee",
  unknown: "Onbekend",
  not_assessed: "Niet beoordeeld",
};

/** In de matrix: ? = onbekend, — = niet beoordeeld (nooit als 'Nee' tonen). */
export const VRIO_ANSWER_SYMBOLS: Record<VrioAnswer, string> = {
  yes: "Ja",
  no: "Nee",
  unknown: "?",
  not_assessed: "—",
};

export const VRIO_OUTCOME_META: Record<
  VrioOutcome,
  { label: string; note: string; tone: "red" | "neutral" | "amber" | "violet" | "green" }
> = {
  disadvantage: {
    label: "Concurrentienadeel",
    note: "Dit middel draagt niet aan waarde bij in de onderzochte context.",
    tone: "red",
  },
  parity: {
    label: "Concurrentiepariteit",
    note: "Waardevol maar gangbaar: nodig om mee te kunnen concurreren, geen onderscheid.",
    tone: "neutral",
  },
  temporary: {
    label: "Tijdelijk concurrentievoordeel",
    note: "Het voordeel is na te bootsen; organisatie bepaalt of het echt benut wordt.",
    tone: "amber",
  },
  unused_potential: {
    label: "Onbenut potentieel",
    note: "Het bedrijf is onvoldoende ingericht om dit voordeel te verzilveren.",
    tone: "violet",
  },
  sustained: {
    label: "Potentieel duurzaam concurrentievoordeel",
    note: "Geldt binnen de onderzochte context; geen garantie op blijvend succes.",
    tone: "green",
  },
  undetermined: {
    label: "Nog geen definitieve classificatie",
    note: "Een noodzakelijk antwoord ontbreekt of is onbekend.",
    tone: "neutral",
  },
};

export const VRIO_STATUS_LABELS: Record<VrioVersionStatus, string> = {
  not_started: "Nog niet gestart",
  draft: "Concept",
  in_review: "Ter beoordeling",
  approved: "Goedgekeurd",
  needs_revision: "Herziening nodig",
};

export const VRIO_EVIDENCE_LABELS: Record<VrioEvidenceLevel, string> = {
  provided: "Aangeleverd",
  observed: "Waargenomen",
  hypothesis: "Hypothese",
};

export const VRIO_REF_TYPE_LABELS: Record<VrioRefType, string> = {
  tenant_profile: "Klantprofiel",
  meeting: "Meeting",
  pestel_insight: "PESTEL",
  pestel_input: "Document",
  porter_scope: "Porter",
  porter_force: "Porter",
  porter_factor: "Porter-factor",
  five_c_item: "5C",
  five_c_synthesis: "5C-synthese",
  swot_item: "SWOT",
  manual: "Eigen aanvulling",
};

export const VRIO_PRIORITY_ACTIONS = {
  protect: "Beschermen of onderhouden",
  organize: "Beter organiseren",
  substantiate: "Verder onderbouwen",
  reconsider: "Heroverwegen",
} as const;

export type VrioPriorityAction = keyof typeof VRIO_PRIORITY_ACTIONS;
