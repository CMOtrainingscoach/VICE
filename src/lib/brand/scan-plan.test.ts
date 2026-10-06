import { describe, expect, it } from "vitest";
import { findingIsGrounded, selectScanTargets } from "@/lib/brand/scan-plan";

describe("selectScanTargets", () => {
  it("kiest homepage en een beperkte set relevante interne pagina's", () => {
    const targets = selectScanTargets("https://studio.be/", [
      "https://studio.be/over-ons",
      "https://ander-merk.be/about",
      "https://studio.be/diensten",
      "https://studio.be/cases",
      "https://studio.be/contact",
      "https://studio.be/logo.svg",
      "https://studio.be/blog/een-artikel",
    ]);
    expect(targets.map((item) => item.role)).toEqual(["home", "about", "offer", "proof", "contact", "other"]);
    expect(targets.every((item) => item.url.includes("studio.be"))).toBe(true);
  });
});

describe("findingIsGrounded", () => {
  it("weigert een verzonnen percentage dat niet in de bron staat", () => {
    expect(findingIsGrounded("De homepage belooft persoonlijke begeleiding.", "persoonlijke begeleiding voor groeibedrijven")).toBe(true);
    expect(findingIsGrounded("72% van de bezoekers converteert.", "persoonlijke begeleiding")).toBe(false);
    expect(findingIsGrounded("Te kort", "te kort voor een bevinding")).toBe(false);
  });
});
