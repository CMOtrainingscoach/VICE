import { BCG_FRAMEWORK_INDEX, BCG_ROUTE } from "@/lib/vrio/constants";

export { BCG_FRAMEWORK_INDEX, BCG_ROUTE };

export const BCG_LABEL = "BCG-matrix";

export const BCG_VERSION_STATUSES = ["not_started", "draft", "in_review", "approved", "needs_revision"] as const;

export type BcgVersionStatus = (typeof BCG_VERSION_STATUSES)[number];

export const BCG_STATUS_LABELS: Record<BcgVersionStatus, string> = {
  not_started: "Niet gestart",
  draft: "Concept",
  in_review: "Ter beoordeling",
  approved: "Goedgekeurd",
  needs_revision: "Herziening nodig",
};

export const BCG_KINDS = ["product", "service", "group", "unit"] as const;

export type BcgItemKind = (typeof BCG_KINDS)[number];

export const BCG_KIND_LABELS: Record<BcgItemKind, string> = {
  product: "Product",
  service: "Dienst",
  group: "Productgroep",
  unit: "Businessunit",
};

export const BCG_QUADRANTS = ["star", "question_mark", "cash_cow", "dog"] as const;

export type BcgQuadrant = (typeof BCG_QUADRANTS)[number];

export const BCG_QUADRANT_META: Record<BcgQuadrant, { label: string; hint: string }> = {
  star: {
    label: "Stars",
    hint: "Hoge groei en hoog relatief aandeel. Dat bewijst geen winstgevendheid.",
  },
  question_mark: {
    label: "Question marks",
    hint: "Hoge groei en laag relatief aandeel. Investeren volgt hier niet uit.",
  },
  cash_cow: {
    label: "Cash cows",
    hint: "Lage groei en hoog relatief aandeel. Cashgeneratie is niet bewezen zonder financiële onderbouwing.",
  },
  dog: {
    label: "Dogs",
    hint: "Lage groei en laag relatief aandeel. Stopzetten volgt hier niet uit.",
  },
};

export const BCG_EVIDENCE = ["measured", "provided", "forecast", "estimate"] as const;

export type BcgEvidence = (typeof BCG_EVIDENCE)[number];

export const BCG_EVIDENCE_LABELS: Record<BcgEvidence, string> = {
  measured: "Gemeten",
  provided: "Aangeleverd",
  forecast: "Prognose",
  estimate: "Menselijke schatting",
};

export const BCG_PERIOD_KINDS = ["year", "quarter", "multi_year", "other"] as const;

export type BcgPeriodKind = (typeof BCG_PERIOD_KINDS)[number];

export const BCG_PERIOD_LABELS: Record<BcgPeriodKind, string> = {
  year: "Jaar",
  quarter: "Kwartaal",
  multi_year: "Meerjarig",
  other: "Andere periode",
};

export const BCG_BASES = ["value", "volume"] as const;

export type BcgMeasureBasis = (typeof BCG_BASES)[number];

export const BCG_BASIS_LABELS: Record<BcgMeasureBasis, string> = {
  value: "Marktwaarde / omzet",
  volume: "Volume",
};

export const BCG_SCALES = ["units", "thousands", "millions"] as const;

export type BcgScale = (typeof BCG_SCALES)[number];

export const BCG_SCALE_LABELS: Record<BcgScale, string> = {
  units: "Eenheden",
  thousands: "Duizenden",
  millions: "Miljoenen",
};

export const BCG_GROWTH_METHODS = ["none", "direct", "from_size"] as const;

export type BcgGrowthMethod = (typeof BCG_GROWTH_METHODS)[number];

export const BCG_SHARE_METHODS = ["none", "from_shares", "from_amounts"] as const;

export type BcgShareMethod = (typeof BCG_SHARE_METHODS)[number];

export const BCG_OVERLAP_MODES = ["unset", "count", "excluded"] as const;

export type BcgOverlapMode = (typeof BCG_OVERLAP_MODES)[number];

export const BCG_REF_TYPES = [
  "tenant_profile",
  "meeting",
  "pestel_insight",
  "pestel_input",
  "porter_scope",
  "porter_force",
  "porter_factor",
  "five_c_item",
  "five_c_synthesis",
  "swot_item",
  "vrio_resource",
  "manual",
] as const;

export type BcgRefType = (typeof BCG_REF_TYPES)[number];

export const BCG_REF_TYPE_LABELS: Record<BcgRefType, string> = {
  tenant_profile: "Dossier",
  meeting: "Meeting",
  pestel_insight: "PESTEL",
  pestel_input: "Document",
  porter_scope: "Porter",
  porter_force: "Porter",
  porter_factor: "Porter",
  five_c_item: "5C",
  five_c_synthesis: "5C",
  swot_item: "SWOT",
  vrio_resource: "VRIO",
  manual: "Toelichting",
};
