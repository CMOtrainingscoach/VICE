export const MARKETING_5C_FRAMEWORK_INDEX = 3;

export const MARKETING_5C_ROUTE = "marketing-5c" as const;

export const MARKETING_5C_LABEL = "5C-analyse";

export const SWOT_FRAMEWORK_INDEX = 4;

export const SWOT_ROUTE = "swot" as const;

export const FIVE_C_KEYS = [
  "company",
  "customers",
  "competitors",
  "collaborators",
  "context",
] as const;

export type FiveCKey = (typeof FIVE_C_KEYS)[number];

export type FiveCContentType = "adopted" | "derived" | "input_needed";

export type FiveCEvidenceLevel = "provided" | "observed" | "hypothesis";

export type FiveCReview = "pending" | "reviewed" | "rejected";

export type FiveCGapStatus = "open" | "answered" | "queued_meeting" | "accepted_open";

export type FiveCRefType =
  | "tenant_profile"
  | "meeting"
  | "pestel_insight"
  | "pestel_input"
  | "porter_scope"
  | "porter_force"
  | "porter_factor"
  | "manual";

export type FiveCVersionStatus = "not_started" | "draft" | "approved";

export const FIVE_C_META: Record<
  FiveCKey,
  {
    label: string;
    english: string;
    question: string;
    originLabel: string;
    emptyNextStep: string;
  }
> = {
  company: {
    label: "Bedrijf",
    english: "Company",
    question: "Wat biedt het bedrijf en met welke middelen?",
    originLabel: "Klantdossier",
    emptyNextStep: "Koppel een meeting of document over aanbod, doelen en capaciteit.",
  },
  customers: {
    label: "Klanten",
    english: "Customers",
    question: "Wat weten we over klanten, behoeften en koopcriteria?",
    originLabel: "Dossier + Porter",
    emptyNextStep: "Leg klantgesprekken vast of beantwoord de validatievragen.",
  },
  competitors: {
    label: "Concurrenten",
    english: "Competitors",
    question: "Wie concurreert en waar zit het onderscheid?",
    originLabel: "Uit Porter",
    emptyNextStep: "Rond Porter af of voeg bekende concurrenten toe in Porter.",
  },
  collaborators: {
    label: "Partners",
    english: "Collaborators",
    question: "Wie helpt je waarde leveren aan de klant?",
    originLabel: "Dossier + Porter",
    emptyNextStep: "Vul bevestigde partners en afspraken aan.",
  },
  context: {
    label: "Context",
    english: "Context",
    question: "Welke externe ontwikkelingen spelen mee?",
    originLabel: "Uit PESTEL",
    emptyNextStep: "Rond PESTEL af of leg een vraag vast voor PESTEL.",
  },
};

/** Welke brontypes elke C mag gebruiken (vaste herkomst, ook technisch afgedwongen). */
export const FIVE_C_ALLOWED_REF_TYPES: Record<FiveCKey, readonly FiveCRefType[]> = {
  company: ["tenant_profile", "meeting", "pestel_input", "porter_scope", "manual"],
  customers: ["tenant_profile", "meeting", "pestel_input", "porter_scope", "porter_force", "porter_factor", "manual"],
  competitors: ["porter_scope", "porter_force", "porter_factor", "manual"],
  collaborators: ["tenant_profile", "meeting", "pestel_input", "porter_force", "porter_factor", "manual"],
  context: ["pestel_insight", "manual"],
};

/** Porter-krachten die een C mag aanspreken. */
export const FIVE_C_ALLOWED_PORTER_FORCES: Partial<Record<FiveCKey, readonly string[]>> = {
  customers: ["buyers"],
  competitors: ["rivalry", "new_entrants", "substitutes"],
  collaborators: ["suppliers"],
};

export const FIVE_C_CONTENT_TYPE_LABELS: Record<FiveCContentType, string> = {
  adopted: "Overgenomen",
  derived: "Afgeleid",
  input_needed: "Input nodig",
};

export const FIVE_C_EVIDENCE_LABELS: Record<FiveCEvidenceLevel, string> = {
  provided: "Aangeleverd",
  observed: "Waargenomen",
  hypothesis: "Hypothese",
};

export const FIVE_C_GAP_STATUS_LABELS: Record<FiveCGapStatus, string> = {
  open: "Open",
  answered: "Beantwoord",
  queued_meeting: "Voor volgende meeting",
  accepted_open: "Bewust open",
};

/** Verplichte classificaties per C (geen ongemerkte herclassificatie). */
export const FIVE_C_QUALIFIERS: Partial<Record<FiveCKey, Record<string, string>>> = {
  customers: {
    single_statement: "Uitspraak van één klant",
    pattern: "Patroon uit meerdere bronnen",
    hypothesis: "Bestaande hypothese",
  },
  competitors: {
    direct: "Directe concurrent",
    new_entrant: "Mogelijke toetreder",
    substitute: "Substituut",
  },
  collaborators: {
    confirmed: "Bevestigde partner",
    mentioned: "Genoemde mogelijke partner",
    needed_type: "Benodigd type partner",
    market_supplier: "Marktbrede leveranciersinfo (Porter)",
  },
};

export const FIVE_C_REF_TYPE_LABELS: Record<FiveCRefType, string> = {
  tenant_profile: "Klantprofiel",
  meeting: "Meeting",
  pestel_insight: "PESTEL",
  pestel_input: "Document",
  porter_scope: "Porter-afbakening",
  porter_force: "Porter",
  porter_factor: "Porter-factor",
  manual: "Eigen aanvulling",
};
