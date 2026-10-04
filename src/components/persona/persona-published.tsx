"use client";

import { useState } from "react";
import type { PersonaPublished } from "@/lib/persona/types";

function publishedText(data: PersonaPublished): string {
  return [
    "Gepubliceerde persona's en klantreis",
    `Versie ${data.version_number ?? ""}`,
    ...(data.personas ?? []).flatMap((persona) => [persona.role_title, persona.summary, "Portret: AI-visualisatie, fictief.", ""]),
    ...(data.journeys ?? []).flatMap((journey) => [
      journey.kind === "desired" ? "Gewenste reis" : "Huidige reis",
      ...journey.phases.map((phase) => `- ${phase.name}: ${phase.goal}${phase.improvement ? ` · kans: ${phase.improvement}` : ""}`),
      "",
    ]),
    data.open_questions ? `Open vragen: ${data.open_questions}` : "",
    data.accepted_uncertainty ? `Onzekerheid: ${data.accepted_uncertainty}` : "",
  ].filter(Boolean).join("\n");
}

export function PersonaPublishedView({ data }: { data: PersonaPublished }) {
  const [copied, setCopied] = useState(false);
  if (!data.published) return null;
  return (
    <section className="mb-8 rounded-lg border border-vice-border bg-vice-surface p-6">
      <p className="text-xs font-medium uppercase tracking-wide text-vice-gold">Persona’s en klantreis · versie {data.version_number}</p>
      <ul className="mt-4 space-y-4">
        {(data.personas ?? []).map((persona) => (
          <li key={persona.role_title} className="flex gap-4">
            {persona.url ? (
              <>
                {/* Privé signed URL; niet via de image-optimizer sturen. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={persona.url} alt={`AI-visualisatie van de rol ${persona.role_title}. Fictief portret ter illustratie.`} className="h-16 w-16 rounded-lg object-cover" />
              </>
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-vice-surface-muted text-xs text-vice-text-muted">AI</div>
            )}
            <div>
              <h2 className="text-base font-medium text-vice-text">{persona.role_title}</h2>
              <p className="mt-1 text-sm text-vice-text-muted">{persona.summary}</p>
              <p className="mt-1 text-xs text-vice-text-muted">AI-visualisatie. Fictief portret ter illustratie van deze rol.</p>
            </div>
          </li>
        ))}
      </ul>
      {(data.journeys ?? []).map((journey) => (
        <article key={`${journey.kind}-${journey.title}`} className="mt-6">
          <h3 className="text-sm font-medium text-vice-text">{journey.kind === "desired" ? "Gewenste reis" : "Huidige reis"}</h3>
          <ol className="mt-2 space-y-2">
            {journey.phases.map((phase) => (
              <li key={`${phase.name}-${phase.goal}`} className="text-sm">
                <span className="font-medium">{phase.name}.</span> {phase.goal}
                {phase.barriers ? <span className="text-vice-text-muted"> Drempel: {phase.barriers}</span> : null}
                {phase.improvement ? <span className="mt-1 block text-vice-text-muted">Verbeterkans: {phase.improvement}</span> : null}
              </li>
            ))}
          </ol>
        </article>
      ))}
      {data.open_questions ? <p className="mt-4 text-sm text-vice-text-muted">Nog open: {data.open_questions}</p> : null}
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
