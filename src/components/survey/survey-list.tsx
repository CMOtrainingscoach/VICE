"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BarChart2, LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SurveySummary } from "@/lib/survey/survey-types";
import { createSurveyAction, deleteSurveyAction } from "@/modules/survey/survey-actions";

export function SurveyList({
  tenantId,
  tenantName,
  initial,
}: {
  tenantId: string;
  tenantName: string;
  initial: SurveySummary[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function createNew() {
    setBusy("create");
    setError("");
    const result = await createSurveyAction(tenantId);
    setBusy("");
    if (!result.ok || !result.data) {
      setError(result.ok ? "Aanmaken mislukt" : result.error);
      return;
    }
    router.push(`/klanten/${tenantId}/enquetes/${result.data.id}`);
  }

  async function remove(id: string) {
    if (!confirm("Deze enquête en alle antwoorden definitief verwijderen?")) return;
    setBusy(id);
    const result = await deleteSurveyAction(id);
    setBusy("");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setItems((list) => list.filter((s) => s.id !== id));
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 md:px-10">
      <p className="text-sm text-vice-text-muted">{tenantName} / Enquêtes</p>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-vice-gold">Enquêtes</p>
          <h1 className="font-display text-3xl text-vice-text">Enquêtebouwer</h1>
          <p className="mt-2 text-sm text-vice-text-muted">
            Maak flows met welkom-, titel- en bedankschermen en gepubliceerde merk-enquêtes.
          </p>
        </div>
        <Button type="button" disabled={Boolean(busy)} onClick={() => void createNew()}>
          {busy === "create" ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Nieuwe enquête
        </Button>
      </div>

      {error ? <p className="mt-4 text-sm text-red-700 dark:text-red-300">{error}</p> : null}

      <div className="mt-8 overflow-x-auto rounded-xl border border-vice-border">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-vice-border bg-vice-surface text-xs uppercase text-vice-text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Titel</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Antwoorden</th>
              <th className="px-4 py-3 font-medium">Bijgewerkt</th>
              <th className="px-4 py-3 font-medium text-right">Acties</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-vice-border last:border-0">
                <td className="px-4 py-3 font-medium text-vice-text">{item.title}</td>
                <td className="px-4 py-3 text-vice-text-muted">
                  {item.status === "published" ? "Gepubliceerd" : item.status === "closed" ? "Gesloten" : "Concept"}
                </td>
                <td className="px-4 py-3">{item.responseCount}</td>
                <td className="px-4 py-3 text-vice-text-muted">
                  {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString("nl-NL") : "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <Link href={`/klanten/${tenantId}/enquetes/${item.id}/resultaten`} title="Resultaten">
                      <Button type="button" variant="ghost" className="size-8 p-0" aria-label="Resultaten">
                        <BarChart2 className="size-4" />
                      </Button>
                    </Link>
                    <Link href={`/klanten/${tenantId}/enquetes/${item.id}`} title="Bewerken">
                      <Button type="button" variant="ghost" className="size-8 p-0" aria-label="Bewerken">
                        <Pencil className="size-4" />
                      </Button>
                    </Link>
                    <Button
                      type="button"
                      variant="ghost"
                      className="size-8 p-0 text-vice-danger hover:text-vice-danger"
                      aria-label="Verwijderen"
                      disabled={busy === item.id}
                      onClick={() => void remove(item.id)}
                    >
                      {busy === item.id ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-vice-text-muted">
                  Nog geen enquêtes. Maak je eerste enquête.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
