import { describe, expect, it } from "vitest";
import { createTenantSchema } from "@/modules/clients/schema";

describe("createTenantSchema", () => {
  it("accepts minimal payload without vatNumber (legacy client)", () => {
    const result = createTenantSchema.safeParse({
      name: "Rita Lemmens",
      website: "https://example.com",
      contactName: "Rita",
      contactEmail: "rita@example.com",
      auditGoal: "Doel",
      language: "nl",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.vatNumber).toBe("");
    }
  });

  it("normalizes Belgian VAT", () => {
    const result = createTenantSchema.safeParse({
      name: "Test",
      vatNumber: "be 0123.456.789",
      website: "",
      contactName: "",
      contactEmail: "",
      auditGoal: "",
      language: "nl",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.vatNumber).toBe("BE0123456789");
    }
  });
});
