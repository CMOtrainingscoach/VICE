import { z } from "zod";

export function normalizeVatNumber(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s.\-]/g, "");
}

function withFormDefaults(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return input;
  const o = input as Record<string, unknown>;
  return {
    name: o.name ?? "",
    website: o.website ?? "",
    vatNumber: o.vatNumber ?? "",
    contactName: o.contactName ?? "",
    contactEmail: o.contactEmail ?? "",
    auditGoal: o.auditGoal ?? "",
    language: o.language ?? "nl",
  };
}

export const createTenantSchema = z.preprocess(
  withFormDefaults,
  z.object({
    name: z.string().trim().min(1, "Bedrijfsnaam is verplicht"),
    website: z
      .string()
      .trim()
      .refine((v) => v === "" || z.string().url().safeParse(v).success, {
        message: "Ongeldige website-URL",
      }),
    vatNumber: z
      .string()
      .transform(normalizeVatNumber)
      .refine((v) => v === "" || /^BE[0-9]{10}$/.test(v), {
        message: "BTW-nummer: gebruik formaat BE0123456789",
      }),
    contactName: z.string().trim(),
    contactEmail: z
      .string()
      .trim()
      .refine((v) => v === "" || z.string().email().safeParse(v).success, {
        message: "Ongeldig e-mailadres",
      }),
    auditGoal: z.string().trim(),
    language: z.string().trim().min(2),
  }),
);

export const updateTenantSchema = createTenantSchema;

export const deletionSchema = z.object({
  tenantId: z.string().uuid(),
  confirmPhrase: z.literal("VERWIJDER"),
});

export const inviteSchema = z.object({
  tenantId: z.string().uuid(),
  email: z.string().trim().email(),
});
