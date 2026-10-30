import type { AdConcept, AdCopyPayload } from "@/lib/content/ad-types";

export type AdExportManifest = {
  exportedAt: string;
  viceVersion: "2a";
  concept: {
    id: string;
    internalName: string;
    platform: string;
    format: string;
    metaPlacements: string[];
    status: string;
    tags: string[];
    multiLanguageEnabled: boolean;
    primaryLanguage: string;
    legalReviewRequired: boolean;
    legalReviewCleared: boolean;
    legalNote: string;
    payload: AdCopyPayload;
    localePayloads: Record<string, AdCopyPayload>;
    assets: { id: string; fileName: string; altText: string; mimeType: string; storagePath: string }[];
  };
};

export function buildAdExportManifest(input: {
  concept: AdConcept;
  internalName: string;
  status: string;
  metaPlacements: string[];
  tags: string[];
  multiLanguageEnabled: boolean;
  primaryLanguage: string;
  legalReviewRequired: boolean;
  legalReviewCleared: boolean;
  legalNote: string;
  payload: AdCopyPayload;
  localePayloads: Record<string, AdCopyPayload>;
}): AdExportManifest {
  const safeBase = (input.internalName || "advertentie").replace(/[^\w\-]+/g, "_");
  return {
    exportedAt: new Date().toISOString(),
    viceVersion: "2a",
    concept: {
      id: input.concept.id,
      internalName: input.internalName,
      platform: input.concept.platform,
      format: input.concept.format,
      metaPlacements: input.metaPlacements,
      status: input.status,
      tags: input.tags,
      multiLanguageEnabled: input.multiLanguageEnabled,
      primaryLanguage: input.primaryLanguage,
      legalReviewRequired: input.legalReviewRequired,
      legalReviewCleared: input.legalReviewCleared,
      legalNote: input.legalNote,
      payload: input.payload,
      localePayloads: input.localePayloads,
      assets: input.concept.assets.map((asset, index) => {
        const ext = asset.mimeType.includes("jpeg")
          ? "jpg"
          : asset.mimeType.includes("webp")
            ? "webp"
            : "png";
        return {
          id: asset.id,
          fileName: `${safeBase}_${index + 1}.${ext}`,
          altText: asset.altText,
          mimeType: asset.mimeType,
          storagePath: asset.storagePath,
        };
      }),
    },
  };
}

function extFromMime(mime: string) {
  if (mime.includes("jpeg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  return "png";
}

export async function downloadAdConceptZip(input: {
  manifest: AdExportManifest;
  assets: { fileName: string; url: string | null }[];
  downloadBaseName: string;
}): Promise<void> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(input.manifest, null, 2));
  zip.file("README.txt", [
    "VICE advertentie-export (fase 2a)",
    "",
    "manifest.json — alle copy en metadata",
    "assets/ — beeldbestanden (indien aanwezig)",
    "",
    "Signed URLs in manifest zijn tijdelijk; gebruik de bestanden in assets/ voor archief.",
  ].join("\n"));

  const folder = zip.folder("assets");
  let index = 0;
  for (const asset of input.assets) {
    if (!asset.url) continue;
    try {
      const response = await fetch(asset.url);
      if (!response.ok) continue;
      const blob = await response.blob();
      const name = asset.fileName || `asset_${index + 1}.${extFromMime(blob.type || "image/png")}`;
      (folder ?? zip).file(name, blob);
      index += 1;
    } catch {
      // skip failed asset fetch
    }
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${input.downloadBaseName.replace(/[^\w\-]+/g, "_")}.zip`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadAdConceptJson(manifest: AdExportManifest, downloadBaseName: string) {
  const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${downloadBaseName.replace(/[^\w\-]+/g, "_")}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
