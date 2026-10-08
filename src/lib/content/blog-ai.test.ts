import { describe, expect, it } from "vitest";
import {
  hydrateInlineVisualUrls,
  normalizeBlogDocument,
  toBlogExportHtml,
  toSentenceCaseHeading,
} from "@/lib/content/blog-ai";

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

describe("blog more + inline visuals", () => {
  it("zet more-break om naar <!--more-->", () => {
    const html =
      "<p>Intro</p><div class=\"blog-more-break\" data-blog-more=\"true\"><span>Meer</span></div><p>Rest</p>";
    expect(toBlogExportHtml(html)).toContain("<!--more-->");
    expect(toBlogExportHtml(html)).not.toContain("blog-more-break");
  });

  it("ververst inline visual urls", () => {
    const html =
      '<figure class="blog-inline-visual" data-visual-id="v1"><img data-visual-id="v1" src="old" alt="x" /></figure>';
    const next = hydrateInlineVisualUrls(html, [{ id: "v1", url: "https://cdn.example/new.png", altText: "Alt" }]);
    expect(next).toContain('src="https://cdn.example/new.png"');
    expect(next).toContain('alt="Alt"');
  });
});
