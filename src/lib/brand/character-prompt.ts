import type { BrandCharacter } from "@/lib/brand/character-types";

/** Prompt block for image/video generation — reuse when content picks a brand character. */
export function buildBrandCharacterLockPrompt(character: Pick<BrandCharacter, "name" | "description" | "visualPrompt">): string {
  const lines = [
    "CHARACTER LOCK — reproduce this exact fictional person in every frame:",
    `Name: ${character.name.trim() || "Unnamed character"}`,
  ];
  if (character.visualPrompt.trim()) {
    lines.push("", "Visual identity (locked):", character.visualPrompt.trim());
  }
  if (character.description.trim()) {
    lines.push("", "Production notes:", character.description.trim());
  }
  lines.push(
    "",
    "Use the stored reference set (face close-up, front, side, back, contingency sheet) for face shape, hair, skin tone, age, body proportions, and wardrobe.",
    "Do not substitute a different person. No celebrity lookalikes. Keep identity consistent across scenes.",
  );
  return lines.join("\n");
}

export function brandCharacterReferencePaths(character: BrandCharacter): string[] {
  return Object.values(character.assets).filter((path) => Boolean(path?.trim()));
}
