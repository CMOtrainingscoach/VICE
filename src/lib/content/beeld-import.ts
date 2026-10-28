import { flattenBeeldDocument } from "@/lib/content/beeld-export";
import {
  beeldExportDimensions,
  beeldPresetById,
  type BeeldComposition,
} from "@/lib/content/beeld-types";
import type { ClientBrand } from "@/lib/brand/types";

export async function beeldCompositionToJpegFile(
  composition: BeeldComposition,
  clientBrand: ClientBrand | null,
): Promise<File> {
  if (composition.document.layers.filter((l) => l.visible).length === 0) {
    throw new Error("Deze compositie heeft geen zichtbare lagen.");
  }
  const preset = beeldPresetById(composition.presetId);
  const dims = beeldExportDimensions(composition.presetId, composition.imageQuality);
  const blob = await flattenBeeldDocument({
    document: composition.document,
    preset,
    exportWidth: dims.width,
    exportHeight: dims.height,
    logoUrl: clientBrand?.logoUrl,
    typography: clientBrand?.typography ?? {},
  });
  const safeName = composition.title.replace(/\s+/g, "-").slice(0, 40) || "beeld";
  return new File([blob], `${safeName}.jpg`, { type: "image/jpeg" });
}
