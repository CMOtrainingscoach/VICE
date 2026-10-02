"use client";

import { useState } from "react";
import { STP_CRITERION_LABELS, type StpCriterionKind } from "@/lib/stp/constants";
import type { StpPublished } from "@/lib/stp/types";

function publishedText(data: StpPublished): string {
  const criteria = data.criteria ?? [];
  return [
    "Goedgekeurd ICP",
    `Versie ${data.version_number ?? ""}`,
    data.icp_name ?? "",
    data.icp_summary ?? "",
    `Aanbod: ${data.offering || "onbekend"}`,
    `Doelgroep: ${data.primary_name || "onbekend"}`,
    `Positionering: ${data.position_sentence || data.promise || ""}`,
    ...criteria.map((item) => `${STP_CRITERION_LABELS[item.kind as StpCriterionKind] ?? item.kind}: ${item.body}`),
    data.open_questions ? `Open vragen: ${data.open_questions}` : "",
    data.accepted_uncertainty ? `Onzekerheid: ${data.accepted_uncertainty}` : "",
  ].filter(Boolean).join("\n");
}

export function StpPublishedView({ data }: { data: StpPublished }) {
  const [copied, setCopied] = useState(false);
  if (!data.published) return null;
  const criteria = data.criteria ?? [];
  return (
    <section className="mb-8 rounded-lg border border-vice-border bg-vice-surface p-6">
      <p className="text-xs font-medium uppercase tracking-wide text-vice-gold">Ideale klant · versie {data.version_number}</p>
      <h2 className="mt-2 text-lg font-medium text-vice-text">{data.icp_name || "ICP"}</h2>
      <p className="mt-2 max-w-prose text-sm text-vice-text">{data.icp_summary}</p>
      <p className="mt-3 text-sm text-vice-text-muted">
        {[data.primary_name, data.offering, data.geography].filter(Boolean).join(" · ")}
        {data.published_at ? ` · vrijgegeven ${new Date(data.published_at).toLocaleDateString("nl-BE")}` : ""}
      </p>
      {data.position_sentence ? <p className="mt-4 text-sm text-vice-text">{data.position_sentence}</p> : null}
      {data.promise ? <p className="mt-2 text-sm text-vice-text-muted">Belofte: {data.promise}</p> : null}
      {criteria.length > 0 ? (
        <ul className="mt-4 space-y-1 text-sm">
          {criteria.map((item) => (
            <li key={`${item.kind}-${item.body}`}>
              <span className="text-vice-text-muted">{STP_CRITERION_LABELS[item.kind as StpCriterionKind] ?? item.kind}: </span>
              {item.body}
            </li>
          ))}
        </ul>
      ) : null}
      {data.open_questions ? <p className="mt-4 text-sm text-vice-text-muted">Nog open: {data.open_questions}</p> : null}
      {data.accepted_uncertainty ? <p className="mt-2 text-sm text-vice-text-muted">Onzekerheid: {data.accepted_uncertainty}</p> : null}
      <button
        type="button"
        className="mt-4 text-sm text-vice-text-muted underline-offset-2 hover:text-vice-text hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vice-gold"
        onClick={() => {
          void navigator.clipboard.writeText(publishedText(data)).then(() => setCopied(true));
        }}
      >
        {copied ? "Gekopieerd" : "Kopieer als tekst"}
      </button>
    </section>
  );
}
