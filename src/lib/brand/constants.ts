export { BRAND_FRAMEWORK_INDEX, BRAND_ROUTE, PERSONA_ROUTE } from "@/lib/value-chain/constants";

export const BRAND_STEPS = ["sources", "website", "image", "conclusion"] as const;
export type BrandStep = (typeof BRAND_STEPS)[number];

export const BRAND_STEP_LABELS: Record<BrandStep, string> = {
  sources: "Bronnen",
  website: "Website",
  image: "Merkbeeld",
  conclusion: "Conclusie",
};

export const BRAND_STEP_QUESTIONS: Record<BrandStep, string> = {
  sources: "Hoe komt je merk over?",
  website: "Je website, bekeken door je klant",
  image: "Wat leeft er werkelijk in de markt?",
  conclusion: "Dit is je vertrekpunt als merk",
};

export const BRAND_MODELS = ["keller", "aaker"] as const;
export type BrandModel = (typeof BRAND_MODELS)[number];

export const KELLER_KEYS = ["salience", "performance", "imagery", "judgements", "feelings", "resonance"] as const;
export const AAKER_KEYS = ["awareness", "quality", "associations", "loyalty", "assets"] as const;
export type BrandDimensionKey = (typeof KELLER_KEYS)[number] | (typeof AAKER_KEYS)[number];

export const DIMENSION_LABELS: Record<BrandDimensionKey, string> = {
  salience: "Bekendheid",
  performance: "Prestaties",
  imagery: "Imago",
  judgements: "Oordelen",
  feelings: "Gevoelens",
  resonance: "Binding",
  awareness: "Merkbekendheid",
  quality: "Waargenomen kwaliteit",
  associations: "Merkassociaties",
  loyalty: "Merkloyaliteit",
  assets: "Overige merkrechten en relaties",
};

export const KELLER_LEVELS = [
  { level: 4, label: "Binding", keys: ["resonance"] },
  { level: 3, label: "Oordelen en gevoelens", keys: ["judgements", "feelings"] },
  { level: 2, label: "Prestaties en imago", keys: ["performance", "imagery"] },
  { level: 1, label: "Bekendheid", keys: ["salience"] },
] as const;

export const EVIDENCE_STATUSES = ["sufficient", "limited", "conflicting", "unknown"] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];
export const EVIDENCE_LABELS: Record<EvidenceStatus, string> = {
  sufficient: "Voldoende onderbouwd",
  limited: "Beperkt onderbouwd",
  conflicting: "Tegenstrijdige bronnen",
  unknown: "Onbekend",
};

export const JUDGEMENTS = ["strength", "mixed", "attention", "not_assessable"] as const;
export type BrandJudgement = (typeof JUDGEMENTS)[number];
export const JUDGEMENT_LABELS: Record<BrandJudgement, string> = {
  strength: "Sterkte",
  mixed: "Gemengd beeld",
  attention: "Aandachtspunt",
  not_assessable: "Niet te beoordelen",
};

export const MATERIAL_TYPES = ["guideline", "strategy", "tracking", "research", "visual", "campaign", "other"] as const;
export type MaterialType = (typeof MATERIAL_TYPES)[number];
export const MATERIAL_LABELS: Record<MaterialType, string> = {
  guideline: "Brand guidelines",
  strategy: "Merkstrategie",
  tracking: "Brand tracking",
  research: "Klant- of marktonderzoek",
  visual: "Campagne of huisstijl",
  campaign: "Advertentie of post",
  other: "Overig",
};

export const PAGE_ROLES = ["home", "about", "offer", "proof", "contact", "other"] as const;
export type PageRole = (typeof PAGE_ROLES)[number];
export const PAGE_ROLE_LABELS: Record<PageRole, string> = {
  home: "Homepage",
  about: "Over ons",
  offer: "Aanbod",
  proof: "Bewijs of cases",
  contact: "Contact",
  other: "Andere pagina",
};

export const PRIORITY_KINDS = ["communication", "experience", "research"] as const;
export type PriorityKind = (typeof PRIORITY_KINDS)[number];
export const PRIORITY_KIND_LABELS: Record<PriorityKind, string> = {
  communication: "Communicatie",
  experience: "Klantbeleving",
  research: "Aanvullend onderzoek",
};

export const BRAND_MIGRATION = "Pas migratie 20260330133300 toe in de Supabase SQL-editor, na 20260330133200.";
