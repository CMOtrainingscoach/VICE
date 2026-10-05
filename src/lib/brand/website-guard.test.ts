import { describe, expect, it } from "vitest";
import { assertPublicWebsiteUrl, isPrivateIp } from "@/lib/brand/website-guard";

describe("website-guard", () => {
  it("weigert privénetwerken, metadata en http", () => {
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("10.1.2.3")).toBe(true);
    expect(isPrivateIp("192.168.0.4")).toBe(true);
    expect(isPrivateIp("172.16.0.1")).toBe(true);
    expect(isPrivateIp("169.254.169.254")).toBe(true);
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(() => assertPublicWebsiteUrl("http://example.com")).toThrow(/https/);
    expect(() => assertPublicWebsiteUrl("https://169.254.169.254/latest")).toThrow(/privé/i);
    expect(() => assertPublicWebsiteUrl("https://localhost/admin")).toThrow(/privé/i);
  });
});
