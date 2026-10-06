export const BRAND_PROFILE_MIGRATION =
  "Pas migraties 20260330133800 en 20260330133900 toe in de Supabase SQL-editor, na 20260330133700.";

export const BRAND_SECTIONS = ["overview", "type", "color", "logo", "voice", "visual", "prompts"] as const;
export type BrandSection = (typeof BRAND_SECTIONS)[number];

export const BRAND_SECTION_LABELS: Record<BrandSection, string> = {
  overview: "Overzicht",
  type: "Typografie",
  color: "Kleuren",
  logo: "Logo's",
  voice: "Tone of voice",
  visual: "Beeldstijl",
  prompts: "Prompts",
};

export const FIELD_ORIGINS = ["established", "observed", "recommended", "hypothesis", "unknown", "strategist"] as const;
export type FieldOrigin = (typeof FIELD_ORIGINS)[number];

export const ORIGIN_LABELS: Record<FieldOrigin, string> = {
  established: "Vastgestelde richtlijn",
  observed: "Geobserveerde toepassing",
  recommended: "Aanbevolen wijziging",
  hypothesis: "Hypothese",
  unknown: "Onbekend",
  strategist: "Strategistinput",
};

export const COLOR_ROLES = ["primary", "secondary", "accent", "background", "text", "support", "unknown"] as const;
export type ColorRole = (typeof COLOR_ROLES)[number];

export const COLOR_ROLE_LABELS: Record<ColorRole, string> = {
  primary: "Primair",
  secondary: "Secundair",
  accent: "Accent",
  background: "Achtergrond",
  text: "Tekst",
  support: "Ondersteunend",
  unknown: "Rol niet vastgelegd",
};

export const LOGO_KINDS = ["primary", "alternate", "wordmark", "mark", "light", "dark", "mono", "favicon", "reference"] as const;
export type LogoKind = (typeof LOGO_KINDS)[number];

export const LOGO_KIND_LABELS: Record<LogoKind, string> = {
  primary: "Primair logo",
  alternate: "Alternatief logo",
  wordmark: "Woordmerk",
  mark: "Beeldmerk",
  light: "Lichte variant",
  dark: "Donkere variant",
  mono: "Monochroom",
  favicon: "Favicon",
  reference: "Referentiebeeld",
};

export const REFERENCE_STATUSES = ["official", "approved_reference", "inspiration", "ai_example"] as const;
export type ReferenceStatus = (typeof REFERENCE_STATUSES)[number];

export const REFERENCE_STATUS_LABELS: Record<ReferenceStatus, string> = {
  official: "Officiële merkvisual",
  approved_reference: "Goedgekeurde stijlreferentie",
  inspiration: "Inspiratie",
  ai_example: "AI-voorbeeld",
};

export type BrandVoice = {
  summary: string;
  principles: string;
  address: string;
  language: string;
  formality: string;
  preferred: string[];
  avoid: string[];
  examples: string;
  channels: { website: string; social: string; email: string; sales: string; service: string };
};

export type BrandVisual = {
  medium: string;
  subjects: string;
  composition: string;
  light: string;
  colorUse: string;
  materials: string;
  textures: string;
  mood: string;
  backgrounds: string;
  camera: string;
  textSpace: string;
  summary: string;
  wanted: string[];
  avoid: string[];
};

export function emptyVoice(): BrandVoice {
  return {
    summary: "",
    principles: "",
    address: "",
    language: "",
    formality: "",
    preferred: [],
    avoid: [],
    examples: "",
    channels: { website: "", social: "", email: "", sales: "", service: "" },
  };
}

export function emptyVisual(): BrandVisual {
  return {
    medium: "",
    subjects: "",
    composition: "",
    light: "",
    colorUse: "",
    materials: "",
    textures: "",
    mood: "",
    backgrounds: "",
    camera: "",
    textSpace: "",
    summary: "",
    wanted: [],
    avoid: [],
  };
}

