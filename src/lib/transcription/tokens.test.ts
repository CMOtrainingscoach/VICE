import { describe, expect, it } from "vitest";
import {
  estimateTokenStorageBytes,
  textToTokenIds,
  tokenIdsToText,
} from "@/lib/transcription/tokens";

describe("transcription tokens", () => {
  it("round-trips text", () => {
    const text = "VICE meeting notities";
    const ids = textToTokenIds(text);
    expect(ids.length).toBeGreaterThan(0);
    expect(tokenIdsToText(ids)).toBe(text);
  });

  it("estimates storage", () => {
    expect(estimateTokenStorageBytes(1000)).toBe(4000);
  });
});
