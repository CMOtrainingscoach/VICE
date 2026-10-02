"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  HelpCircle,
  Info,
  Loader2,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VrioCriterionView } from "@/components/vrio/vrio-criterion-view";
import { Chip, OutcomeBadge, RefChip, formatDate, goldButtonClass, textareaClass } from "@/components/vrio/vrio-ui";
import { AUDIT_FRAMEWORK_COUNT } from "@/lib/pestel/constants";
import { SWOT_ROUTE } from "@/lib/swot/constants";
import {
  BCG_ROUTE,
  VRIO_ANSWER_LABELS,
  VRIO_ANSWER_SYMBOLS,
  VRIO_CRITERIA,
  VRIO_CRITERION_META,
  VRIO_EVIDENCE_LABELS,
  VRIO_FRAMEWORK_INDEX,
  VRIO_OUTCOME_META,
  VRIO_PRIORITY_ACTIONS,
  VRIO_STATUS_LABELS,
  type VrioCriterion,
  type VrioEvidenceLevel,
  type VrioResourceKind,
} from "@/lib/vrio/constants";
import { classifyVrio, explainOutcome, suggestedAction, type VrioAnswers } from "@/lib/vrio/classification";
import { buildVrioCatalog, candidateStrengths, catalogKey } from "@/lib/vrio/input-catalog";
import type { VrioResource, VrioWorkbench } from "@/lib/vrio/types";
import {
  adoptVrioUpstreamAction,
  approveVrioVersionAction,
  createVrioRevisionAction,
  deleteVrioResourceAction,
  loadVrioWorkbenchAction,
  generateVrioSynthesisAction,
  prepareVrioWithAiAction,
  saveVrioResourceAction,
  saveVrioSynthesisAction,
  setVrioResourceReviewAction,
  setVrioResourceSelectionAction,
  splitVrioResourceAction,
} from "@/modules/vrio/actions";
import { cn } from "@/lib/utils";

type View = "select" | "matrix";

function answersOf(resource: VrioResource): VrioAnswers {
  const map = {
    value: "not_assessed",
    rarity: "not_assessed",
    imitability: "not_assessed",
    organization: "not_assessed",
  } as VrioAnswers;
  for (const a of resource.assessments) map[a.criterion] = a.answer;
  return map;
}

