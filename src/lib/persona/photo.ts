const JPEG = { mime: "image/jpeg", ext: "jpg" } as const;
const PNG = { mime: "image/png", ext: "png" } as const;
const WEBP = { mime: "image/webp", ext: "webp" } as const;

export const PERSONA_PHOTO_MAX_BYTES = 4 * 1024 * 1024;

export type PersonaPhotoKind = typeof JPEG | typeof PNG | typeof WEBP;

export function sniffPersonaPhoto(bytes: Uint8Array): PersonaPhotoKind | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return JPEG;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return PNG;
  const riff = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
  const webp = bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  if (riff && webp) return WEBP;
  return null;
}

export function isUploadedPortrait(provider?: string | null): boolean {
  return provider === "upload";
}
