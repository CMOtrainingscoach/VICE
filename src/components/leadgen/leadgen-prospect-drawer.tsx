"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CONTACT_STATUS_LABELS, type LeadgenContactStatus, type LeadgenProspectDetail } from "@/lib/leadgen/types";
import {
  addLeadgenProspectNoteAction,
  getLeadgenProspectDetailAction,
  updateLeadgenProspectStatusAction,
} from "@/modules/leadgen/actions";

export function LeadgenProspectDrawer({
  runId,
  prospectId,
  onClose,
}: {
  runId: string;
  prospectId: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<LeadgenProspectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getLeadgenProspectDetailAction(runId, prospectId).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDetail(result.data ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [runId, prospectId]);

  async function onStatusChange(status: LeadgenContactStatus) {
    if (!detail) return;
    const result = await updateLeadgenProspectStatusAction(detail.id, status);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDetail({ ...detail, contactStatus: status });
  }

  async function onAddNote() {
    if (!detail || !note.trim()) return;
    const result = await addLeadgenProspectNoteAction(detail.id, note.trim());
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNote("");
    const refreshed = await getLeadgenProspectDetailAction(runId, prospectId);
    if (refreshed.ok && refreshed.data) setDetail(refreshed.data);
  }

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/40"
        aria-label="Sluit detailpaneel"
        onClick={onClose}
      />
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-vice-border bg-vice-bg shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="leadgen-drawer-title"
      >
        <header className="flex items-center justify-between border-b border-vice-border px-5 py-4">
          <h2 id="leadgen-drawer-title" className="font-display text-xl text-vice-text">
            {detail?.displayName ?? "Prospect"}
          </h2>
          <Button type="button" variant="ghost" className="size-9 p-0" onClick={onClose} aria-label="Sluiten">
            <X className="size-5" />
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <LoaderCircle className="size-8 animate-spin text-vice-text-muted" />
            </div>
          ) : !detail ? (
            <p className="text-sm text-vice-text-muted">Geen detail beschikbaar.</p>
          ) : (
            <div className="space-y-6 text-sm">
              {error ? (
                <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-red-700" role="alert">
                  {error}
                </p>
              ) : null}

              <section>
                <h3 className="font-medium text-vice-text">Samenvatting</h3>
                <p className="mt-2 text-vice-text-muted">{detail.assessmentSummary || "Nog niet beoordeeld."}</p>
                {detail.websiteUrl ? (
                  <a href={detail.websiteUrl} className="mt-2 inline-block text-vice-gold underline" target="_blank" rel="noreferrer">
                    Website
                  </a>
                ) : null}
                <p className="mt-2 text-xs text-vice-text-muted">
                  Onderzoek uitgevoerd:{" "}
                  {detail.researchRunAt ? new Date(detail.researchRunAt).toLocaleString("nl-BE") : "—"}
                </p>
              </section>

              <section>
                <h3 className="font-medium">Contact</h3>
                <ul className="mt-2 space-y-1 text-vice-text-muted">
                  <li>E-mail: {detail.email ?? "—"}</li>
                  <li>Telefoon: {detail.phone ?? "—"}</li>
                  <li>
                    Contactpagina:{" "}
                    {detail.contactPageUrl ? (
                      <a href={detail.contactPageUrl} className="text-vice-gold underline" target="_blank" rel="noreferrer">
                        link
                      </a>
                    ) : (
                      "—"
                    )}
                  </li>
                </ul>
                <label className="mt-3 block text-xs font-medium text-vice-text-muted" htmlFor="drawer-status">
                  Contactstatus (huidig)
                </label>
                <select
                  id="drawer-status"
                  className="mt-1 w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2"
                  value={detail.contactStatus}
                  onChange={(e) => void onStatusChange(e.target.value as LeadgenContactStatus)}
                >
                  {Object.entries(CONTACT_STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </section>

              <section>
                <h3 className="font-medium">Waarom geselecteerd?</h3>
                <ul className="mt-2 space-y-2">
                  {detail.signals.map((signal, index) => (
                    <li key={`${signal.label}-${index}`} className="rounded-lg border border-vice-border px-3 py-2">
                      <span className="text-xs uppercase text-vice-text-muted">{signal.kind}</span>
                      <p className="font-medium">{signal.label}</p>
                      <p className="text-vice-text-muted">{signal.detail}</p>
                    </li>
                  ))}
                </ul>
              </section>

              {detail.limitations.length ? (
                <section>
                  <h3 className="font-medium">Beperkingen</h3>
                  <ul className="mt-2 list-disc pl-5 text-vice-text-muted">
                    {detail.limitations.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section>
                <h3 className="font-medium">Bronnen</h3>
                <ul className="mt-2 space-y-2">
                  {detail.sources.map((source) => (
                    <li key={source.id}>
                      <a href={source.url} className="text-vice-gold underline" target="_blank" rel="noreferrer">
                        {source.title || source.url}
                      </a>
                      <p className="text-xs text-vice-text-muted">{source.excerpt}</p>
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h3 className="font-medium">Notities</h3>
                <ul className="mt-2 space-y-2">
                  {detail.notes.map((n) => (
                    <li key={n.id} className="rounded border border-vice-border px-3 py-2">
                      <p>{n.body}</p>
                      <p className="text-xs text-vice-text-muted">
                        {n.authorLabel} · {new Date(n.createdAt).toLocaleString("nl-BE")}
                      </p>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex gap-2">
                  <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nieuwe notitie…" aria-label="Nieuwe notitie" />
                  <Button type="button" variant="secondary" onClick={() => void onAddNote()}>
                    Opslaan
                  </Button>
                </div>
              </section>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
