"use client";

import { useState } from "react";
import type { BrandPublished } from "@/lib/brand/types";

export function BrandPublishedView({ data }: { data: BrandPublished }) {
  const [copied, setCopied] = useState(false);
  if (!data.published) return null;
  const text = [
    "Gepubliceerde brand audit",
    `Versie ${data.version_number ?? ""} · ${data.model === "aaker" ? "Aaker" : "Keller"}`,
    data.verdict ? `Conclusie: ${data.verdict}` : "",
    data.positioning_intended ? `Beoogde positionering: ${data.positioning_intended}` : "",
    data.perception_observed ? `Onderbouwde perceptie: ${data.perception_observed}` : "Onderbouwde perceptie: niet beschikbaar",
    data.gap_summary ? `Verschil: ${data.gap_summary}` : "",
    data.unassessed ? `Nog niet te beoordelen: ${data.unassessed}` : "",
    ...(data.priorities ?? []).map((item) => `- ${item.title}: ${item.action}`),
    data.accepted_uncertainty ? `Onzekerheid: ${data.accepted_uncertainty}` : "",
  ].filter(Boolean).join("\n");
  return (
    <section className="mb-8 rounded-lg border border-vice-border bg-vice-surface p-6">
      <p className="text-xs font-medium uppercase tracking-wide text-vice-gold">Brand audit · versie {data.version_number} · {data.model === "aaker" ? "Aaker" : "Keller"}</p>
      {data.verdict ? <h2 className="mt-3 text-lg font-medium text-vice-text">{data.verdict}</h2> : null}
      {data.gap_summary ? <p className="mt-2 text-sm text-vice-text-muted">{data.gap_summary}</p> : null}
      {data.unassessed ? <p className="mt-2 text-sm text-vice-text-muted">Nog niet te beoordelen: {data.unassessed}</p> : null}
      <ul className="mt-4 space-y-2">
        {(data.priorities ?? []).map((item) => (
          <li key={item.title} className="text-sm"><span className="font-medium">{item.title}.</span> {item.action}</li>
        ))}
      </ul>
      <button type="button" className="mt-4 text-sm text-vice-text-muted underline-offset-2 hover:underline" onClick={() => { void navigator.clipboard.writeText(text).then(() => setCopied(true)); }}>
        {copied ? "Gekopieerd" : "Kopieer als tekst"}
      </button>
    </section>
  );
}
