import type { SurveyNode } from "@/lib/survey/survey-types";

export function formatSurveyAnswerDisplay(value: unknown, node: SurveyNode): string {
  if (value === undefined || value === null || value === "") return "—";

  if (node.type === "contact" && typeof value === "object" && value !== null) {
    const c = value as { name?: string; email?: string };
    const line = [c.name, c.email].filter(Boolean).join(" · ");
    return line || "—";
  }

  if (node.type === "rating") {
    const n = Number(value);
    return Number.isNaN(n) ? String(value) : String(n);
  }

  const options = node.data.options;
  if (options?.length) {
    const byId = new Map(options.map((o) => [o.id, o.label || o.id]));
    if (Array.isArray(value)) {
      const labels = value.map((id) => byId.get(String(id)) ?? String(id));
      return labels.length ? labels.join(", ") : "—";
    }
    if (typeof value === "string") {
      return byId.get(value) ?? value;
    }
  }

  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function responseContactLabel(contact: { name?: string; email?: string } | null): string {
  if (contact?.name?.trim()) return contact.name.trim();
  if (contact?.email?.trim()) return contact.email.trim();
  return "";
}
