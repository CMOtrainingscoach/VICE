import type { LeadgenContactStatus } from "@/lib/leadgen/types";

/** Mirrors SQL: existing prospect rows keep contact_status on re-insert. */
export function preserveContactStatus(
  existing: LeadgenContactStatus | null | undefined,
  incoming: LeadgenContactStatus | null | undefined,
): LeadgenContactStatus {
  if (existing) return existing;
  return incoming ?? "to_contact";
}
