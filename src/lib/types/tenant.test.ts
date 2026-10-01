import { describe, expect, it } from "vitest";
import { TENANT_STATUS_LABELS } from "@/lib/types/tenant";

describe("tenant status labels", () => {
  it("maps all workflow statuses to Dutch copy", () => {
    expect(TENANT_STATUS_LABELS.new).toBe("Nieuw");
    expect(TENANT_STATUS_LABELS.archived).toBe("Gearchiveerd");
    expect(Object.keys(TENANT_STATUS_LABELS)).toHaveLength(5);
  });
});
