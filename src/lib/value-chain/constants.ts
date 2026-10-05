export const VALUE_CHAIN_FRAMEWORK_INDEX = 7;
export const VALUE_CHAIN_ROUTE = "waardeketen" as const;
export const VALUE_CHAIN_LABEL = "Waardeketen";

export const STP_FRAMEWORK_INDEX = 8;
export const STP_ROUTE = "stp" as const;

export const PERSONA_FRAMEWORK_INDEX = 9;
export const PERSONA_ROUTE = "personas" as const;

export const BRAND_FRAMEWORK_INDEX = 10;
export const BRAND_ROUTE = "brand" as const;

export const VC_BUSINESS_TYPES = ["service", "production", "trade", "mixed"] as const;
export type VcBusinessType = (typeof VC_BUSINESS_TYPES)[number];

export const VC_BUSINESS_LABELS: Record<VcBusinessType, string> = {
  service: "Dienstverlening",
  production: "Productie",
  trade: "Handel",
  mixed: "Gemengd",
};

export const VC_PRIMARY = ["inbound", "operations", "outbound", "marketing_sales", "after_sales"] as const;
export const VC_SUPPORT = ["infrastructure", "people", "technology", "procurement"] as const;
export const VC_CATEGORIES = [...VC_PRIMARY, ...VC_SUPPORT] as const;
export type VcCategory = (typeof VC_CATEGORIES)[number];
export type VcActivityGroup = "primary" | "support";

export const VC_CATEGORY_GROUP: Record<VcCategory, VcActivityGroup> = {
  inbound: "primary",
  operations: "primary",
  outbound: "primary",
  marketing_sales: "primary",
  after_sales: "primary",
  infrastructure: "support",
  people: "support",
  technology: "support",
  procurement: "support",
};

export const VC_CATEGORY_LABELS: Record<VcBusinessType, Record<VcCategory, string>> = {
  service: {
    inbound: "Intake",
    operations: "Analyse & advies",
    outbound: "Oplevering",
    marketing_sales: "Marketing & verkoop",
    after_sales: "Opvolging",
    infrastructure: "Bedrijfsinrichting",
    people: "Mensen",
    technology: "Technologie",
    procurement: "Inkoop",
  },
  production: {
    inbound: "Ingaande logistiek",
    operations: "Uitvoering",
    outbound: "Uitgaande logistiek",
    marketing_sales: "Marketing & verkoop",
    after_sales: "Service",
    infrastructure: "Bedrijfsinrichting",
    people: "Mensen / HR",
    technology: "Technologieontwikkeling",
    procurement: "Inkoop",
  },
  trade: {
    inbound: "Inkoop & ontvangst",
    operations: "Voorraad & afhandeling",
    outbound: "Levering",
    marketing_sales: "Marketing & verkoop",
    after_sales: "Service",
    infrastructure: "Bedrijfsinrichting",
    people: "Mensen",
    technology: "Technologie",
    procurement: "Inkoop",
  },
  mixed: {
    inbound: "Ingaande logistiek / informatie",
    operations: "Uitvoering",
    outbound: "Levering",
    marketing_sales: "Marketing & verkoop",
    after_sales: "Service",
    infrastructure: "Bedrijfsinrichting",
    people: "Mensen / HR",
    technology: "Technologieontwikkeling",
    procurement: "Inkoop",
  },
};

export const VC_STATUS_LABELS = {
  not_started: "Niet gestart",
  draft: "Concept",
  in_review: "Ter beoordeling",
  approved: "Goedgekeurd",
  needs_revision: "Herziening nodig",
} as const;

export type VcVersionStatus = keyof typeof VC_STATUS_LABELS;

export const VC_EXECUTION = ["internal", "external", "mixed", "unknown"] as const;
export type VcExecution = (typeof VC_EXECUTION)[number];
export const VC_EXECUTION_LABELS: Record<VcExecution, string> = {
  internal: "Intern",
  external: "Extern",
  mixed: "Gemengd",
  unknown: "Onbekend",
};

export const VC_TIME_BASIS = ["measured", "estimate", "unknown"] as const;
export type VcTimeBasis = (typeof VC_TIME_BASIS)[number];
export const VC_TIME_BASIS_LABELS: Record<VcTimeBasis, string> = {
  measured: "Gemeten",
  estimate: "Inschatting",
  unknown: "Onbekend",
};

export const VC_EFFECTS = ["customer_value", "time", "quality", "cost", "unknown"] as const;
export type VcEffect = (typeof VC_EFFECTS)[number];
export const VC_EFFECT_LABELS: Record<VcEffect, string> = {
  customer_value: "Klantwaarde",
  time: "Tijd",
  quality: "Kwaliteit",
  cost: "Kosten",
  unknown: "Nog onduidelijk",
};

export const VC_SCOPES = ["company", "department", "product_group", "service"] as const;
export type VcFinanceScope = (typeof VC_SCOPES)[number];
export const VC_SCOPE_LABELS: Record<VcFinanceScope, string> = {
  company: "Gehele bedrijf",
  department: "Afdeling",
  product_group: "Productgroep",
  service: "Dienst",
};

export const VC_FIGURE_LABELS = {
  actual: "Werkelijk",
  budget: "Budget",
  forecast: "Forecast",
} as const;

export const VC_SCALE_LABELS = {
  units: "Eenheden",
  thousands: "Duizenden",
  millions: "Miljoenen",
} as const;

export const VC_REF_TYPES = [
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
export type VcRefType = (typeof VC_REF_TYPES)[number];

export const VC_REF_TYPE_LABELS: Record<VcRefType, string> = {
  tenant_profile: "Klantdossier",
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
  manual: "Aanvulling",
};

export const VC_EVIDENCE_LABELS = {
  provided: "Aangeleverd",
  observed: "Waargenomen",
  hypothesis: "Hypothese",
} as const;

export type VcEvidence = keyof typeof VC_EVIDENCE_LABELS;
