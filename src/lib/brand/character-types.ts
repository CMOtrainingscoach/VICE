export type BrandCharacterReadyStatus = "draft" | "ready" | "stale";

export type BrandCharacterAssetSlot = "face" | "front" | "side" | "back" | "contingency";

export type BrandCharacterAssets = Record<BrandCharacterAssetSlot, string>;

export type BrandCharacter = {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  visualPrompt: string;
  assets: BrandCharacterAssets;
  assetUrls: Partial<Record<BrandCharacterAssetSlot, string>>;
  readyStatus: BrandCharacterReadyStatus;
  refsFingerprint: string;
  activatedAt: string | null;
  sortOrder: number;
  updatedAt: string;
  createdAt: string;
};

export const BRAND_CHARACTER_SLOTS: {
  id: BrandCharacterAssetSlot;
  label: string;
  hint: string;
}[] = [
  { id: "face", label: "Gezicht (close-up)", hint: "Frontaal portret, neutrale uitdrukking, goed belicht." },
  { id: "front", label: "Vooraanzicht", hint: "Volledig lichaam of torso, frontaal." },
  { id: "side", label: "Zijaanzicht", hint: "Profiel links of rechts." },
  { id: "back", label: "Achteraanzicht", hint: "Rug naar camera." },
  {
    id: "contingency",
    label: "Contingency sheet",
    hint: "Referentieblad: silhouet, proporties, kleding, kleuren en kenmerken.",
  },
];

export const BRAND_CHARACTER_MIGRATION =
  "Pas migratie 20260330136405 toe in de Supabase SQL-editor (brand-characters bucket + tabellen).";

export const BRAND_CHARACTER_CONTENT_MIGRATION =
  "Pas migratie 20260330136406 toe voor character-keuze in content (social/blog).";

export const BRAND_CHARACTER_NANO_MIGRATION =
  "Pas migratie 20260330136407 toe voor Nano-ready status en referenties in beeldgeneratie.";

export type BrandCharacterContentOption = {
  id: string;
  name: string;
  referenceCount: number;
  readyStatus?: BrandCharacterReadyStatus;
};
