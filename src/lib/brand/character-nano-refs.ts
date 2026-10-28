import type { BrandCharacter, BrandCharacterAssetSlot } from "@/lib/brand/character-types";

/** Nano Banana supports up to 4 character reference images. */
export const NANO_CHARACTER_REF_LIMIT = 4;

const NANO_REF_ORDER: BrandCharacterAssetSlot[] = ["face", "front", "side", "back", "contingency"];

export function nanoReferencePaths(character: Pick<BrandCharacter, "assets">): {
  slot: BrandCharacterAssetSlot;
  path: string;
}[] {
  const picked: { slot: BrandCharacterAssetSlot; path: string }[] = [];
  for (const slot of NANO_REF_ORDER) {
    const path = character.assets[slot]?.trim();
    if (!path) continue;
    picked.push({ slot, path });
    if (picked.length >= NANO_CHARACTER_REF_LIMIT) break;
  }
  return picked;
}

export function countCharacterReferences(character: Pick<BrandCharacter, "assets">): number {
  return Object.values(character.assets).filter((p) => Boolean(p?.trim())).length;
}

export function canActivateCharacterForNano(character: Pick<BrandCharacter, "assets">): boolean {
  return Boolean(character.assets.face?.trim()) && countCharacterReferences(character) >= 2;
}
