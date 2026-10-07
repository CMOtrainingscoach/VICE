export type TypeRole = "h1" | "h2" | "h3" | "body";

export type TypeStyle = {
  family: string;
  weight: string;
  size: string;
  lineHeight: string;
  mobileSize: string;
  mobileLineHeight: string;
  sample: string;
};

export type BrandColor = {
  id: string;
  name: string;
  hex: string;
  role: string;
};

export type BrandVisual = {
  tags: string[];
  do: string;
  avoid: string;
  stylePrompt: string;
};

export type BrandPromptTemplate = {
  id: string;
  name: string;
  subject: string;
  use: string;
  format: string;
  camera: string;
  light: string;
  body: string;
};

export type ClientBrand = {
  id: string;
  tenantId: string;
  status: "draft" | "approved";
  versionNumber: number;
  brandName: string;
  tagline: string;
  positioning: string;
  voice: string;
  typography: Record<TypeRole, TypeStyle>;
  colors: BrandColor[];
  visual: BrandVisual;
  promptTemplates: BrandPromptTemplate[];
  logoPath: string;
  logoName: string;
  logoUrl: string | null;
  sourceNote: string;
  updatedAt: string;
  approvedAt: string | null;
};

export type ClientBrandView = {
  tenantName: string;
  brand: ClientBrand | null;
};

export const TYPE_ROLES: TypeRole[] = ["h1", "h2", "h3", "body"];

export const TYPE_ROLE_LABELS: Record<TypeRole, string> = {
  h1: "H1",
  h2: "H2",
  h3: "H3",
  body: "Body",
};

export const COLOR_ROLES = [
  { value: "primary", label: "Primair" },
  { value: "background", label: "Achtergrond" },
  { value: "secondary", label: "Ondersteunend" },
  { value: "accent", label: "Accent" },
  { value: "text", label: "Tekst" },
  { value: "support", label: "Support" },
] as const;

export const BRAND_MIGRATION =
  "Pas migratie 20260330134700 toe in de Supabase SQL-editor, na 20260330134600.";

export function emptyTypeStyle(): TypeStyle {
  return { family: "", weight: "400", size: "", lineHeight: "", mobileSize: "", mobileLineHeight: "", sample: "" };
}

export function emptyTypography(): Record<TypeRole, TypeStyle> {
  return {
    h1: { ...emptyTypeStyle(), size: "48", lineHeight: "56", mobileSize: "32", mobileLineHeight: "40", weight: "400" },
    h2: { ...emptyTypeStyle(), size: "32", lineHeight: "40", mobileSize: "26", mobileLineHeight: "34", weight: "400" },
    h3: { ...emptyTypeStyle(), size: "24", lineHeight: "32", mobileSize: "20", mobileLineHeight: "28", weight: "600" },
    body: { ...emptyTypeStyle(), size: "16", lineHeight: "26", mobileSize: "16", mobileLineHeight: "26", weight: "400" },
  };
}

export function emptyVisual(): BrandVisual {
  return { tags: [], do: "", avoid: "", stylePrompt: "" };
}
