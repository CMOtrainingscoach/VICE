import { describe, expect, it } from "vitest";
import {
  decliningPages,
  deltaPercent,
  matchPageMetrics,
  normalizeUrlForMatch,
  strikingDistanceQueries,
  splitBrandQueries,
} from "@/lib/metrics/analyze";

describe("metrics analyze", () => {
  it("normalizes urls for matching", () => {
    expect(normalizeUrlForMatch("https://www.example.com/post/")).toBe("example.com/post");
  });

  it("finds striking distance queries", () => {
    const rows = strikingDistanceQueries({
      current: [
        { query: "a", clicks: 1, impressions: 100, ctr: 0.01, position: 12 },
        { query: "b", clicks: 1, impressions: 10, ctr: 0.01, position: 5 },
      ],
      previous: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.query).toBe("a");
  });

  it("splits brand queries", () => {
    const split = splitBrandQueries(
      [
        { query: "hardwig training", clicks: 1, impressions: 1, ctr: 0, position: 1 },
        { query: "netwerken tips", clicks: 1, impressions: 1, ctr: 0, position: 1 },
      ],
      ["hardwig"],
    );
    expect(split.brand).toHaveLength(1);
    expect(split.nonBrand).toHaveLength(1);
  });

  it("detects declining pages", () => {
    const out = decliningPages({
      current: [{ page: "https://x.com/a", clicks: 5, impressions: 0, ctr: 0, position: 0 }],
      previous: [{ page: "https://x.com/a", clicks: 20, impressions: 0, ctr: 0, position: 0 }],
    });
    expect(out).toHaveLength(1);
  });

  it("matches published url to gsc page", () => {
    const row = matchPageMetrics("https://blog.example.com/artikel", [
      { page: "https://www.blog.example.com/artikel", clicks: 3, impressions: 0, ctr: 0, position: 4 },
    ]);
    expect(row?.clicks).toBe(3);
  });

  it("computes delta percent", () => {
    expect(deltaPercent(80, 100)).toBe(-20);
  });
});
