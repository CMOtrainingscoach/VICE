export type CharacterImageReference = {
  slot: string;
  mime: string;
  bytes: Uint8Array;
};

export function mimeForNanoReference(mime: string): string {
  const normalized = mime.toLowerCase();
  if (normalized.includes("jpeg") || normalized.includes("jpg")) return "image/jpeg";
  if (normalized.includes("png")) return "image/png";
  if (normalized.includes("webp")) return "image/webp";
  return "image/jpeg";
}

export function buildNanoCharacterIntro(name: string, referenceCount: number): string {
  return [
    `The following ${referenceCount} image(s) define ONE fictional brand character named "${name}".`,
    "Keep face, hair, skin tone, age, body proportions, and wardrobe consistent with these references.",
    "Do not substitute a different person. No celebrity lookalikes.",
  ].join(" ");
}
