import { describe, expect, it } from "vitest";
import { normalizeBlogDocument, toSentenceCaseHeading } from "@/lib/content/blog-ai";

describe("toSentenceCaseHeading", () => {
  it("zet Title Case om naar zinsvorm", () => {
    expect(toSentenceCaseHeading("Waarom Strakke Latex Pakjes In Films Een Blikvanger Zijn")).toBe(
      "Waarom strakke latex pakjes in films een blikvanger zijn",
    );
  });

  it("laat al correcte zinsvorm staan", () => {
    expect(toSentenceCaseHeading("Latex als visuele blikvanger")).toBe("Latex als visuele blikvanger");
  });

  it("behoudt bekende afkortingen", () => {
    expect(toSentenceCaseHeading("Hoe AI En SEO Samenwerken Voor Kmo")).toBe(
      "Hoe AI en SEO samenwerken voor KMO",
    );
  });
});

describe("normalizeBlogDocument", () => {
  it("forceert zinsvorm in title en h1", () => {
    const result = normalizeBlogDocument(
      "Waarom Strakke Latex Pakjes In Films Een Blikvanger Zijn",
      "<h1>Waarom Strakke Latex Pakjes In Films Een Blikvanger Zijn</h1><h2>Latex Als Visuele Blikvanger</h2><p>Tekst.</p>",
    );
    expect(result.title).toBe("Waarom strakke latex pakjes in films een blikvanger zijn");
    expect(result.bodyHtml).toContain("<h1>Waarom strakke latex pakjes in films een blikvanger zijn</h1>");
    expect(result.bodyHtml).toContain("<h2>Latex als visuele blikvanger</h2>");
  });
});
