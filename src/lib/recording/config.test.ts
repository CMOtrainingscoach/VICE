import { describe, expect, it } from "vitest";
import { formatBytes, formatDuration } from "@/lib/recording/config";

describe("recording config helpers", () => {
  it("formats bytes", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(2_621_440)).toBe("2.5 MB");
  });

  it("formats duration", () => {
    expect(formatDuration(65_000)).toBe("1:05");
    expect(formatDuration(3_661_000)).toBe("1:01:01");
  });
});