export type TypeStyle = {
  id: string;
  role: string;
  family: string;
  weight: string;
  italic: boolean;
  size: string;
  unit: string;
  lineHeight: string;
  letterSpacing: string;
  transform: string;
  usage: string;
  fallback: string;
  sample: string;
  mobileSize: string;
  mobileUnit: string;
  sort: number;
  archived: boolean;
};

export type BrandColor = {
  id: string;
  name: string;
  hex: string;
  rgb: string;
  role: ColorRole;
  note: string;
  cmyk: string;
  pantone: string;
  sort: number;
  archived: boolean;
};

export type BrandFontAsset = {
  id: string;
  name: string;
  path: string;
  weights: string;
  italic: boolean;
  variable: boolean;
  origin: string;
  licenseNote: string;
  exportAllowed: boolean;
  useConfirmed: boolean;
  url: string | null;
};

export type BrandAsset = {
  id: string;
  kind: LogoKind;
  name: string;
  path: string;
  format: string;
  width: string;
  height: string;
  usage: string;
  background: string;
  minSize: string;
  clearSpace: string;
  restrictions: string;
  referenceStatus: ReferenceStatus;
  exportAllowed: boolean;
  url: string | null;
  missingNote: string;
};

export type ReviewItem = {
  id: string;
  section: string;
  label: string;
  origin: FieldOrigin;
  sectionPath: string;
  passage: string;
  proposal: ReviewProposal | null;
  decision: "pending" | "accepted" | "dismissed";
};

export type ReviewProposal =
  | { kind: "field"; key: string; value: string }
  | { kind: "color"; name: string; hex: string; role: ColorRole }
  | { kind: "font"; family: string; role: string; size: string; unit: string }
  | { kind: "voice"; value: string }
  | { kind: "visual"; value: string };

export type PromptTemplate = {
  id: string;
  name: string;
  purpose: string;
  situation: string;
  body: string;
  exclusions: string;
  composed: boolean;
  sourcePassage: string;
  archived: boolean;
  updatedAt: string;
};

export type Provenance = {
  fieldKey: string;
  origin: FieldOrigin;
  documentId: string | null;
  contentHash: string;
  sectionPath: string;
  passage: string;
  importedAt: string;
  method: string;
};

export type SourceDocument = {
  id: string;
  status: "draft" | "final";
  savedAt: string;
  brandVersionId: string;
};

export type BrandVersion = {
  id: string;
  versionNumber: number;
  status: "draft" | "approved" | "published";
  updatedAt: string;
  updatedByName: string;
  brandName: string;
  essence: string;
  positioning: string;
  promise: string;
  audience: string;
  valuesText: string;
  voice: BrandVoice;
  visual: BrandVisual;
  sourceDocumentId: string | null;
  sourceStatus: "draft" | "final" | null;
  sourceHash: string;
  sourceSavedAt: string | null;
  importWarnings: string[];
  notApplicable: string[];
  approvedAt: string | null;
  publishedAt: string | null;
};

export type BrandProfileWorkbench = {
  access: "edit";
  mode: "empty" | "choose" | "workbench";
  tenantName: string;
  documents: SourceDocument[];
  publishedVersionId: string | null;
  newerSource: { id: string; status: "draft" | "final"; savedAt: string } | null;
  version: BrandVersion | null;
  styles: TypeStyle[];
  fonts: BrandFontAsset[];
  colors: BrandColor[];
  assets: BrandAsset[];
  reviews: ReviewItem[];
  prompts: PromptTemplate[];
  provenance: Provenance[];
};

export type BrandProfilePublished = {
  access: "published";
  empty?: false;
  tenantName: string;
  version: BrandVersion;
  styles: TypeStyle[];
  fonts: BrandFontAsset[];
  colors: BrandColor[];
  assets: BrandAsset[];
  prompts: PromptTemplate[];
};

export type BrandProfileEmpty = {
  access: "published";
  empty: true;
  tenantName: string;
};

export type BrandProfileView = BrandProfileWorkbench | BrandProfilePublished | BrandProfileEmpty;
