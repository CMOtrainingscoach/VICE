import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildDataforSeoLocation,
  dataforSeoPublicStatus,
} from "@/lib/integrations/dataforseo";

describe("dataforSeoPublicStatus", () => {
  const keys = ["DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD"] as const;
  let saved: Record<(typeof keys)[number], string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(keys.map((k) => [k, process.env[k]])) as typeof saved;
  });

  afterEach(() => {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("is configured when login and password are set", () => {
    process.env.DATAFORSEO_LOGIN = "user@example.com";
    process.env.DATAFORSEO_PASSWORD = "secret";
    expect(dataforSeoPublicStatus().configured).toBe(true);
  });

  it("is not configured when password is missing", () => {
    process.env.DATAFORSEO_LOGIN = "user@example.com";
    delete process.env.DATAFORSEO_PASSWORD;
    expect(dataforSeoPublicStatus().configured).toBe(false);
  });
});

describe("buildDataforSeoLocation", () => {
  it("uses country code for national scope", () => {
    expect(buildDataforSeoLocation({ countryCode: "BE", scope: "national" })).toEqual({
      location_code: 2056,
    });
  });

  it("uses city name for local scope", () => {
    expect(
      buildDataforSeoLocation({ countryCode: "NL", scope: "local", city: "Utrecht" }),
    ).toEqual({ location_name: "Utrecht,Netherlands" });
  });
});
