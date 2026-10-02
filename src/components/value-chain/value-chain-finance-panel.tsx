"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chip, goldButtonClass, textareaClass } from "@/components/value-chain/value-chain-ui";
import {
  VC_FIGURE_LABELS,
  VC_SCALE_LABELS,
  VC_SCOPE_LABELS,
  type VcFinanceScope,
} from "@/lib/value-chain/constants";
import {
  checkAllocation,
  formatMinor,
  marginView,
  minorToAmountString,
  parseCsv,
  reconcile,
  splitByDriver,
  splitByPercent,
  toMinor,
  type CostLine,
  type DecimalMode,
} from "@/lib/value-chain/finance";
import type { VcActivity, VcAllocation, VcImport } from "@/lib/value-chain/types";
import { cn } from "@/lib/utils";

export function ValueChainFinancePanel({
  imports,
  allocations,
  activities,
  offering,
  currencyFallback,
  readOnly,
  busy,
  onImport,
  onLine,
  onConfirmImport,
  onAllocate,
}: {
  imports: VcImport[];
  allocations: VcAllocation[];
  activities: VcActivity[];
  offering: string;
  currencyFallback: string;
  readOnly: boolean;
  busy: string | null;
  onImport: (input: ImportDraft) => Promise<void>;
  onLine: (lineId: string, patch: { description: string; amount: string; inScope: boolean; outReason: string; isRevenue: boolean; status: "proposed" | "confirmed" | "excluded" | "uncertain"; kind: "detail" | "subtotal" | "total" }) => Promise<void>;
  onConfirmImport: (importId: string) => Promise<void>;
  onAllocate: (input: { lineId: string; activityId: string; amount: string; method: string; motivation: string; formula: string; confirm: boolean }) => Promise<void>;
}) {
  const [entity, setEntity] = useState("");
  const [period, setPeriod] = useState("");
  const [currency, setCurrency] = useState(currencyFallback || "EUR");
  const [scale, setScale] = useState<"units" | "thousands" | "millions">("units");
  const [figureType, setFigureType] = useState<"actual" | "budget" | "forecast">("actual");
  const [scopeLevel, setScopeLevel] = useState<VcFinanceScope>("company");
  const [decimal, setDecimal] = useState<DecimalMode>("auto");
  const [fileName, setFileName] = useState("");
  const [csvText, setCsvText] = useState("");
  const [fileNote, setFileNote] = useState<string | null>(null);
  const [descCol, setDescCol] = useState(0);
  const [amountCol, setAmountCol] = useState(1);
  const [codeCol, setCodeCol] = useState<number | null>(null);
  const [activityId, setActivityId] = useState(activities[0]?.id ?? "");
  const [method, setMethod] = useState("direct");
  const [motivation, setMotivation] = useState("");
  const [percent, setPercent] = useState("");
  const [driver, setDriver] = useState("");

  const preview = useMemo(() => (csvText.trim() ? parseCsv(csvText) : null), [csvText]);
  const headers = preview?.rows[0] ?? [];

  const costLines: CostLine[] = imports.flatMap((item) =>
    item.lines.map((line) => ({
      id: line.id,
      amount: line.amount,
      scale: item.scale,
      kind: line.line_kind,
      status: line.extract_status,
      inScope: line.in_scope,
      currency: item.currency,
      periodKey: item.period_label,
      entityKey: item.entity_label,
      figureType: item.figure_type,
      isRevenue: line.is_revenue,
    })),
  );
  const allocLines = allocations.map((allocation) => ({
    lineId: allocation.line_id,
    activityId: allocation.activity_id,
    amount: allocation.amount,
    status: allocation.status,
  }));
  const buckets = reconcile(costLines, allocLines);
  const margin = marginView(costLines, allocLines);

  function allocationDraft(source: bigint | null, lineAmount: string | null): { amount: string; formula: string } | null {
    if (source == null) return null;
    if (method === "manual_percent") {
      const split = splitByPercent(source, [{ id: activityId, percent }]);
      if (!split.ok || !split.parts[0]) return null;
      return { amount: minorToAmountString(split.parts[0].minor), formula: split.formula };
    }
    if (method === "direct" || method === "pool") {
      if (!lineAmount) return null;
      return {
        amount: lineAmount,
        formula: method === "pool" ? "Gedeelde pool: de bronregel telt één keer in het totaal." : "Rechtstreekse toewijzing van het bronbedrag.",
      };
    }
    const split = splitByDriver(source, [{ id: activityId, value: driver }], method);
    if (!split.ok || !split.parts[0]) return null;
    return { amount: minorToAmountString(split.parts[0].minor), formula: split.formula };
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-vice-border bg-vice-surface p-5">
        <h2 className="text-lg font-medium">Financiële onderbouwing</h2>
        <p className="mt-1 text-sm text-vice-text-muted">Uploaden keurt niets goed en wijst niets toe. Zonder resultatenrekening blijft de kwalitatieve analyse bruikbaar.</p>
        {scopeLevel === "company" && offering && (
          <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
            Deze cijfers kunnen op het hele bedrijf slaan, terwijl de analyse over {offering} gaat. Er is geen automatische volledige toewijzing.
          </p>
        )}
        {!readOnly && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">Entiteit<Input className="mt-1" value={entity} onChange={(event) => setEntity(event.target.value)} /></label>
            <label className="text-sm">Periode<Input className="mt-1" value={period} onChange={(event) => setPeriod(event.target.value)} /></label>
            <label className="text-sm">Valuta<Input className="mt-1" value={currency} onChange={(event) => setCurrency(event.target.value)} /></label>
            <label className="text-sm">Schaal
              <select className="mt-1 w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm" value={scale} onChange={(event) => setScale(event.target.value as typeof scale)}>
                {Object.entries(VC_SCALE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </label>
            <label className="text-sm">Cijfertype
              <select className="mt-1 w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm" value={figureType} onChange={(event) => setFigureType(event.target.value as typeof figureType)}>
                {Object.entries(VC_FIGURE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </label>
            <label className="text-sm">Scope van het document
              <select className="mt-1 w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm" value={scopeLevel} onChange={(event) => setScopeLevel(event.target.value as VcFinanceScope)}>
                {Object.entries(VC_SCOPE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </label>
            <label className="text-sm sm:col-span-2">CSV of geplakte kolommen
              <textarea className={cn(textareaClass, "mt-1 min-h-[120px] font-mono text-xs")} value={csvText} onChange={(event) => setCsvText(event.target.value)} placeholder={"omschrijving;bedrag\nHuur;1200,00"} />
            </label>
            <label className="text-sm">Bestand
              <input className="mt-1 block text-xs" type="file" accept=".csv,text/csv,.xlsx,.pdf" onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setFileName(file.name);
                const lower = file.name.toLowerCase();
                if (lower.endsWith(".xlsx")) {
                  setFileNote("Een spreadsheet wordt niet uitgevoerd. Macro's en externe koppelingen blijven dicht. Exporteer het tabblad als CSV of plak de kolommen.");
                  return;
                }
                if (lower.endsWith(".pdf")) {
                  setFileNote("Een scan-PDF wordt niet gelezen: OCR is niet beschikbaar. Plak de leesbare tekst als tabel.");
                  return;
                }
                setFileNote(null);
                void file.text().then(setCsvText);
              }} />
            </label>
            <label className="text-sm">Decimaalteken
              <select className="mt-1 w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm" value={decimal} onChange={(event) => setDecimal(event.target.value as DecimalMode)}>
                <option value="auto">Automatisch, twijfel blijft onzeker</option>
                <option value="comma">Komma</option>
                <option value="point">Punt</option>
              </select>
            </label>
          </div>
        )}
        {fileNote && <p className="mt-3 text-sm text-amber-800 dark:text-amber-200">{fileNote}</p>}
        {headers.length > 0 && (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <ColumnSelect label="Omschrijving" headers={headers} value={descCol} onChange={setDescCol} />
            <ColumnSelect label="Bedrag" headers={headers} value={amountCol} onChange={setAmountCol} />
            <label className="text-sm">Rekeningcode
              <select className="mt-1 w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm" value={codeCol ?? ""} onChange={(event) => setCodeCol(event.target.value === "" ? null : Number(event.target.value))}>
                <option value="">Geen</option>
                {headers.map((header, index) => <option key={header + index} value={index}>{header || `Kolom ${index + 1}`}</option>)}
              </select>
            </label>
          </div>
        )}
        {!readOnly && (
          <Button type="button" className={cn("mt-4", goldButtonClass)} disabled={busy !== null || csvText.trim().length < 1} onClick={() => void onImport({
            fileName: fileName || "geplakte-regels.csv", fileKind: "csv", entity, period, currency, scale, figureType, scopeLevel, decimal, descriptionColumn: descCol, amountColumn: amountCol, codeColumn: codeCol, csvText,
          })}>
            Import als concept bewaren
          </Button>
        )}
      </section>

      {imports.map((item) => (
        <section key={item.id} className="rounded-2xl border border-vice-border bg-vice-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium">{item.file_name || "Import"} · {item.entity_label} · {item.period_label}</h3>
            <Chip tone={item.status === "confirmed" ? "green" : "amber"}>{item.status === "confirmed" ? "Bron gecontroleerd" : "Nog te controleren"}</Chip>
          </div>
          <p className="mt-1 text-xs text-vice-text-muted">{item.currency} · {VC_SCALE_LABELS[item.scale]} · {VC_FIGURE_LABELS[item.figure_type]} · {VC_SCOPE_LABELS[item.scope_level]}</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs text-vice-text-muted">
                <tr>
                  <th className="py-2">Omschrijving</th>
                  <th>Code</th>
                  <th>Bedrag</th>
                  <th>Type</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {item.lines.map((line) => (
                  <tr key={line.id} className="border-t border-vice-border/70">
                    <td className="py-2 pr-2">{line.description || "—"}{line.possible_duplicate && <Chip tone="amber">Mogelijk duplicaat</Chip>}{line.formula && <Chip tone="rose">Formule niet uitgevoerd</Chip>}</td>
                    <td>{line.account_code}</td>
                    <td>{line.amount == null ? "onbekend" : line.amount}{line.uncertain && " · onzeker"}</td>
                    <td>{line.line_kind}</td>
                    <td>
                      {!readOnly && line.line_kind === "detail" && (
                        <Button type="button" variant="secondary" className="h-7 text-xs" disabled={busy !== null} onClick={() => void onLine(line.id, {
                          description: line.description,
                          amount: line.amount ?? "",
                          inScope: line.in_scope,
                          outReason: line.out_scope_reason,
                          isRevenue: line.is_revenue,
                          status: line.extract_status === "excluded" ? "proposed" : "excluded",
                          kind: line.line_kind,
                        })}>
                          {line.extract_status === "excluded" ? "Opnemen" : "Uitsluiten"}
                        </Button>
                      )}
                      <span className="ml-2 text-xs text-vice-text-muted">{line.extract_status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!readOnly && (
            <Button type="button" variant="secondary" className="mt-3" disabled={busy !== null} onClick={() => void onConfirmImport(item.id)}>
              Import bevestigen
            </Button>
          )}
        </section>
      ))}

      <section className="rounded-2xl border border-vice-border bg-vice-surface p-5">
        <h3 className="font-medium">Aansluiting</h3>
        <p className="mt-1 text-xs text-vice-text-muted">Subtotalen tellen niet mee. Onbekend blijft leeg. Doorbelaste kosten blijven onderdeel van de bronregel.</p>
        {buckets.length === 0 && <p className="mt-3 text-sm">Nog geen financiële regels.</p>}
        {buckets.map((bucket) => (
          <ul key={bucket.key} className="mt-3 space-y-1 text-sm">
            <li>Bronkosten binnen scope: {formatMinor(bucket.knownSourceMinor, bucket.currency)}{bucket.incomplete ? " · onvolledig, geen sluitend restant" : ""}</li>
            <li>Buiten scope: {formatMinor(bucket.outOfScopeMinor, bucket.currency)}</li>
            <li>Toegewezen, bevestigd: {formatMinor(bucket.assignedConfirmedMinor, bucket.currency)}</li>
            <li>Toegewezen, voorlopig: {formatMinor(bucket.assignedProposedMinor, bucket.currency)}</li>
            <li>Nog niet toegewezen: {bucket.unassignedMinor == null ? "onbekend" : formatMinor(bucket.unassignedMinor, bucket.currency)}</li>
            <li>Aansluitverschil met het documenttotaal: {bucket.tieDifferenceMinor == null ? "onvoldoende informatie, niet geforceerd" : formatMinor(bucket.tieDifferenceMinor, bucket.currency)}</li>
          </ul>
        ))}
        <div className="mt-4 rounded-lg bg-vice-bg/50 p-3 text-sm">
          {margin.kind === "insufficient" && "Marge: onvoldoende financiële gegevens."}
          {margin.kind === "costs_only" && `Alleen kosten binnen scope: ${formatMinor(margin.knownSourceMinor, margin.currency)}. Geen omzet, dus geen marge.`}
          {margin.kind === "blocked" && margin.reason}
          {margin.kind === "margin" && margin.formula}
        </div>
      </section>

      {!readOnly && imports.some((item) => item.lines.some((line) => line.line_kind === "detail" && line.amount)) && (
        <section className="rounded-2xl border border-vice-border bg-vice-surface p-5">
          <h3 className="font-medium">Toewijzen</h3>
          <p className="mt-1 text-xs text-vice-text-muted">De AI beslist dit niet. Een gelijke verdeling is geen verborgen standaard.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">Activiteit
              <select className="mt-1 w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm" value={activityId} onChange={(event) => setActivityId(event.target.value)}>
                {activities.filter((activity) => !activity.not_applicable).map((activity) => <option key={activity.id} value={activity.id}>{activity.name}</option>)}
              </select>
            </label>
            <label className="text-sm">Methode
              <select className="mt-1 w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm" value={method} onChange={(event) => setMethod(event.target.value)}>
                <option value="direct">Rechtstreeks</option>
                <option value="manual_percent">Expliciet percentage</option>
                <option value="hours">Geregistreerde uren</option>
                <option value="headcount">Aantal medewerkers</option>
                <option value="jobs">Aantal opdrachten</option>
                <option value="usage">Gebruikseenheden</option>
                <option value="pool">Gedeelde kostenpool</option>
              </select>
            </label>
            <label className="text-sm sm:col-span-2">Motivatie
              <textarea className={cn(textareaClass, "mt-1")} value={motivation} onChange={(event) => setMotivation(event.target.value)} />
            </label>
          </div>
          <ul className="mt-4 space-y-2">
            {imports.flatMap((item) => item.lines.filter((line) => line.line_kind === "detail" && line.extract_status !== "excluded").map((line) => {
              const source = toMinor(line.amount, item.scale, "point").minor;
              const existing = allocations.filter((allocation) => allocation.line_id === line.id).map((allocation) => toMinor(allocation.amount, item.scale, "point").minor ?? 0n);
              const room = checkAllocation(source, existing);
              return (
                <li key={line.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-vice-border px-3 py-2 text-sm">
                  <span>{line.description || "Regel"} · {line.amount == null ? "onbekend" : formatMinor(source ?? 0n, item.currency)} · restant {room.ok ? formatMinor(room.remainder, item.currency) : room.error}</span>
                  <span className="flex flex-wrap gap-2">
                    {method === "manual_percent" && <Input className="h-8 w-24" value={percent} onChange={(event) => setPercent(event.target.value)} placeholder="%" />}
                    {method !== "direct" && method !== "manual_percent" && method !== "pool" && <Input className="h-8 w-28" value={driver} onChange={(event) => setDriver(event.target.value)} placeholder="basis" />}
                    <Button type="button" variant="secondary" className="h-8 text-xs" disabled={busy !== null || !activityId || source == null} onClick={() => {
                      const draft = allocationDraft(source, line.amount);
                      if (!draft) return;
                      void onAllocate({ lineId: line.id, activityId, ...draft, method, motivation, confirm: false });
                    }}>
                      Voorstel
                    </Button>
                    <Button type="button" className={cn("h-8 text-xs", goldButtonClass)} disabled={busy !== null || source == null} onClick={() => {
                      const draft = allocationDraft(source, line.amount);
                      if (!draft) return;
                      void onAllocate({ lineId: line.id, activityId, ...draft, method, motivation, confirm: true });
                    }}>
                      Bevestigen
                    </Button>
                  </span>
                </li>
              );
            }))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ColumnSelect({ label, headers, value, onChange }: { label: string; headers: string[]; value: number; onChange: (value: number) => void }) {
  return (
    <label className="text-sm">{label}
      <select className="mt-1 w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm" value={value} onChange={(event) => onChange(Number(event.target.value))}>
        {headers.map((header, index) => <option key={header + index} value={index}>{header || `Kolom ${index + 1}`}</option>)}
      </select>
    </label>
  );
}

export type ImportDraft = {
  fileName: string;
  fileKind: "csv";
  entity: string;
  period: string;
  currency: string;
  scale: "units" | "thousands" | "millions";
  figureType: "actual" | "budget" | "forecast";
  scopeLevel: VcFinanceScope;
  decimal: DecimalMode;
  descriptionColumn: number;
  amountColumn: number;
  codeColumn: number | null;
  csvText: string;
};
