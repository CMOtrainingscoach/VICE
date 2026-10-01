import { describe, expect, it } from "vitest";
import { normalizeWebUrl } from "@/lib/pestel/pestel-web-evidence";

describe("normalizeWebUrl", () => {
  it("normalizes host and trailing slash", () => {
    expect(normalizeWebUrl("https://WWW.Example.com/path/")).toBe(
      "https://www.example.com/path",
    );
  });
});
