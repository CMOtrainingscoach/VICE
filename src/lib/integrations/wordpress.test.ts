import { describe, expect, it } from "vitest";
import { normalizeWordPressSiteUrl, parseWordPressPublic } from "@/lib/integrations/wordpress";

describe("normalizeWordPressSiteUrl", () => {
  it("adds https and strips trailing slash", () => {
    expect(normalizeWordPressSiteUrl("example.com/")).toBe("https://example.com");
  });

  it("strips wp-admin suffix", () => {
    expect(normalizeWordPressSiteUrl("https://example.com/wp-admin")).toBe("https://example.com");
  });
});

describe("parseWordPressPublic", () => {
  it("reads site fields", () => {
    const status = parseWordPressPublic({
      connected: true,
      status: "connected",
      accountEmail: "editor",
      siteUrl: "https://example.com",
      siteName: "Example",
      lastError: "",
    });
    expect(status.connected).toBe(true);
    expect(status.siteUrl).toBe("https://example.com");
  });
});
