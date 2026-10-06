import type {
  BrandAsset,
  BrandColor,
  BrandFontAsset,
  BrandProfilePublished,
  BrandProfileWorkbench,
  BrandVersion,
  BrandVisual,
  BrandVoice,
  ColorRole,
  FieldOrigin,
  LogoKind,
  PromptTemplate,
  Provenance,
  ReferenceStatus,
  ReviewItem,
  ReviewProposal,
  SourceDocument,
  TypeStyle,
} from "@/lib/brand-profile/types";
import { emptyVisual, emptyVoice } from "@/lib/brand-profile/types";

type Raw = Record<string, unknown>;

export function mapBrandProfile(raw: Raw): BrandProfileWorkbench | BrandProfilePublished {
  if (raw.access === "published") {
    if (raw.empty === true || !raw.version) {
      throw new Error("empty-published");
    }
    const version = mapVersion(raw.version as Raw);
    return {
      access: "published",
      tenantName: text(raw.tenantName),
      version,
      styles: mapStyles(raw.styles),
      fonts: mapFonts(raw.fonts),
      colors: mapColors(raw.colors),
      assets: mapAssets(raw.assets),
      prompts: mapPrompts(raw.prompts),
    };
  }
  return {
    access: "edit",
    mode: raw.version ? "workbench" : "empty",
    tenantName: text(raw.tenantName),
    documents: mapDocuments(raw.documents),
    publishedVersionId: raw.publishedVersionId ? String(raw.publishedVersionId) : null,
    newerSource: mapNewer(raw.newerSource),
    version: raw.version ? mapVersion(raw.version as Raw) : null,
    styles: mapStyles(raw.styles),
    fonts: mapFonts(raw.fonts),
    colors: mapColors(raw.colors),
    assets: mapAssets(raw.assets),
    reviews: mapReviews(raw.reviews),
    prompts: mapPrompts(raw.prompts),
    provenance: mapProvenance(raw.provenance),
  };
}

function mapVersion(raw: Raw): BrandVersion {
  return {
    id: text(raw.id),
    versionNumber: number(raw.versionNumber),
    status: raw.status === "approved" || raw.status === "published" ? raw.status : "draft",
    updatedAt: text(raw.updatedAt),
    updatedByName: text(raw.updatedByName),
    brandName: text(raw.brandName),
    essence: text(raw.essence),
    positioning: text(raw.positioning),
    promise: text(raw.promise),
    audience: text(raw.audience),
    valuesText: text(raw.valuesText),
    voice: mapVoice(raw.voice),
    visual: mapVisual(raw.visual),
    sourceDocumentId: raw.sourceDocumentId ? String(raw.sourceDocumentId) : null,
    sourceStatus: raw.sourceStatus === "final" || raw.sourceStatus === "draft" ? raw.sourceStatus : null,
    sourceHash: text(raw.sourceHash),
    sourceSavedAt: raw.sourceSavedAt ? String(raw.sourceSavedAt) : null,
    importWarnings: strings(raw.importWarnings),
    notApplicable: strings(raw.notApplicable),
    approvedAt: raw.approvedAt ? String(raw.approvedAt) : null,
    publishedAt: raw.publishedAt ? String(raw.publishedAt) : null,
  };
}

function mapVoice(value: unknown): BrandVoice {
  const raw = (value && typeof value === "object" ? value : {}) as Raw;
  const channels = (raw.channels && typeof raw.channels === "object" ? raw.channels : {}) as Raw;
  const voice = emptyVoice();
  return {
    ...voice,
    summary: text(raw.summary),
    principles: text(raw.principles),
    address: text(raw.address),
    language: text(raw.language),
    formality: text(raw.formality),
    preferred: strings(raw.preferred),
    avoid: strings(raw.avoid),
    examples: text(raw.examples),
    channels: {
      website: text(channels.website),
      social: text(channels.social),
      email: text(channels.email),
      sales: text(channels.sales),
      service: text(channels.service),
    },
  };
}

function mapVisual(value: unknown): BrandVisual {
  const raw = (value && typeof value === "object" ? value : {}) as Raw;
  const visual = emptyVisual();
  return {
    ...visual,
    medium: text(raw.medium),
    subjects: text(raw.subjects),
    composition: text(raw.composition),
    light: text(raw.light),
    colorUse: text(raw.colorUse),
    materials: text(raw.materials),
    textures: text(raw.textures),
    mood: text(raw.mood),
    backgrounds: text(raw.backgrounds),
    camera: text(raw.camera),
    textSpace: text(raw.textSpace),
    summary: text(raw.summary),
    wanted: strings(raw.wanted),
    avoid: strings(raw.avoid),
  };
}

function mapStyles(value: unknown): TypeStyle[] {
  return list(value).map((raw) => ({
    id: text(raw.id),
    role: text(raw.role),
    family: text(raw.family),
    weight: text(raw.weight),
    italic: raw.italic === true,
    size: text(raw.size),
    unit: text(raw.unit),
    lineHeight: text(raw.lineHeight),
    letterSpacing: text(raw.letterSpacing),
    transform: text(raw.transform),
    usage: text(raw.usage),
    fallback: text(raw.fallback),
    sample: text(raw.sample),
    mobileSize: text(raw.mobileSize),
    mobileUnit: text(raw.mobileUnit),
    sort: number(raw.sort),
    archived: false,
  }));
}