export function VrioWorkspace({
  tenantId,
  tenantName,
  initial,
}: {
  tenantId: string;
  tenantName: string;
  initial: VrioWorkbench;
}) {
  const router = useRouter();
  const [wb, setWb] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [view, setView] = useState<View>(initial.resources.length > 0 ? "matrix" : "select");
  const [detail, setDetail] = useState<{ resourceId: string; criterion: VrioCriterion } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [splitFor, setSplitFor] = useState<VrioResource | null>(null);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [synthesisText, setSynthesisText] = useState(initial.version.synthesis_text);

  const version = wb.version;
  const readOnly = version.status === "approved";
  const catalog = useMemo(() => buildVrioCatalog(wb.inputs), [wb.inputs]);
  const strengths = useMemo(() => candidateStrengths(wb.inputs), [wb.inputs]);

  const selected = wb.resources.filter((r) => r.selected);
  const assessedCount = selected.filter((r) => r.assessments.some((a) => a.answer !== "not_assessed")).length;
  const reviewed = selected.filter((r) => r.review_status === "reviewed" && !r.needs_revision);
  const swotStale = Boolean(
    wb.upstream.latest_swot_approved && wb.upstream.latest_swot_approved.id !== version.swot_version_id,
  );

  const reload = useCallback(
    async (syncSynthesis = false) => {
      const r = await loadVrioWorkbenchAction(tenantId);
      if (r.ok && r.data) {
        setWb(r.data);
        if (syncSynthesis) setSynthesisText(r.data.version.synthesis_text);
      }
    },
    [tenantId],
  );

  const run = useCallback(
    async (label: string, fn: () => Promise<{ ok: boolean; error?: string }>) => {
      setBusy(label);
      setError(null);
      setNotice(null);
      try {
        const r = await fn();
        if (!r.ok) {
          setError(r.error ?? "Actie mislukt");
          return false;
        }
        await reload(label === "synthesis" || label === "synthesis-ai" || label === "revision");
        return true;
      } finally {
        setBusy(null);
      }
    },
    [reload],
  );

  async function addStrengthAsResource(item: (typeof strengths)[number]) {
    const refKeys = [catalogKey("swot_item", item.id)];
    await run("resource", () =>
      saveVrioResourceAction(tenantId, {
        versionId: version.id,
        resourceId: null,
        title: item.statement.slice(0, 120),
        description: item.statement,
        kind: "resource",
        evidenceLevel: "observed",
        origin: "swot",
        swotItemId: item.id,
        refKeys,
      }),
    );
  }

  async function prepareAi(resourceIds?: string[]) {
    let summary = "";
    const ok = await run("ai", async () => {
      const r = await prepareVrioWithAiAction(tenantId, { versionId: version.id, resourceIds });
      if (r.ok && r.data) {
        summary = `${r.data.resources} middel(en) voorbereid${r.data.unknowns ? ` · ${r.data.unknowns} criterium/criteria als onbekend bewaard` : ""}. Voorstellen staan als concept klaar.`;
      }
      return r;
    });
    if (ok) {
      setNotice(summary);
      setView("matrix");
    }
  }

  async function approve() {
    const ok = await run("approve", () =>
      approveVrioVersionAction(tenantId, {
        versionId: version.id,
        expectedUpdatedAt: version.updated_at,
      }),
    );
    if (ok) router.push(`/klanten/${tenantId}/strategie/${BCG_ROUTE}`);
  }

  const blockers: string[] = [];
  if (selected.length === 0) blockers.push("Selecteer minstens één middel");
  if (swotStale) blockers.push("Neem eerst de nieuwste goedgekeurde SWOT over");
  if (selected.length > 0 && reviewed.length < selected.length) {
    blockers.push(`${selected.length - reviewed.length} middel(en) nog te beoordelen`);
  }
  if (!version.synthesis_reviewed) blockers.push("Synthese nog niet beoordeeld");
  const canApprove = !readOnly && blockers.length === 0;

  if (detail) {
    const resource = wb.resources.find((r) => r.id === detail.resourceId);
    if (resource) {
      return (
        <VrioCriterionView
          key={`${resource.id}-${detail.criterion}-${resource.assessments.find((a) => a.criterion === detail.criterion)?.updated_at ?? ""}`}
          tenantId={tenantId}
          wb={wb}
          resource={resource}
          criterion={detail.criterion}
          catalog={catalog}
          readOnly={readOnly}
          busy={busy}
          run={run}
          onNavigate={(c) => setDetail(c ? { resourceId: resource.id, criterion: c } : null)}
          onBack={() => setDetail(null)}
        />
      );
    }
  }

  function renderHeader(title: string, subtitle: string) {
    return (
      <header className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-vice-text-muted">
            Klanten / {tenantName} / Strategie · {VRIO_FRAMEWORK_INDEX} van {AUDIT_FRAMEWORK_COUNT} · VRIO
          </p>
          <Button type="button" asChild variant="secondary" className="h-8 text-xs">
            <Link href={`/klanten/${tenantId}/strategie/${SWOT_ROUTE}`}>Terug naar SWOT</Link>
          </Button>
        </div>
        <h1 className="mt-3 text-2xl font-semibold text-vice-text md:text-3xl">{title}</h1>
        <p className="mt-2 text-sm text-vice-text-muted">{subtitle}</p>
        <p className="mt-1 text-xs text-vice-text-muted">
          Versie {version.version_number} · {VRIO_STATUS_LABELS[version.status]}
          {version.ai_generated_at && ` · AI-voorbereiding ${formatDate(version.ai_generated_at)}`}
        </p>
      </header>
    );
  }

  function renderUpstreamBadges() {
    const items = [
      { label: "SWOT", v: wb.upstream.swot, route: SWOT_ROUTE },
      { label: "5C", v: wb.upstream.five_c, route: "marketing-5c" },
      { label: "Porter", v: wb.upstream.porter, route: "porter" },
      { label: "PESTEL", v: wb.upstream.pestel, route: "pestel" },
    ];
    return (
      <div className="mb-4 flex flex-wrap gap-2">
        {items.map((i) => (
          <Link
            key={i.label}
            href={`/klanten/${tenantId}/strategie/${i.route}`}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs hover:border-vice-gold/60",
              i.v?.status === "approved" ?
                "border-emerald-500/40 bg-emerald-500/10"
              : "border-amber-500/40 bg-amber-500/10",
            )}
          >
            {i.v?.status === "approved" ?
              <CheckCircle2 className="size-3.5 text-emerald-600" aria-hidden />
            : <AlertTriangle className="size-3.5 text-amber-600" aria-hidden />}
            {i.label} {i.v ? `v${i.v.version_number}` : "ontbreekt"}
          </Link>
        ))}
      </div>
    );
  }

  function renderBanners() {
    return (
      <>
        {swotStale && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm">
            <p>
              Er is een nieuwere goedgekeurde SWOT.
              {readOnly ?
                " Deze goedgekeurde VRIO blijft ongewijzigd; maak een nieuwe conceptversie."
              : " Neem die over; alleen beoordelingen met gewijzigde bronnen worden als mogelijk verouderd gemarkeerd."}
            </p>
            {readOnly ?
              <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => void run("revision", () => createVrioRevisionAction(tenantId))}>
                Nieuwe conceptversie
              </Button>
            : <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => void run("adopt", () => adoptVrioUpstreamAction(tenantId, { versionId: version.id }))}>
                SWOT-versie overnemen
              </Button>
            }
          </div>
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
      </>
    );
  }

  // ---------------------------------------------------------------- selectie
  if (view === "select") {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8 md:px-10">
        {renderHeader(
          "Welke sterktes maken écht het verschil?",
          "Toets je middelen en competenties aan vier criteria. We gebruiken bestaande inzichten; ontbrekend bewijs blijft zichtbaar.",
        )}
        {renderUpstreamBadges()}
        {renderBanners()}

        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
          <Chip tone={wb.upstream.swot?.status === "approved" ? "green" : "amber"}>
            {wb.upstream.swot?.status === "approved" ? "SWOT goedgekeurd" : "SWOT nog niet goedgekeurd"}
          </Chip>
          <span className="text-vice-text-muted">{strengths.length} sterktes beschikbaar</span>
        </div>

        <section className="rounded-2xl border border-vice-border bg-vice-surface p-6">
          <h2 className="text-base font-medium">Selecteer wat je wilt toetsen</h2>

          {strengths.length === 0 && (
            <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
              Er zijn nog geen goedgekeurde SWOT-sterktes. Vul de SWOT aan of voeg hieronder zelf een middel toe — we
              verzinnen geen middelen.
            </p>
          )}

          <ul className="mt-4 space-y-2">
            {strengths.map((s) => {
              const existing = wb.resources.find((r) => r.swot_item_id === s.id);
              const isOn = Boolean(existing?.selected);
              return (
                <li key={s.id} className="flex items-start gap-3 rounded-xl border border-vice-border px-4 py-3">
                  <input
                    type="checkbox"
                    className="mt-1"
                    disabled={readOnly || busy !== null}
                    checked={isOn}
                    onChange={async () => {
                      if (!existing) {
                        await addStrengthAsResource(s);
                        return;
                      }
                      if (existing.selected) {
                        const reason = window.prompt("Waarom toets je dit niet met VRIO?");
                        if (!reason) return;
                        await run("selection", () =>
                          setVrioResourceSelectionAction(tenantId, {
                            resourceId: existing.id,
                            selected: false,
                            reason,
                          }),
                        );
                      } else {
                        await run("selection", () =>
                          setVrioResourceSelectionAction(tenantId, {
                            resourceId: existing.id,
                            selected: true,
                            reason: "",
                          }),
                        );
                      }
                    }}
                    aria-label={`${s.statement} toetsen`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-vice-text">{s.statement}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Chip tone="gold">Uit SWOT</Chip>
                      {s.refs.slice(0, 2).map((r, i) => (
                        <RefChip key={i} tenantId={tenantId} refType={r.ref_type} refId={r.ref_id} label={r.label} />
                      ))}
                      {existing?.needs_clarification && (
                        <Chip tone="amber">Verduidelijking nodig: welke competentie maakt dit mogelijk?</Chip>
                      )}
                      {existing && !existing.selected && existing.exclusion_reason && (
                        <Chip>Uitgesloten: {existing.exclusion_reason}</Chip>
                      )}
                    </div>
                  </div>
                  {existing && (
                    <button
                      type="button"
                      className="rounded-md p-1 text-vice-text-muted hover:text-vice-gold"
                      onClick={() => setSplitFor(existing)}
                      aria-label="Opsplitsen"
                      title="Te breed? Splits dit op in afzonderlijke middelen"
                    >
                      <ChevronRight className="size-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          {wb.resources.filter((r) => !r.swot_item_id).length > 0 && (
            <ul className="mt-3 space-y-2">
              {wb.resources
                .filter((r) => !r.swot_item_id)
                .map((r) => (
                  <li key={r.id} className="flex items-start gap-3 rounded-xl border border-vice-border px-4 py-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      disabled={readOnly || busy !== null}
                      checked={r.selected}
                      onChange={async () => {
                        const reason = r.selected ? window.prompt("Waarom toets je dit niet met VRIO?") : "";
                        if (r.selected && !reason) return;
                        await run("selection", () =>
                          setVrioResourceSelectionAction(tenantId, {
                            resourceId: r.id,
                            selected: !r.selected,
                            reason: reason ?? "",
                          }),
                        );
                      }}
                      aria-label={`${r.title} toetsen`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-vice-text">{r.title}</p>
                      {r.description && <p className="text-xs text-vice-text-muted">{r.description}</p>}
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <Chip>{r.kind === "competence" ? "Competentie" : "Middel"}</Chip>
                        <Chip tone={r.evidence_level === "hypothesis" ? "amber" : "neutral"}>
                          {VRIO_EVIDENCE_LABELS[r.evidence_level]}
                        </Chip>
                        {r.partner_owned && <Chip tone="violet">Van partner</Chip>}
                      </div>
                    </div>
                    {!readOnly && (
                      <button
                        type="button"
                        className="rounded-md p-1 text-vice-text-muted hover:text-rose-600"
                        onClick={() => void run("resource", () => deleteVrioResourceAction(tenantId, { resourceId: r.id }))}
                        aria-label="Verwijderen"
                      >
                        <X className="size-4" />
                      </button>
                    )}
                  </li>
                ))}
            </ul>
          )}

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {VRIO_CRITERIA.map((c) => {
              const m = VRIO_CRITERION_META[c];
              return (
                <div key={c} className="rounded-xl border border-vice-border bg-vice-bg/40 p-3">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <span className="inline-flex size-5 items-center justify-center rounded-full bg-vice-gold/20 text-[11px] font-semibold text-vice-gold">
                      {m.letter}
                    </span>
                    {m.label}
                  </p>
                  <p className="mt-1 text-xs text-vice-text-muted">{m.question}</p>
                </div>
              );
            })}
          </div>

          {!readOnly && (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button type="button" variant="secondary" className="gap-1" onClick={() => setAddOpen(true)}>
                <Plus className="size-4" aria-hidden /> Middel of competentie toevoegen
              </Button>
              <Button
                type="button"
                className={cn("gap-2", goldButtonClass)}
                disabled={busy !== null || selected.length === 0}
                onClick={() => void prepareAi()}
              >
                {busy === "ai" ?
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                : <Sparkles className="size-4" aria-hidden />}
                Bereid VRIO voor met AI
              </Button>
              {wb.resources.length > 0 && (
                <Button type="button" variant="secondary" onClick={() => setView("matrix")}>
                  Naar de matrix
                </Button>
              )}
            </div>
          )}

          <p className="mt-4 flex items-center gap-1.5 text-xs text-vice-text-muted">
            <Info className="size-3.5" aria-hidden />
            We gebruiken bestaande inzichten. Ontbrekend bewijs blijft zichtbaar en wordt nooit ingevuld als
            &quot;Nee&quot;.
          </p>
        </section>

        {addOpen && (
          <AddResourceDialog
            tenantId={tenantId}
            versionId={version.id}
            catalog={catalog}
            busy={busy}
            run={run}
            onClose={() => setAddOpen(false)}
          />
        )}
        {splitFor && (
          <SplitDialog
            tenantId={tenantId}
            resource={splitFor}
            busy={busy}
            run={run}
            onClose={() => setSplitFor(null)}
          />
        )}
      </div>
    );
  }

  // ------------------------------------------------------------------ matrix
  const visibleResources = onlyOpen ?
      selected.filter(
        (r) =>
          r.review_status !== "reviewed" ||
          r.needs_revision ||
          r.assessments.some((a) => a.answer === "unknown" || a.question_status === "open"),
      )
    : selected;

  const nextAttention = selected.find((r) => r.assessments.some((a) => a.answer === "unknown"));
  const nextAttentionAssessment = nextAttention?.assessments.find((a) => a.answer === "unknown");

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 md:px-10">
      {renderHeader(
        "Van sterkte naar concurrentievoordeel.",
        "De uitkomst volgt uit vaste regels op basis van je antwoorden. Resultaten blijven voorlopig tot jij ze bevestigt.",
      )}
      {renderBanners()}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={readOnly ? "green" : "gold"}>
            {readOnly ? `Goedgekeurd · ${formatDate(version.approved_at)}` : "Concept · te beoordelen"}
          </Chip>
          <label className="flex items-center gap-1.5 text-xs text-vice-text-muted">
            <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
            Alleen open punten
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" className="h-8 text-xs" onClick={() => setView("select")}>
            Middelen aanpassen
          </Button>
          {!readOnly && (
            <Button
              type="button"
              variant="secondary"
              className="h-8 gap-1.5 border-vice-gold/40 text-xs"
              disabled={busy !== null || selected.length === 0}
              onClick={() => void prepareAi()}
            >
              {busy === "ai" ?
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              : <Sparkles className="size-3.5" aria-hidden />}
              Bijwerken met AI
            </Button>
          )}
        </div>
      </div>

      <section className="overflow-x-auto rounded-2xl border border-vice-border bg-vice-surface">
        <table className="w-full min-w-[720px] text-sm">
          <caption className="sr-only">VRIO-matrix per middel of competentie</caption>
          <thead>
            <tr className="border-b border-vice-border text-left text-xs text-vice-text-muted">
              <th scope="col" className="px-4 py-3 font-medium">Middel of competentie</th>
              {VRIO_CRITERIA.map((c) => (
                <th key={c} scope="col" className="px-3 py-3 font-medium">
                  <abbr title={`${VRIO_CRITERION_META[c].label} — ${VRIO_CRITERION_META[c].question}`} className="no-underline">
                    {VRIO_CRITERION_META[c].letter}
                  </abbr>
                </th>
              ))}
              <th scope="col" className="px-4 py-3 font-medium">Voorlopige uitkomst</th>
              <th scope="col" className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {visibleResources.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-vice-text-muted">
                  Geen middelen in deze weergave.
                </td>
              </tr>
            )}
            {visibleResources.map((r) => {
              const answers = answersOf(r);
              const outcome = classifyVrio(answers);
              const isReviewed = r.review_status === "reviewed" && !r.needs_revision;
              return (
                <tr key={r.id} className="border-b border-vice-border/60 last:border-0">
                  <th scope="row" className="px-4 py-3 text-left font-normal">
                    <button
                      type="button"
                      className="text-left hover:text-vice-gold"
                      onClick={() => setDetail({ resourceId: r.id, criterion: "value" })}
                    >
                      {r.title}
                    </button>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.needs_revision && <Chip tone="amber">Mogelijk verouderd</Chip>}
                      {r.partner_owned && <Chip tone="violet">Van partner</Chip>}
                      {r.needs_clarification && <Chip tone="amber">Verduidelijking nodig</Chip>}
                    </div>
                  </th>
                  {VRIO_CRITERIA.map((c) => {
                    const a = r.assessments.find((x) => x.criterion === c);
                    const value = a?.answer ?? "not_assessed";
                    return (
                      <td key={c} className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => setDetail({ resourceId: r.id, criterion: c })}
                          title={`${VRIO_CRITERION_META[c].label}: ${VRIO_ANSWER_LABELS[value]}`}
                          className={cn(
                            "inline-flex min-w-[52px] items-center justify-center rounded-md px-2 py-1 text-xs font-medium",
                            value === "yes" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                            value === "no" && "bg-rose-500/15 text-rose-700 dark:text-rose-300",
                            value === "unknown" && "bg-amber-500/15 text-amber-800 dark:text-amber-200",
                            value === "not_assessed" && "bg-vice-surface-muted text-vice-text-muted",
                          )}
                        >
                          {VRIO_ANSWER_SYMBOLS[value]}
                          {a?.ai_state === "proposed" && <Sparkles className="ml-1 size-3" aria-hidden />}
                        </button>
                      </td>
                    );
                  })}
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1"
                      title={explainOutcome(answers)}
                      onClick={() => setDetail({ resourceId: r.id, criterion: "value" })}
                    >
                      <OutcomeBadge outcome={outcome} label={VRIO_OUTCOME_META[outcome].label} />
                      <HelpCircle className="size-3.5 text-vice-text-muted" aria-hidden />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    {isReviewed ?
                      <Chip tone="green">Beoordeeld</Chip>
                    : <Button
                        type="button"
                        variant="secondary"
                        className="h-7 text-xs"
                        disabled={busy !== null || readOnly}
                        onClick={() =>
                          void run("review", () =>
                            setVrioResourceReviewAction(tenantId, {
                              resourceId: r.id,
                              reviewed: true,
                              revisionNote: "",
                            }),
                          )
                        }
                      >
                        Bevestigen
                      </Button>
                    }
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-vice-text-muted">
        {VRIO_CRITERIA.map((c) => (
          <span key={c}>
            <strong className="text-vice-text">{VRIO_CRITERION_META[c].letter}</strong> {VRIO_CRITERION_META[c].label}
          </span>
        ))}
        <span>· ? = onbekend · — = niet beoordeeld</span>
      </div>

      {nextAttention && nextAttentionAssessment && !readOnly && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <p className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-amber-600" aria-hidden />
            Volgende aandachtspunt: onderbouw {VRIO_CRITERION_META[nextAttentionAssessment.criterion].label.toLowerCase()} van {nextAttention.title}.
          </p>
          <Button
            type="button"
            className={goldButtonClass}
            onClick={() => setDetail({ resourceId: nextAttention.id, criterion: nextAttentionAssessment.criterion })}
          >
            Open beoordeling →
          </Button>
        </div>
      )}

      <section className="mt-8 rounded-2xl border border-vice-border bg-vice-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-medium">Middelen vergelijken</h2>
          <Chip tone={version.synthesis_reviewed ? "green" : "neutral"}>
            {version.synthesis_reviewed ? "Beoordeeld" : "Te beoordelen"}
          </Chip>
        </div>
        <ul className="mt-4 space-y-2 text-sm">
          {selected.map((r) => {
            const answers = answersOf(r);
            const action = suggestedAction(answers);
            return (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-vice-bg/40 px-3 py-2">
                <span>{r.title}</span>
                <span className="flex items-center gap-2">
                  <Chip>{VRIO_PRIORITY_ACTIONS[action]}</Chip>
                  <OutcomeBadge outcome={classifyVrio(answers)} label={VRIO_OUTCOME_META[classifyVrio(answers)].label} />
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-vice-text-muted">
          Dit zijn voorstellen, geen investeringsbeslissingen. De synthese gebruikt alleen middelen die al een antwoord hebben.
        </p>
        <textarea
          className={cn(textareaClass, "mt-4 min-h-[110px]")}
          disabled={readOnly || busy !== null}
          value={synthesisText}
          onChange={(e) => setSynthesisText(e.target.value)}
          placeholder="Wat betekent dit geheel voor de strategie van deze klant?"
        />
        {!readOnly && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              className="gap-2 border-vice-gold/40"
              disabled={busy !== null || assessedCount === 0}
              onClick={() =>
                void (async () => {
                  const ok = await run("synthesis-ai", () =>
                    generateVrioSynthesisAction(tenantId, { versionId: version.id }),
                  );
                  if (ok) setNotice("AI-synthese staat als concept. Markeer ze als beoordeeld; daarna licht verdergaan op.");
                })()
              }
            >
              {busy === "synthesis-ai" ?
                <Loader2 className="size-4 animate-spin" aria-hidden />
              : <Sparkles className="size-4" aria-hidden />}
              Maak AI-synthese
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy !== null}
              onClick={() =>
                void run("synthesis", () =>
                  saveVrioSynthesisAction(tenantId, {
                    versionId: version.id,
                    synthesisText,
                    reviewed: false,
                  }),
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
                  saveVrioSynthesisAction(tenantId, {
                    versionId: version.id,
                    synthesisText,
                    reviewed: true,
                  }),
                )
              }
            >
              Markeer als beoordeeld
            </Button>
          </div>
        )}
      </section>

      <footer className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-vice-border pt-6 text-sm">
        <div className="text-vice-text-muted">
          <p className="font-medium text-vice-text">
            {reviewed.length} van {selected.length} middelen beoordeeld
          </p>
          {readOnly ?
            <p className="mt-1 text-xs">Goedgekeurd op {formatDate(version.approved_at)} · alleen-lezen.</p>
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
              <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => void run("revision", () => createVrioRevisionAction(tenantId))}>
                Nieuwe conceptversie
              </Button>
              <Button type="button" asChild className={goldButtonClass}>
                <Link href={`/klanten/${tenantId}/strategie/${BCG_ROUTE}`}>Naar BCG →</Link>
              </Button>
            </>
          : <>
              <Button
                type="button"
                variant="secondary"
                disabled={selected.length === 0}
                onClick={() => {
                  const next = selected.find((r) => r.review_status !== "reviewed" || r.needs_revision);
                  if (next) setDetail({ resourceId: next.id, criterion: "value" });
                }}
              >
                Beoordeel middelen
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
    </div>
  );
}

function AddResourceDialog({
  tenantId,
  versionId,
  catalog,
  busy,
  run,
  onClose,
}: {
  tenantId: string;
  versionId: string;
  catalog: ReturnType<typeof buildVrioCatalog>;
  busy: string | null;
  run: (label: string, fn: () => Promise<{ ok: boolean; error?: string }>) => Promise<boolean>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<VrioResourceKind>("resource");
  const [evidenceLevel, setEvidenceLevel] = useState<VrioEvidenceLevel>("hypothesis");
  const [partnerOwned, setPartnerOwned] = useState(false);
  const [accessNote, setAccessNote] = useState("");
  const [marketContext, setMarketContext] = useState("");
  const [refKeys, setRefKeys] = useState<string[]>([]);

  const vague = /^(goede|sterke|uitstekende|betere|hoge)\s+\w+$/i.test(title.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-vice-border bg-vice-surface p-6" role="dialog" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-medium">Middel of competentie toevoegen</h2>
        <p className="mt-1 text-xs text-vice-text-muted">
          Dit wijzigt de goedgekeurde SWOT niet. Zonder bron bewaren we dit expliciet als hypothese.
        </p>
        <div className="mt-4 space-y-3">
          <div className="space-y-1">
            <Label>Naam</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            {vague && (
              <p className="text-xs text-amber-700 dark:text-amber-200">
                Welke concrete competentie of welk middel maakt dit mogelijk? Beschrijf dat hieronder.
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label>Beschrijving</Label>
            <textarea className={cn(textareaClass, "min-h-[72px]")} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Type</Label>
              <select className="w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm" value={kind} onChange={(e) => setKind(e.target.value as VrioResourceKind)}>
                <option value="resource">Middel</option>
                <option value="competence">Competentie</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Bewijsstatus</Label>
              <select className="w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm" value={evidenceLevel} onChange={(e) => setEvidenceLevel(e.target.value as VrioEvidenceLevel)}>
                {(Object.keys(VRIO_EVIDENCE_LABELS) as VrioEvidenceLevel[]).map((k) => (
                  <option key={k} value={k}>
                    {VRIO_EVIDENCE_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Marktcontext (optioneel)</Label>
            <Input value={marketContext} onChange={(e) => setMarketContext(e.target.value)} placeholder="Bv. alleen voor de Vlaamse markt" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={partnerOwned} onChange={(e) => setPartnerOwned(e.target.checked)} />
            Dit middel is van een partner
          </label>
          {partnerOwned && (
            <div className="space-y-1">
              <Label>Toegang, controle en afhankelijkheid</Label>
              <textarea className={cn(textareaClass, "min-h-[56px]")} value={accessNote} onChange={(e) => setAccessNote(e.target.value)} />
            </div>
          )}
          <div className="space-y-1">
            <Label>Bronnen koppelen</Label>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-vice-border bg-vice-bg p-2">
              {catalog.map((e) => (
                <label key={e.key} className="flex cursor-pointer items-start gap-2 py-0.5 text-xs">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={refKeys.includes(e.key)}
                    onChange={() => setRefKeys((k) => (k.includes(e.key) ? k.filter((x) => x !== e.key) : [...k, e.key]))}
                  />
                  <span>{e.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            type="button"
            className={goldButtonClass}
            disabled={busy !== null || title.trim().length < 2}
            onClick={async () => {
              const ok = await run("resource", () =>
                saveVrioResourceAction(tenantId, {
                  versionId,
                  resourceId: null,
                  title,
                  description,
                  kind,
                  evidenceLevel: refKeys.length === 0 ? "hypothesis" : evidenceLevel,
                  origin: "manual",
                  partnerOwned,
                  accessNote,
                  marketContext,
                  refKeys,
                }),
              );
              if (ok) onClose();
            }}
          >
            Toevoegen
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuleren
          </Button>
        </div>
      </div>
    </div>
  );
}

function SplitDialog({
  tenantId,
  resource,
  busy,
  run,
  onClose,
}: {
  tenantId: string;
  resource: VrioResource;
  busy: string | null;
  run: (label: string, fn: () => Promise<{ ok: boolean; error?: string }>) => Promise<boolean>;
  onClose: () => void;
}) {
  const [text, setText] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-vice-border bg-vice-surface p-6" role="dialog" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-medium">Te breed? Splits op</h2>
        <p className="mt-1 text-sm text-vice-text-muted">
          &quot;{resource.title}&quot; wordt vervangen door afzonderlijke middelen of competenties. De bronverwijzingen
          gaan mee naar elk onderdeel.
        </p>
        <textarea
          className={cn(textareaClass, "mt-4 min-h-[120px]")}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Eén per regel, bijvoorbeeld:\nPersoonlijke klantbegeleiding\nEigen adviesmethodiek"}
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            className={goldButtonClass}
            disabled={busy !== null || text.split("\n").filter((l) => l.trim().length >= 2).length < 2}
            onClick={async () => {
              const parts = text
                .split("\n")
                .map((l) => l.trim())
                .filter((l) => l.length >= 2)
                .map((title) => ({ title, description: "" }));
              const ok = await run("split", () =>
                splitVrioResourceAction(tenantId, { resourceId: resource.id, parts }),
              );
              if (ok) onClose();
            }}
          >
            Opsplitsen
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuleren
          </Button>
        </div>
      </div>
    </div>
  );
}
