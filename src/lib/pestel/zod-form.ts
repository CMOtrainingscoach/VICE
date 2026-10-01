import { z } from "zod";

/** Coerce null/undefined from JSON or forms to strings before Zod string checks. */
export function zodString(max: number, min = 0) {
  const base = min > 0 ? z.string().min(min).max(max) : z.string().max(max);
  return z.preprocess((v) => (v == null ? "" : String(v)), base);
}

export function formatZodIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Validatie mislukt";
  const path = issue.path.length ? issue.path.join(".") : "invoer";
  return `${path}: ${issue.message}`;
}
