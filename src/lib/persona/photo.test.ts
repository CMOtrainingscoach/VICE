import { describe, expect, it } from "vitest";
import { isUploadedPortrait, sniffPersonaPhoto } from "@/lib/persona/photo";

describe("sniffPersonaPhoto", () => {
  it("herkent jpeg, png en webp aan de bestandsbytes", () => {
    const jpeg = new Uint8Array(12);
    jpeg.set([0xff, 0xd8, 0xff]);
    const png = new Uint8Array(12);
    png.set([0x89, 0x50, 0x4e, 0x47]);
    const webp = new Uint8Array(12);
    webp.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(sniffPersonaPhoto(jpeg)?.ext).toBe("jpg");
    expect(sniffPersonaPhoto(png)?.mime).toBe("image/png");
    expect(sniffPersonaPhoto(webp)?.ext).toBe("webp");
  });

  it("weigert een te kort of onbekend bestand", () => {
    expect(sniffPersonaPhoto(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(sniffPersonaPhoto(new Uint8Array(12))).toBeNull();
    expect(isUploadedPortrait("upload")).toBe(true);
    expect(isUploadedPortrait("openai")).toBe(false);
  });
});
