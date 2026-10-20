import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatGoogleAdsError, googleAdsPublicStatus } from "@/lib/integrations/google-ads";

const ENV_KEYS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_ADS_DEVELOPER_TOKEN",
  "GOOGLE_ADS_CUSTOMER_ID",
  "GOOGLE_ADS_REFRESH_TOKEN",
] as const;

function snapshotEnv() {
  return Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]])) as Record<
    (typeof ENV_KEYS)[number],
    string | undefined
  >;
}

describe("googleAdsPublicStatus", () => {
  let saved: Record<(typeof ENV_KEYS)[number], string | undefined>;

  beforeEach(() => {
    saved = snapshotEnv();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("is configured without developer token when OAuth, customer and refresh are set", () => {
    process.env.GOOGLE_CLIENT_ID = "cid";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    process.env.GOOGLE_ADS_CUSTOMER_ID = "1234567890";
    process.env.GOOGLE_ADS_REFRESH_TOKEN = "refresh";
    delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN;

    const status = googleAdsPublicStatus();
    expect(status.configured).toBe(true);
    expect(status.hasLegacyDeveloperToken).toBe(false);
  });

  it("formats Google Ads failure objects", () => {
    expect(
      formatGoogleAdsError({
        errors: [{ message: "User does not have permission", error_code: { authorization_error: 2 } }],
      }),
    ).toContain("User does not have permission");
  });

  it("is not configured when refresh token is missing", () => {
    process.env.GOOGLE_CLIENT_ID = "cid";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    process.env.GOOGLE_ADS_CUSTOMER_ID = "1234567890";
    delete process.env.GOOGLE_ADS_REFRESH_TOKEN;

    expect(googleAdsPublicStatus().configured).toBe(false);
  });
});
