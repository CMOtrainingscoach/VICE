"use client";

import { Button } from "@/components/ui/button";
import type { LeadgenProspectRow } from "@/lib/leadgen/types";
import { submitSbFeedbackAction } from "@/modules/salesbrain/actions";

const SIGNAL_KIND_LABEL: Record<string, string> = {
  observed: "Geobserveerd",
  interpretation: "Interpretatie",
  unverified: "Onbekend",
};

export function SalesbrainProspectPanel({
  tenantId,
  runId,
  prospect,
  isTest,
  onClose,
}: {
  tenantId: string;
  runId: string;
  prospect: LeadgenProspectRow;
  isTest: boolean;
  onClose: () => void;
}) {
  async function onFeedback(kind: "relevant" | "not_relevant" | "incorrect") {
    await submitSbFeedbackAction(tenantId, { runId, prospectId: prospect.id, kind });
  }

  return (
    <aside
      className="mt-8 rounded-xl border border-vice-border bg-vice-surface p-5 text-sm"
      aria-label={`Prospect ${prospect.displayName}`}
    >
      <div className="flex items-start justify-between gap-4">
        <h2 className="font-medium text-vice-text">{prospect.displayName}</h2>
        <Button type="button" variant="ghost" onClick={onClose}>
          Sluiten
        </Button>
      </div>
      {prospect.websiteUrl ? (
        <a href={prospect.websiteUrl} className="mt-2 block text-vice-gold underline" target="_blank" rel="noreferrer">
          {prospect.websiteUrl}
        </a>
      ) : (
        <p className="mt-2 text-vice-text-muted">Geen website</p>
      )}
      {prospect.distanceKm != null ? (
        <p className="mt-2 text-vice-text-muted">
          Afstand: {prospect.distanceKm.toFixed(1)} km · geo {prospect.geoVerified ? "geverifieerd" : "onbekend"}
        </p>
      ) : null}

      {prospect.assessmentSummary ? (
        <section className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-vice-text-muted">Samenvatting</h3>
          <p className="mt-1">{prospect.assessmentSummary}</p>
        </section>
      ) : null}

      {prospect.signals?.length ? (
        <section className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-vice-text-muted">Signalen</h3>
          <ul className="mt-2 space-y-2">
            {prospect.signals.map((s, i) => (
              <li key={`${s.label}-${i}`}>
                <span className="text-xs text-vice-gold">{SIGNAL_KIND_LABEL[s.kind] ?? s.kind}</span>: {s.detail}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {prospect.limitations?.length ? (
        <section className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-vice-text-muted">Beperkingen</h3>
          <ul className="mt-1 list-disc pl-5 text-vice-text-muted">
            {prospect.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {!isTest ? (
        <div className="mt-6 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => void onFeedback("relevant")}>
            Relevant
          </Button>
          <Button type="button" variant="secondary" onClick={() => void onFeedback("not_relevant")}>
            Niet relevant
          </Button>
          <Button type="button" variant="ghost" onClick={() => void onFeedback("incorrect")}>
            Onjuiste info
          </Button>
        </div>
      ) : null}
    </aside>
  );
}
