"use client";

import { AlertTriangle, CheckCircle2, FileSearch, Loader2, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AuditStepNav } from "@/components/audit/audit-step-nav";
import { Button } from "@/components/ui/button";
import { FiveCInputPanel } from "@/components/marketing-5c/five-c-input-panel";
import { FiveCSectionPanel } from "@/components/marketing-5c/five-c-section-panel";
import {
  Chip,
  FIVE_C_ICONS,
  RefChip,
  formatDate,
  goldButtonClass,
  selectClass,
  textareaClass,
} from "@/components/marketing-5c/five-c-ui";
import {
  FIVE_C_KEYS,
  FIVE_C_META,
  MARKETING_5C_FRAMEWORK_INDEX,
  MARKETING_5C_LABEL,
  SWOT_ROUTE,
  type FiveCKey,
} from "@/lib/marketing-5c/constants";
import { activeCatalog, buildFiveCCatalogFromWorkbench } from "@/lib/marketing-5c/input-catalog";
import type { FiveCContradiction, FiveCUpstreamVersion, FiveCWorkbench } from "@/lib/marketing-5c/types";
import { AUDIT_FRAMEWORK_COUNT } from "@/lib/pestel/constants";
import {
  adoptFiveCUpstreamAction,
  approveFiveCVersionAction,
  composeFiveCAnalysisAction,
  createFiveCRevisionAction,
  loadFiveCWorkbenchAction,
  resolveFiveCContradictionAction,
  saveFiveCSynthesisAction,
} from "@/modules/marketing-5c/actions";
import { cn } from "@/lib/utils";

const AI_STEPS = [
  "Geselecteerde bronnen lezen",
  "Informatie verdelen over de vijf C's",
  "Dubbele informatie samenvoegen",
  "Onzekerheidslabels behouden",
  "Verbanden tussen onderdelen leggen",
  "Hiaten en tegenstrijdigheden benoemen",
  "Opslaan als concept",
];

const RESOLUTION_LABELS: Record<FiveCContradiction["resolution"], string> = {
  open: "Nog open",
  clarified: "Verduidelijkt (beide kloppen)",
  a_outdated: "Bron A is verouderd",
  b_outdated: "Bron B is verouderd",
};

