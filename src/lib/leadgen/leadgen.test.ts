import { describe, expect, it } from "vitest";
import { haversineDistanceKm } from "@/lib/leadgen/haversine";
import { preserveContactStatus } from "@/lib/leadgen/prospect-merge";
import { isPrivateIp } from "@/lib/leadgen/safe-fetch";
import { normalizeWebsiteHost } from "@/lib/leadgen/web-search";

describe("haversineDistanceKm", () => {
  it("returns ~0 for identical points", () => {
    expect(haversineDistanceKm(51.32, 4.94, 51.32, 4.94)).toBeLessThan(0.01);
  });

  it("computes a plausible distance between Turnhout and Antwerp", () => {
    const km = haversineDistanceKm(51.3225, 4.9447, 51.2194, 4.4025);
    expect(km).toBeGreaterThan(35);
    expect(km).toBeLessThan(55);
  });
});

describe("isPrivateIp", () => {
  it("blocks loopback and RFC1918", () => {
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("10.0.0.1")).toBe(true);
    expect(isPrivateIp("192.168.1.1")).toBe(true);
    expect(isPrivateIp("169.254.0.1")).toBe(true);
  });

  it("allows public IPv4", () => {
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("1.1.1.1")).toBe(false);
  });
});

describe("normalizeWebsiteHost", () => {
  it("dedupes hosts by stripping www", () => {
    expect(normalizeWebsiteHost("https://www.Example.com/path")).toBe("example.com");
    expect(normalizeWebsiteHost("https://example.com/")).toBe("example.com");
  });
});

describe("preserveContactStatus", () => {
  it("keeps existing status when prospect already exists", () => {
    expect(preserveContactStatus("contacted", "to_contact")).toBe("contacted");
  });

  it("uses incoming status for new prospects", () => {
    expect(preserveContactStatus(null, "unreachable")).toBe("unreachable");
    expect(preserveContactStatus(undefined, undefined)).toBe("to_contact");
  });
});