function mapColors(value: unknown): BrandColor[] {
  return list(value).map((raw) => ({
    id: text(raw.id),
    name: text(raw.name),
    hex: text(raw.hex),
    rgb: text(raw.rgb),
    role: colorRole(text(raw.role)),
    note: text(raw.note),
    cmyk: text(raw.cmyk),
    pantone: text(raw.pantone),
    sort: number(raw.sort),
    archived: false,
  }));
}

function mapFonts(value: unknown): BrandFontAsset[] {
  return list(value).map((raw) => ({
    id: text(raw.id),
    name: text(raw.name),
    path: text(raw.path),
    weights: text(raw.weights),
    italic: raw.italic === true,
    variable: raw.variable === true,
    origin: text(raw.origin),
    licenseNote: text(raw.licenseNote),
    exportAllowed: raw.exportAllowed === true,
    useConfirmed: raw.useConfirmed === true,
    url: null,
  }));
}

function mapAssets(value: unknown): BrandAsset[] {
  return list(value).map((raw) => ({
    id: text(raw.id),
    kind: logoKind(text(raw.kind)),
    name: text(raw.name),
    path: text(raw.path),
    format: text(raw.format),
    width: text(raw.width),
    height: text(raw.height),
    usage: text(raw.usage),
    background: text(raw.background),
    minSize: text(raw.minSize),
    clearSpace: text(raw.clearSpace),
    restrictions: text(raw.restrictions),
    referenceStatus: referenceStatus(text(raw.referenceStatus)),
    exportAllowed: raw.exportAllowed === true,
    url: null,
    missingNote: text(raw.missingNote),
  }));
}

function mapReviews(value: unknown): ReviewItem[] {
  return list(value).map((raw) => ({
    id: text(raw.id),
    section: text(raw.section),
    label: text(raw.label),
    origin: origin(text(raw.origin)),
    sectionPath: text(raw.sectionPath),
    passage: text(raw.passage),
    proposal: mapProposal(raw.proposal),
    decision: raw.decision === "accepted" || raw.decision === "dismissed" ? raw.decision : "pending",
  }));
}

function mapProposal(value: unknown): ReviewProposal | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Raw;
  const kind = text(raw.kind);
  if (kind === "field") return { kind, key: text(raw.key), value: text(raw.value) };
  if (kind === "color") return { kind, name: text(raw.name), hex: text(raw.hex), role: colorRole(text(raw.role)) };
  if (kind === "font") return { kind, family: text(raw.family), role: text(raw.role), size: text(raw.size), unit: text(raw.unit) };
  if (kind === "voice" || kind === "visual") return { kind, value: text(raw.value) };
  return null;
}

function mapPrompts(value: unknown): PromptTemplate[] {
  return list(value).map((raw) => ({
    id: text(raw.id),
    name: text(raw.name),
    purpose: text(raw.purpose),
    situation: text(raw.situation),
    body: text(raw.body),
    exclusions: text(raw.exclusions),
    composed: raw.composed === true,
    sourcePassage: text(raw.sourcePassage),
    archived: false,
    updatedAt: text(raw.updatedAt),
  }));
}

function mapProvenance(value: unknown): Provenance[] {
  return list(value).map((raw) => ({
    fieldKey: text(raw.fieldKey),
    origin: origin(text(raw.origin)),
    documentId: raw.documentId ? String(raw.documentId) : null,
    contentHash: text(raw.contentHash),
    sectionPath: text(raw.sectionPath),
    passage: text(raw.passage),
    importedAt: text(raw.importedAt),
    method: text(raw.method),
  }));
}

function mapDocuments(value: unknown): SourceDocument[] {
  return list(value).map((raw) => ({
    id: text(raw.id),
    status: raw.status === "final" ? "final" : "draft",
    savedAt: text(raw.savedAt),
    brandVersionId: text(raw.brandVersionId),
  }));
}

function mapNewer(value: unknown): BrandProfileWorkbench["newerSource"] {
  if (!value || typeof value !== "object") return null;
  const raw = value as Raw;
  if (!raw.id) return null;
  return { id: text(raw.id), status: raw.status === "final" ? "final" : "draft", savedAt: text(raw.savedAt) };
}

function list(value: unknown): Raw[] {
  return Array.isArray(value) ? value.filter((item): item is Raw => Boolean(item) && typeof item === "object") : [];
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function number(value: unknown): number {
  return typeof value === "number" ? value : Number(value) || 0;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function colorRole(value: string): ColorRole {
  if (value === "primary" || value === "secondary" || value === "accent" || value === "background" || value === "text" || value === "support") return value;
  return "unknown";
}

function logoKind(value: string): LogoKind {
  const kinds: LogoKind[] = ["primary", "alternate", "wordmark", "mark", "light", "dark", "mono", "favicon", "reference"];
  return kinds.includes(value as LogoKind) ? (value as LogoKind) : "primary";
}

function referenceStatus(value: string): ReferenceStatus {
  if (value === "approved_reference" || value === "inspiration" || value === "ai_example" || value === "official") return value;
  return "official";
}

function origin(value: string): FieldOrigin {
  if (value === "established" || value === "observed" || value === "recommended" || value === "hypothesis" || value === "unknown" || value === "strategist") return value;
  return "unknown";
}
