import { describe, expect, it } from "vitest";
import { canActivateCharacterForNano, nanoReferencePaths } from "@/lib/brand/character-nano-refs";

describe("character-nano-refs", () => {
  const assets = {
    face: "t/c/face.jpg",
    front: "t/c/front.jpg",
    side: "t/c/side.jpg",
    back: "t/c/back.jpg",
    contingency: "t/c/sheet.jpg",
  };

  it("picks face first and caps at four references", () => {
    const paths = nanoReferencePaths({ assets });
    expect(paths.map((p) => p.slot)).toEqual(["face", "front", "side", "back"]);
  });

  it("requires face and at least two refs to activate", () => {
    expect(canActivateCharacterForNano({ assets: { ...assets, side: "", back: "", contingency: "" } })).toBe(true);
    expect(canActivateCharacterForNano({ assets: { ...assets, face: "", front: "" } })).toBe(false);
  });
});