function UpstreamBadge({
  tenantId,
  label,
  route,
  used,
  latestApproved,
}: {
  tenantId: string;
  label: string;
  route: string;
  used: FiveCUpstreamVersion | null;
  latestApproved: FiveCUpstreamVersion | null;
}) {
  const approved = used?.status === "approved";
  const stale = Boolean(latestApproved && used && latestApproved.id !== used.id);
  return (
    <Link
      href={`/klanten/${tenantId}/strategie/${route}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs hover:border-vice-gold/60",
        approved && !stale ? "border-emerald-500/40 bg-emerald-500/10" : "border-amber-500/40 bg-amber-500/10",
      )}
    >
      {approved && !stale ?
        <CheckCircle2 className="size-3.5 text-emerald-600" aria-hidden />
      : <AlertTriangle className="size-3.5 text-amber-600" aria-hidden />}
      {label} {used ? `v${used.version_number}` : ""} ·{" "}
      {!used ? "ontbreekt" : stale ? `nieuwere v${latestApproved?.version_number}` : approved ? "goedgekeurd" : "concept"}
    </Link>
  );
}

export function FiveCWorkspace({
  tenantId,
  tenantName,
  initial,
}: {
  tenantId: string;
  tenantName: string;
  initial: FiveCWorkbench;
}) {
  const router = useRouter();
  const [wb, setWb] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [panel, setPanel] = useState<{ cKey: FiveCKey; newItem: boolean } | null>(null);
  const [inputsOpen, setInputsOpen] = useState(false);
  const [synthesisText, setSynthesisText] = useState(initial.version.synthesis_text);
  const [aiStep, setAiStep] = useState(0);
  const [contraDraft, setContraDraft] = useState<Record<string, { resolution: FiveCContradiction["resolution"]; note: string }>>({});

  const { version, upstream } = wb;
  const readOnly = version.status === "approved";
  const catalog = useMemo(() => buildFiveCCatalogFromWorkbench(wb), [wb]);
  const active = useMemo(() => activeCatalog(catalog, version.excluded_inputs), [catalog, version.excluded_inputs]);
  const hasAnalysis = wb.items.length > 0 || Boolean(version.ai_generated_at);
  const aiRunning = busy === "ai" || Boolean(busy?.startsWith("ai-"));

  const pestelStale = Boolean(upstream.latest_pestel_approved && upstream.latest_pestel_approved.id !== upstream.pestel?.id);
  const porterStale = Boolean(upstream.latest_porter_approved && upstream.latest_porter_approved.id !== upstream.porter?.id);
  const upstreamApproved = upstream.pestel?.status === "approved" && upstream.porter?.status === "approved";

  const reviewedCount = wb.sections.filter((s) => s.review_status === "reviewed" && !s.needs_revision).length;
  const openContradictions = wb.contradictions.filter((c) => c.resolution === "open");
  const revisionKeys = wb.sections.filter((s) => s.needs_revision).map((s) => s.c_key);

  const blockers: string[] = [];
  if (!upstreamApproved) blockers.push("PESTEL en Porter moeten goedgekeurd zijn");
  if (pestelStale || porterStale) blockers.push("Neem eerst de nieuwste goedgekeurde PESTEL/Porter over");
  if (reviewedCount < 5) blockers.push(`${5 - reviewedCount} onderdeel/onderdelen nog te beoordelen`);
  if (openContradictions.length) blockers.push(`${openContradictions.length} tegenstrijdigheid/-heden open`);
  if (!version.synthesis_reviewed) blockers.push("Strategische samenhang nog niet beoordeeld");
  const canApprove = !readOnly && blockers.length === 0;

  useEffect(() => {
    if (!aiRunning) return;
    const t = setInterval(() => setAiStep((s) => Math.min(s + 1, AI_STEPS.length - 2)), 5000);
    return () => clearInterval(t);
  }, [aiRunning]);

  async function reload(syncSynthesis: boolean) {
    const r = await loadFiveCWorkbenchAction(tenantId);
    if (r.ok && r.data) {
      setWb(r.data);
      if (syncSynthesis) setSynthesisText(r.data.version.synthesis_text);
    }
  }

  async function run(label: string, fn: () => Promise<{ ok: boolean; error?: string }>): Promise<boolean> {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      const r = await fn();
      if (!r.ok) {
        setError(r.error ?? "Actie mislukt");
        return false;
      }
      await reload(["ai", "synthesis", "adopt", "revision"].includes(label) || label.startsWith("ai-"));
      return true;
    } finally {
      setBusy(null);
    }
  }

  async function compose(cKeys?: FiveCKey[]) {
    const label = cKeys?.length === 1 ? `ai-${cKeys[0]}` : "ai";
    setAiStep(0);
    let summary = "";
    const ok = await run(label, async () => {
      const r = await composeFiveCAnalysisAction(tenantId, { versionId: version.id, cKeys });
      if (r.ok && r.data) {
        summary = `${r.data.items} inzichten als concept opgeslagen${r.data.flagged ? ` · ${r.data.flagged} gemarkeerd als niet (voldoende) onderbouwd` : ""}.`;
      }
      return r;
    });
    if (ok) setNotice(summary);
  }

  async function approve() {
    const ok = await run("approve", () =>
      approveFiveCVersionAction(tenantId, { versionId: version.id, expectedUpdatedAt: version.updated_at }),
    );
    if (ok) router.push(`/klanten/${tenantId}/strategie/${SWOT_ROUTE}`);
  }

  const counts = {
    meetings: wb.inputs.meetings.length,
    documents: wb.inputs.pestel_inputs.length,
    pestel: wb.inputs.pestel_insights.length,
    porterForces: wb.inputs.porter_forces.filter((f) => f.intensity !== "unknown" || f.motivation.length > 20).length,
    porterFactors: wb.inputs.porter_factors.length,
    competitors: wb.inputs.porter_scope?.known_competitors.length ?? 0,
  };
  const missing: string[] = [];
  if (counts.meetings === 0 && counts.documents === 0) {
    missing.push("Geen meetings of documenten: bedrijf, klanten en partners zullen vooral als 'Input nodig' verschijnen.");
  }
  if (!wb.inputs.tenant.audit_goal.trim()) missing.push("Het auditdoel in het klantprofiel is leeg.");
  if (counts.pestel === 0) missing.push("Geen PESTEL-inzichten beschikbaar voor Context.");
  if (counts.porterForces < 5) missing.push("Porter is niet volledig ingevuld.");
  if (counts.competitors === 0) missing.push("In Porter staan geen bekende concurrenten.");
  if (version.excluded_inputs.length) missing.push(`${version.excluded_inputs.length} bron(nen) bewust uitgesloten.`);

  function renderSectionCard(cKey: FiveCKey, className?: string) {
    const meta = FIVE_C_META[cKey];
    const Icon = FIVE_C_ICONS[cKey];
    const section = wb.sections.find((s) => s.c_key === cKey);
    const items = wb.items.filter((i) => i.c_key === cKey && i.review_status !== "rejected");
    const findings = items.filter((i) => i.content_type !== "input_needed");
    const gaps = items.filter(
      (i) => i.content_type === "input_needed" && (i.gap_status === "open" || i.gap_status === "queued_meeting"),
    );
    const refs = new Set(items.flatMap((i) => i.refs.map((r) => `${r.ref_type}:${r.ref_id}`)));
    const unsupported = items.filter((i) => i.unsupported).length;
    const reviewed = section?.review_status === "reviewed" && !section.needs_revision;
    return (
      <button
        key={cKey}
        type="button"
        onClick={() => setPanel({ cKey, newItem: false })}
        className={cn(
          "flex flex-col rounded-2xl border bg-vice-surface p-5 text-left transition hover:border-vice-gold/60 hover:shadow-sm",
          reviewed ? "border-emerald-500/40" : section?.needs_revision ? "border-amber-500/50" : "border-vice-border",
          className,
        )}
      >
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-vice-gold/15 p-2 text-vice-gold">
            <Icon className="size-5" aria-hidden />
          </span>
          <div>
            <p className="font-medium text-vice-text">{meta.label}</p>
            <p className="text-xs text-vice-text-muted">{meta.english}</p>
          </div>
        </div>
        <div className="mt-3 flex-1 text-sm">
          {section?.summary || findings.length ?
            <p className="line-clamp-4 text-vice-text">{section?.summary || findings[0]?.finding || findings[0]?.title}</p>
          : <>
              <p className="font-medium text-vice-text-muted">Nog onvoldoende informatie</p>
              <p className="mt-1 text-xs text-vice-text-muted">{meta.emptyNextStep}</p>
            </>
          }
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs">
          <Chip>{findings.length} bevindingen</Chip>
          <Chip>{refs.size} bronnen</Chip>
          {gaps.length > 0 && <Chip tone="amber">{gaps.length} open vragen</Chip>}
          {unsupported > 0 && <Chip tone="red">{unsupported} niet onderbouwd</Chip>}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-vice-border pt-3 text-xs text-vice-text-muted">
          <span>{meta.originLabel}</span>
          {reviewed ?
            <span className="text-emerald-700 dark:text-emerald-300">Beoordeeld</span>
          : section?.needs_revision ?
            <span className="text-amber-700 dark:text-amber-200">Herziening nodig</span>
          : <span>Te beoordelen</span>}
        </div>
      </button>
    );
  }

  return (
    <div className="relative mx-auto max-w-6xl px-6 py-8 md:px-10">
      <header className="mb-6">
        <p className="text-sm text-vice-text-muted">Klanten / {tenantName} / Strategie</p>
        <p className="mt-1 text-xs font-medium uppercase tracking-wide text-vice-gold">
          Stap {MARKETING_5C_FRAMEWORK_INDEX} van {AUDIT_FRAMEWORK_COUNT} · {MARKETING_5C_LABEL}
        </p>
        <AuditStepNav />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-vice-text md:text-3xl">
            {hasAnalysis ? "Hoe past alles bij elkaar?" : "Breng het complete speelveld samen."}
          </h1>
          {readOnly ?
            <Chip tone="green">Goedgekeurd · v{version.version_number}</Chip>
          : hasAnalysis ?
            <Chip tone="gold">Concept · te beoordelen</Chip>
          : null}
        </div>
        <p className="mt-2 max-w-3xl text-sm text-vice-text-muted">
          De 5C-analyse ordent wat al bekend is uit het klantdossier, PESTEL en Porter. Er wordt geen nieuw
          marktonderzoek gedaan en de AI heeft geen toegang tot het web.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <UpstreamBadge tenantId={tenantId} label="PESTEL" route="pestel" used={upstream.pestel} latestApproved={upstream.latest_pestel_approved} />
          <UpstreamBadge tenantId={tenantId} label="Porter" route="porter" used={upstream.porter} latestApproved={upstream.latest_porter_approved} />
          <Chip>Versie {version.version_number}</Chip>
        </div>
      </header>

      {(pestelStale || porterStale) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm">
          <p>
            Er is een nieuwere goedgekeurde versie van {[pestelStale && "PESTEL", porterStale && "Porter"].filter(Boolean).join(" en ")}.
            {readOnly ?
              " Deze goedgekeurde 5C blijft ongewijzigd; maak een nieuwe conceptversie om bij te werken."
            : " Neem ze over; de betrokken onderdelen worden dan opnieuw ter beoordeling gezet."}
          </p>
          {readOnly ?
            <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => void run("revision", () => createFiveCRevisionAction(tenantId))}>
              Nieuwe conceptversie
            </Button>
          : <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => void run("adopt", () => adoptFiveCUpstreamAction(tenantId, { versionId: version.id }))}>
              Nieuwe versies overnemen
            </Button>
          }
        </div>
      )}

      {!upstreamApproved && !readOnly && (
        <p className="mb-4 rounded-lg bg-amber-500/10 px-4 py-2 text-sm text-amber-800 dark:text-amber-200">
          PESTEL en/of Porter zijn nog niet goedgekeurd. Je kunt een concept maken, maar definitief goedkeuren kan pas
          na goedkeuring van beide.
        </p>
      )}

      {error && (
        <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      {notice && (
        <p className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm" role="status">
          {notice}
        </p>
      )}

      {aiRunning && (
        <div className="mb-6 rounded-2xl border-2 border-vice-gold/50 bg-vice-gold/10 px-5 py-4" role="status" aria-live="polite">
          <div className="flex items-center gap-3">
            <Loader2 className="size-5 animate-spin text-vice-gold" aria-hidden />
            <p className="font-semibold">5C-analyse wordt samengesteld uit {active.length} bronnen</p>
          </div>
          <ol className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
            {AI_STEPS.map((s, i) => (
              <li key={s} className={cn("flex items-center gap-2", i > aiStep && "opacity-50")}>
                {i < aiStep ?
                  <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
                : i === aiStep ?
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                : <span className="size-4 rounded-full border border-vice-border" />}
                {s}
              </li>
            ))}
          </ol>
        </div>
      )}

      {!hasAnalysis && !readOnly ?
        <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-2xl border border-vice-border bg-vice-surface p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-vice-text-muted">Aanbod</p>
                <p className="mt-1 text-sm">{wb.inputs.porter_scope?.offering_description || "Nog niet afgebakend in Porter"}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-vice-text-muted">Doelmarkt</p>
                <p className="mt-1 text-sm">
                  {[wb.inputs.porter_scope?.client_segment, wb.inputs.porter_scope?.geo_markets.join(", ")]
                    .filter(Boolean)
                    .join(" · ") || "Nog niet afgebakend in Porter"}
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button type="button" className={cn("gap-2", goldButtonClass)} disabled={busy !== null || active.length === 0} onClick={() => void compose()}>
                <Sparkles className="size-4" aria-hidden />
                Stel de 5C-analyse samen
              </Button>
              <Button type="button" variant="secondary" className="gap-2" onClick={() => setInputsOpen(true)}>
                <FileSearch className="size-4" aria-hidden />
                Bekijk input
              </Button>
            </div>
            <button
              type="button"
              className="mt-4 inline-flex items-center gap-1 text-sm text-vice-text-muted hover:text-vice-gold"
              onClick={() => setPanel({ cKey: "company", newItem: true })}
            >
              <Plus className="size-4" aria-hidden /> Zelf een inzicht toevoegen
            </button>
          </div>
          <div className="rounded-2xl border border-vice-border bg-vice-surface p-6">
            <p className="text-sm font-medium">Beschikbare informatie</p>
            <ul className="mt-3 space-y-1.5 text-sm">
              <li>Klantprofiel {wb.inputs.tenant.name}</li>
              <li>{counts.meetings} meeting(s)</li>
              <li>{counts.documents} document(en) of notitie(s)</li>
              <li>{counts.pestel} PESTEL-inzicht(en)</li>
              <li>
                {counts.porterForces}/5 Porter-krachten · {counts.porterFactors} factoren
              </li>
              <li>{counts.competitors} bekende concurrent(en)</li>
            </ul>
            {missing.length > 0 && (
              <>
                <p className="mt-4 text-sm font-medium">Ontbrekend of aandachtspunt</p>
                <ul className="mt-2 space-y-1 text-xs text-amber-800 dark:text-amber-200">
                  {missing.map((m) => (
                    <li key={m}>· {m}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </section>
      : <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-vice-text-muted">
              {version.ai_generated_at && `Laatst samengesteld ${formatDate(version.ai_generated_at)} · `}
              {active.length} actieve bronnen
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" className="gap-2" onClick={() => setInputsOpen(true)}>
                <FileSearch className="size-4" aria-hidden /> Bekijk input
              </Button>
              {!readOnly && (
                <Button
                  type="button"
                  variant="secondary"
                  className="gap-2 border-vice-gold/40"
                  disabled={busy !== null}
                  title={revisionKeys.length ? "Werkt enkel de onderdelen met nieuwe input bij" : "Werkt alle AI-concepten bij; beoordeelde en eigen inzichten blijven staan"}
                  onClick={() => void compose(revisionKeys.length ? revisionKeys : undefined)}
                >
                  <Sparkles className="size-4" aria-hidden />
                  Bijwerken met AI{revisionKeys.length ? ` (${revisionKeys.length})` : ""}
                </Button>
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-6">
            {renderSectionCard("company", "md:col-span-2")}
            {renderSectionCard("customers", "md:col-span-2")}
            {renderSectionCard("competitors", "md:col-span-2")}
            {renderSectionCard("collaborators", "md:col-span-3")}
            {renderSectionCard("context", "md:col-span-3")}
          </div>

          {wb.contradictions.length > 0 && (
            <section className="mt-8 rounded-2xl border border-amber-500/40 bg-vice-surface p-6">
              <h2 className="text-lg font-medium">Tegenstrijdige informatie</h2>
              <p className="mt-1 text-xs text-vice-text-muted">
                Er wordt niets automatisch gekozen. Leg je beslissing vast; betrokken onderdelen worden opnieuw ter
                beoordeling gezet.
              </p>
              <ul className="mt-4 space-y-4">
                {wb.contradictions.map((c) => {
                  const d = contraDraft[c.id] ?? { resolution: c.resolution, note: c.resolution_note };
                  return (
                    <li key={c.id} className="rounded-xl border border-vice-border p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{c.title}</p>
                        <Chip tone={c.resolution === "open" ? "amber" : "green"}>{RESOLUTION_LABELS[c.resolution]}</Chip>
                        {c.affected_keys.map((k) => (
                          <Chip key={k}>{FIVE_C_META[k]?.label ?? k}</Chip>
                        ))}
                      </div>
                      <p className="mt-1 text-sm">{c.description}</p>
                      <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                        <div>
                          <p className="mb-1 font-medium">Bron A</p>
                          <RefChip tenantId={tenantId} refType={c.source_a.ref_type} refId={c.source_a.ref_id} label={c.source_a.label} date={c.source_a.date} />
                        </div>
                        <div>
                          <p className="mb-1 font-medium">Bron B</p>
                          <RefChip tenantId={tenantId} refType={c.source_b.ref_type} refId={c.source_b.ref_id} label={c.source_b.label} date={c.source_b.date} />
                        </div>
                      </div>
                      {!readOnly && (
                        <div className="mt-3 grid gap-2 sm:grid-cols-[220px_1fr_auto]">
                          <select
                            className={selectClass}
                            value={d.resolution}
                            onChange={(e) =>
                              setContraDraft((m) => ({ ...m, [c.id]: { ...d, resolution: e.target.value as FiveCContradiction["resolution"] } }))
                            }
                          >
                            {Object.entries(RESOLUTION_LABELS).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v}
                              </option>
                            ))}
                          </select>
                          <input
                            className={selectClass}
                            placeholder="Toelichting bij je beslissing"
                            value={d.note}
                            onChange={(e) => setContraDraft((m) => ({ ...m, [c.id]: { ...d, note: e.target.value } }))}
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={busy !== null}
                            onClick={() =>
                              void run("contradiction", () =>
                                resolveFiveCContradictionAction(tenantId, { contradictionId: c.id, resolution: d.resolution, note: d.note }),
                              )
                            }
                          >
                            Vastleggen
                          </Button>
                        </div>
                      )}
                      {c.resolved_at && (
                        <p className="mt-2 text-xs text-vice-text-muted">
                          Beslist op {formatDate(c.resolved_at)}
                          {c.resolution_note && ` — ${c.resolution_note}`}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section
            className={cn(
              "mt-8 rounded-2xl border bg-vice-surface p-6",
              version.synthesis_reviewed ? "border-emerald-500/40" : "border-vice-border",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-medium">Strategische samenhang</h2>
              <Chip tone={version.synthesis_reviewed ? "green" : "neutral"}>
                {version.synthesis_reviewed ? "Beoordeeld" : "Te beoordelen"} · input voor SWOT
              </Chip>
            </div>
            <p className="mt-1 text-xs text-vice-text-muted">
              Hoe bedrijf, klanten, concurrenten, partners en context op elkaar inwerken — elk verband verwijst naar
              zijn bronnen.
            </p>
            {version.coherence_points.length > 0 && (
              <ul className="mt-4 space-y-3">
                {version.coherence_points.map((p, i) => (
                  <li key={i} className="rounded-lg bg-vice-bg/50 p-3 text-sm">
                    <p>{p.statement}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {p.refs.map((r, j) => (
                        <RefChip key={j} tenantId={tenantId} refType={r.ref_type} refId={r.ref_id} label={r.label} date={r.date} />
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <textarea
              className={cn(textareaClass, "mt-4 min-h-[120px]")}
              disabled={readOnly || busy !== null}
              value={synthesisText}
              onChange={(e) => setSynthesisText(e.target.value)}
              placeholder="Vat de belangrijkste verbanden samen voor de SWOT…"
            />
            {!readOnly && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy !== null}
                  onClick={() =>
                    void run("synthesis", () =>
                      saveFiveCSynthesisAction(tenantId, { versionId: version.id, synthesisText, reviewed: false }),
                    )
                  }
                >
                  Opslaan als concept
                </Button>
                <Button
                  type="button"
                  className={goldButtonClass}
                  disabled={busy !== null || synthesisText.trim().length < 20}
                  onClick={() =>
                    void run("synthesis", () =>
                      saveFiveCSynthesisAction(tenantId, { versionId: version.id, synthesisText, reviewed: true }),
                    )
                  }
                >
                  Markeer als beoordeeld
                </Button>
              </div>
            )}
          </section>

          {wb.upstreamRequests.length > 0 && (
            <section className="mt-6 rounded-2xl border border-dashed border-vice-border p-4 text-sm">
              <p className="font-medium">Vastgelegde vragen voor PESTEL en Porter</p>
              <ul className="mt-2 space-y-1 text-xs text-vice-text-muted">
                {wb.upstreamRequests.map((r) => (
                  <li key={r.id}>
                    <span className="font-medium uppercase">{r.target}</span>
                    {r.c_key && ` · ${FIVE_C_META[r.c_key].label}`} — {r.note} ({formatDate(r.created_at)})
                  </li>
                ))}
              </ul>
            </section>
          )}

          <footer className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-vice-border pt-6 text-sm">
            <div className="text-vice-text-muted">
              <p className="font-medium text-vice-text">{reviewedCount} van 5 onderdelen beoordeeld</p>
              {readOnly ?
                <p className="mt-1 text-xs">Goedgekeurd op {formatDate(version.approved_at)} · deze versie is alleen-lezen.</p>
              : blockers.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs">
                    {blockers.map((b) => (
                      <li key={b}>· {b}</li>
                    ))}
                  </ul>
                )
              }
            </div>
            <div className="flex flex-wrap gap-2">
              {readOnly ?
                <>
                  {!(pestelStale || porterStale) && (
                    <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => void run("revision", () => createFiveCRevisionAction(tenantId))}>
                      Nieuwe conceptversie
                    </Button>
                  )}
                  <Button type="button" asChild className={goldButtonClass}>
                    <Link href={`/klanten/${tenantId}/strategie/${SWOT_ROUTE}`}>Naar SWOT →</Link>
                  </Button>
                </>
              : <>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={reviewedCount === 5}
                    onClick={() => {
                      const next = FIVE_C_KEYS.find((k) => {
                        const s = wb.sections.find((x) => x.c_key === k);
                        return !s || s.review_status !== "reviewed" || s.needs_revision;
                      });
                      if (next) setPanel({ cKey: next, newItem: false });
                    }}
                  >
                    Beoordeel onderdelen
                  </Button>
                  <Button type="button" disabled={!canApprove || busy !== null} className={cn(canApprove && goldButtonClass)} onClick={() => void approve()}>
                    {busy === "approve" ?
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden /> Bezig…
                      </>
                    : "Goedkeuren en verder →"}
                  </Button>
                </>
              }
            </div>
          </footer>
        </>
      }

      {panel && (
        <FiveCSectionPanel
          key={`${panel.cKey}-${version.id}-${version.ai_generated_at ?? ""}`}
          tenantId={tenantId}
          wb={wb}
          cKey={panel.cKey}
          catalog={catalog}
          readOnly={readOnly}
          busy={busy}
          run={run}
          startWithNewItem={panel.newItem}
          onClose={() => setPanel(null)}
          onAiRefresh={(k) => void compose([k])}
        />
      )}

      {inputsOpen && (
        <FiveCInputPanel
          tenantId={tenantId}
          versionId={version.id}
          catalog={catalog}
          excluded={version.excluded_inputs}
          readOnly={readOnly}
          busy={busy}
          run={run}
          onClose={() => setInputsOpen(false)}
        />
      )}
    </div>
  );
}
