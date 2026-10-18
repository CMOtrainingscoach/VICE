import { describe, expect, it } from "vitest";
import {
  createOAuthState,
  parseOAuthState,
  rewriteHtmlImageSources,
  toBloggerHtml,
  toFullResolutionBloggerImageUrl,
} from "./blogger";

describe("toBloggerHtml", () => {
  it("converts more-break and strips editor chrome", () => {
    const html = [
      "<h1>Titel</h1>",
      '<div class="blog-more-break" data-blog-more="true"><span>Meer</span><button type="button">×</button></div>',
      "<p>Rest</p>",
      '<figure class="blog-inline-visual" data-visual-id="v1" contenteditable="false">',
      '<button type="button">×</button>',
      '<img data-visual-id="v1" src="https://cdn.example/a.png" alt="Alt" />',
      "</figure>",
    ].join("");
    const out = toBloggerHtml(html);
    expect(out).toContain("<!--more-->");
    expect(out).toContain('<img src="https://cdn.example/a.png" alt="Alt" />');
    expect(out).not.toContain("button");
    expect(out).not.toContain("contenteditable");
    expect(out).not.toContain("data-visual-id");
  });
});

describe("oauth state", () => {
  it("roundtrips tenant id", () => {
    process.env.GOOGLE_CLIENT_SECRET = "test-secret";
    const state = createOAuthState("tenant-123");
    expect(parseOAuthState(state)).toEqual({ tenantId: "tenant-123" });
  });
});

describe("blogger image urls", () => {
  it("normalizes to s0 full resolution", () => {
    const input =
      "https://lh3.googleusercontent.com/-abc/XYZ/AAAAAAAA/hash/s640/photo.jpg";
    expect(toFullResolutionBloggerImageUrl(input)).toBe(
      "https://lh3.googleusercontent.com/-abc/XYZ/AAAAAAAA/hash/s0/photo.jpg",
    );
  });

  it("rewrites img sources", () => {
    const html = '<p><img src="https://old.example/a.png" alt="x" /></p>';
    const map = new Map([["https://old.example/a.png", "https://bp.blogspot.com/a.png"]]);
    expect(rewriteHtmlImageSources(html, map)).toContain('src="https://bp.blogspot.com/a.png"');
  });
});
