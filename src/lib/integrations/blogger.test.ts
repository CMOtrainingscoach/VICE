import { describe, expect, it } from "vitest";
import { createOAuthState, parseOAuthState, toBloggerHtml } from "./blogger";

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
