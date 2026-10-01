"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RefChip, formatDate, goldButtonClass } from "@/components/marketing-5c/five-c-ui";
import type { FiveCCatalogEntry } from "@/lib/marketing-5c/input-catalog";
import { setFiveCExcludedInputsAction } from "@/modules/marketing-5c/actions";

type RunFn = (label: string, fn: () => Promise<{ ok: boolean; error?: string }>) => Promise<boolean>;

const GROUPS: { group: FiveCCatalogEntry["group"]; title: string; hint: string }[] = [
  { group: "dossier", title: "Klantdossier", hint: "Profiel, meetings, documenten en eigen aanvullingen" },
  { group: "pestel", title: "PESTEL", hint: "Goedgekeurde inzichten — enkel voor Context" },
  { group: "porter", title: "Porter", hint: "Afbakening, krachten en factoren" },
];

export function FiveCInputPanel({
  tenantId,
  versionId,
  catalog,
  excluded,
  readOnly,
  busy,
  run,
  onClose,
}: {
  tenantId: string;
  versionId: string;
  catalog: FiveCCatalogEntry[];
  excluded: string[];
  readOnly: boolean;
  busy: string | null;
  run: RunFn;
  onClose: () => void;
}) {
  const [skip, setSkip] = useState(() => new Set(excluded));
  const [open, setOpen] = useState<string | null>(null);
  const dirty = skip.size !== excluded.length || excluded.some((k) => !skip.has(k));

  function toggle(key: string) {
    setSkip((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="presentation" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-xl flex-col border-l border-vice-border bg-vice-surface shadow-xl"
        role="dialog"
        aria-label="Input voor de 5C-analyse"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-vice-border px-5 py-4">
          <div>
            <h2 className="text-lg font-medium">Input voor de 5C-analyse</h2>
            <p className="text-sm text-vice-text-muted">
              Vink een bron uit om ze niet mee te nemen. De oorspronkelijke bron blijft ongewijzigd bewaard.
            </p>
          </div>
          <button type="button" className="rounded-md p-1 hover:bg-vice-surface-muted" onClick={onClose} aria-label="Sluiten">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {GROUPS.map(({ group, title, hint }) => {
            const list = catalog.filter((e) => e.group === group);
            return (
              <section key={group}>
                <p className="text-sm font-medium">
                  {title} <span className="font-normal text-vice-text-muted">· {list.length}</span>
                </p>
                <p className="text-xs text-vice-text-muted">{hint}</p>
                {list.length === 0 ?
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-200">Geen bronnen beschikbaar.</p>
                : <ul className="mt-2 space-y-1.5">
                    {list.map((e) => (
                      <li key={e.key} className="rounded-lg border border-vice-border px-3 py-2">
                        <div className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            className="mt-1"
                            disabled={readOnly}
                            checked={!skip.has(e.key)}
                            onChange={() => toggle(e.key)}
                            aria-label={`${e.label} meenemen`}
                          />
                          <div className="min-w-0 flex-1">
                            <button
                              type="button"
                              className="text-left text-sm hover:text-vice-gold"
                              onClick={() => setOpen(open === e.key ? null : e.key)}
                            >
                              <span className={skip.has(e.key) ? "line-through opacity-60" : ""}>{e.label}</span>
                              {e.date && <span className="text-xs text-vice-text-muted"> · {formatDate(e.date)}</span>}
                            </button>
                            {open === e.key && (
                              <div className="mt-2 space-y-2">
                                <p className="max-h-48 overflow-y-auto whitespace-pre-line rounded bg-vice-bg p-2 text-xs text-vice-text-muted">
                                  {e.text}
                                </p>
                                <RefChip tenantId={tenantId} refType={e.ref_type} refId={e.ref_id} label="Open bron" />
                              </div>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                }
              </section>
            );
          })}
        </div>
        {!readOnly && (
          <div className="flex gap-2 border-t border-vice-border px-5 py-4">
            <Button
              type="button"
              className={goldButtonClass}
              disabled={busy !== null || !dirty}
              onClick={async () => {
                const ok = await run("inputs", () =>
                  setFiveCExcludedInputsAction(tenantId, { versionId, keys: [...skip] }),
                );
                if (ok) onClose();
              }}
            >
              Selectie opslaan
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              Sluiten
            </Button>
          </div>
        )}
      </aside>
    </div>
  );
}
