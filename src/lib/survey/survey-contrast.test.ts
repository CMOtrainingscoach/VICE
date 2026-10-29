import { describe, expect, it } from "vitest";
import { contrastRatio, pickReadableTextColor, resolveSurveyBrandColors } from "@/lib/survey/survey-contrast";

describe("resolveSurveyBrandColors", () => {
  it("forces readable text on low-contrast brand pairs", () => {
    const resolved = resolveSurveyBrandColors({
      primary: "#ffff00",
      text: "#ffff00",
      background: "#ffffff",
    });
    expect(contrastRatio(resolved.text, resolved.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(resolved.onPrimary, resolved.primary)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps readable text on dark backgrounds", () => {
    const resolved = resolveSurveyBrandColors({
      primary: "#333333",
      text: "#111111",
      background: "#0a0a0a",
    });
    expect(contrastRatio(resolved.text, resolved.background)).toBeGreaterThanOrEqual(4.5);
    expect(pickReadableTextColor(resolved.background)).toBe("#ffffff");
  });

  it("guarantees field text contrast", () => {
    const resolved = resolveSurveyBrandColors({
      primary: "#c9a227",
      text: "#c9a227",
      background: "#c9a227",
    });
    expect(contrastRatio(resolved.fieldText, resolved.fieldBackground)).toBeGreaterThanOrEqual(4.5);
  });
});
