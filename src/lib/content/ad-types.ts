export type AdPlatform = "google_search" | "meta";
export type AdFormat = "rsa" | "single_image" | "carousel";
export type AdStatus = "draft" | "ready_for_export" | "archived";
export type MetaPlacement = "facebook" | "instagram";

export type GoogleRsaPayload = {
  finalUrl: string;
  headlines: string[];
  descriptions: string[];
  path1: string;
  path2: string;
};

export type MetaSinglePayload = {
  primaryText: string;
  headline: string;
  description: string;
  linkUrl: string;
  cta: string;
};

export type MetaCarouselCard = {
  id: string;
  headline: string;
  description: string;
  linkUrl: string;
};

export type MetaCarouselPayload = {
  primaryText: string;
  linkUrl: string;
  cards: MetaCarouselCard[];
};

export type AdCopyPayload = GoogleRsaPayload | MetaSinglePayload | MetaCarouselPayload;

export type AdConceptAsset = {
  id: string;
  storagePath: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  kind: "upload" | "beeld";
  altText: string;
  sortOrder: number;
  createdAt: string;
  url: string | null;
};

export type AdFolder = {
  id: string;
  name: string;
  sortOrder: number;
};

export type AdConcept = {
  id: string;
  tenantId: string;
  folderId: string | null;
  folderName: string | null;
  internalName: string;
  platform: AdPlatform;
  format: AdFormat;
  metaPlacements: MetaPlacement[];
  status: AdStatus;
  multiLanguageEnabled: boolean;
  primaryLanguage: string;
  legalReviewRequired: boolean;
  legalReviewCleared: boolean;
  legalNote: string;
  payload: AdCopyPayload;
  localePayloads: Record<string, AdCopyPayload>;
  tags: string[];
  templateKey: string;
  beeldCompositionId: string | null;
  selectedAssetId: string | null;
  selectedAsset: AdConceptAsset | null;
  assets: AdConceptAsset[];
  brandId: string | null;
  brandVersionNumber: number | null;
  brandVoiceSnapshot: string;
  brandVisualSnapshot: Record<string, unknown>;
  buyerPersonaId: string | null;
  brandCharacterId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdConceptSummary = {
  id: string;
  internalName: string;
  platform: AdPlatform;
  format: AdFormat;
  status: AdStatus;
  folderId: string | null;
  tags: string[];
  legalReviewRequired: boolean;
  legalReviewCleared: boolean;
  updatedAt: string;
};

export const AD_MIGRATION =
  "Pas migratie 20260330136414_ad_concepts.sql toe in Supabase (na 20260330136413).";

export const AD_PLATFORMS: { id: AdPlatform; label: string }[] = [
  { id: "google_search", label: "Google Search" },
  { id: "meta", label: "Meta (Facebook / Instagram)" },
];

export const META_PLACEMENTS: { id: MetaPlacement; label: string }[] = [
  { id: "facebook", label: "Facebook" },
  { id: "instagram", label: "Instagram" },
];

export const AD_FORMATS: { id: AdFormat; label: string; platforms: AdPlatform[] }[] = [
  { id: "rsa", label: "Responsive search ad", platforms: ["google_search"] },
  { id: "single_image", label: "Enkel beeld", platforms: ["meta"] },
  { id: "carousel", label: "Carrousel", platforms: ["meta"] },
];

export const AD_STATUSES: { id: AdStatus; label: string }[] = [
  { id: "draft", label: "Concept" },
  { id: "ready_for_export", label: "Klaar voor export" },
  { id: "archived", label: "Archief" },
];

export const RSA_LIMITS = {
  headlineMax: 30,
  headlineMaxCount: 15,
  descriptionMax: 90,
  descriptionMaxCount: 4,
  pathMax: 15,
} as const;

export const META_LIMITS = {
  primaryTextMax: 220,
  headlineMax: 40,
  descriptionMax: 30,
  cardDescriptionMax: 20,
  carouselCardsMax: 10,
} as const;

export function emptyGoogleRsaPayload(): GoogleRsaPayload {
  return {
    finalUrl: "",
    headlines: ["", "", ""],
    descriptions: ["", ""],
    path1: "",
    path2: "",
  };
}

export function emptyMetaSinglePayload(): MetaSinglePayload {
  return {
    primaryText: "",
    headline: "",
    description: "",
    linkUrl: "",
    cta: "",
  };
}

export function emptyMetaCarouselPayload(): MetaCarouselPayload {
  return {
    primaryText: "",
    linkUrl: "",
    cards: [
      { id: crypto.randomUUID(), headline: "", description: "", linkUrl: "" },
      { id: crypto.randomUUID(), headline: "", description: "", linkUrl: "" },
    ],
  };
}

export function defaultPayload(platform: AdPlatform, format: AdFormat): AdCopyPayload {
  if (platform === "google_search" && format === "rsa") return emptyGoogleRsaPayload();
  if (platform === "meta" && format === "single_image") return emptyMetaSinglePayload();
  if (platform === "meta" && format === "carousel") return emptyMetaCarouselPayload();
  return emptyGoogleRsaPayload();
}

export function isGoogleRsa(payload: AdCopyPayload): payload is GoogleRsaPayload {
  return "headlines" in payload && Array.isArray((payload as GoogleRsaPayload).headlines);
}

export function isMetaSingle(payload: AdCopyPayload): payload is MetaSinglePayload {
  return "primaryText" in payload && !("cards" in payload);
}

export function isMetaCarousel(payload: AdCopyPayload): payload is MetaCarouselPayload {
  return "cards" in payload && Array.isArray((payload as MetaCarouselPayload).cards);
}

export function platformFormatLabel(platform: AdPlatform, format: AdFormat): string {
  const p = AD_PLATFORMS.find((item) => item.id === platform)?.label ?? platform;
  const f = AD_FORMATS.find((item) => item.id === format)?.label ?? format;
  return `${p} · ${f}`;
}
