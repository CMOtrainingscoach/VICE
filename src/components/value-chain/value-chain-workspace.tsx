"use client";

import { AlertTriangle, CheckCircle2, Loader2, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ValueChainActivityPanel, type ActivityPatch } from "@/components/value-chain/value-chain-activity-panel";
import { ValueChainFinancePanel } from "@/components/value-chain/value-chain-finance-panel";
import { Chip, formatDate, goldButtonClass, textareaClass } from "@/components/value-chain/value-chain-ui";
import { AUDIT_FRAMEWORK_COUNT } from "@/lib/pestel/constants";
import { BCG_ROUTE } from "@/lib/vrio/constants";
import {
  VC_BUSINESS_LABELS,
  VC_BUSINESS_TYPES,
  VC_CATEGORY_LABELS,
  VC_PRIMARY,
  VC_STATUS_LABELS,
  VC_SUPPORT,
  VALUE_CHAIN_FRAMEWORK_INDEX,
  STP_ROUTE,
  type VcBusinessType,
  type VcCategory,
} from "@/lib/value-chain/constants";
import { buildVcCatalog } from "@/lib/value-chain/input-catalog";
import type { VcActivity, VcWorkbench } from "@/lib/value-chain/types";
import {
  addVcChainAction,
  approveValueChainAction,
  archiveVcActivityAction,
  confirmVcImportAction,
  createVcRevisionAction,
  deleteVcDependencyAction,
  loadValueChainWorkbenchAction,
  prepareValueChainAction,
  resolveVcAiAction,
  saveVcActionAction,
  saveVcActivityAction,
  saveVcAllocationAction,
  saveVcChainAction,
  saveVcDependencyAction,
  saveVcImportAction,
  saveVcSynthesisAction,
  setVcActivityReviewAction,
  setVcApplicabilityAction,
  setVcFinanceFlagsAction,
  setVcLineAction,
} from "@/modules/value-chain/actions";
import { cn } from "@/lib/utils";

type View = "scope" | "chain" | "activity" | "finance";

function blankActivity(chainId: string, category: VcCategory): VcActivity {
  return {
    id: "",
    chain_id: chainId,
    name: "",
    category,
    description: "",
    inputs_text: "",
    outputs_text: "",
    customer_value: "",
    capabilities_note: "",
    owner_name: "",
    execution: "unknown",
    time_value: null,
    time_unit: "",
    time_scope: "",
    time_basis: "unknown",
    time_source: "",
    bottleneck_observation: "",
    bottleneck_explanation: "",
    bottleneck_improvement: "",
    bottleneck_effect: "unknown",
    bottleneck_motivation: "",
    open_question: "",
    question_status: "open",
    question_answer: "",
    advisor_note: "",
    evidence_level: "hypothesis",
    not_applicable: false,
    na_reason: "",
    review_status: "pending",
    needs_revision: false,
    revision_note: "",
    manual_lock: false,
    origin: "manual",
    ai_state: "none",
    ai_description: "",
    ai_customer_value: "",
    ai_bottleneck: "",
    ai_open_question: "",
    sort_order: 0,
    updated_at: "",
    refs: [],
    subactivities: [],
    dependencies: [],
  };
}

export function ValueChainWorkspace({
  tenantId,
  tenantName,
  initial,
  bcg,
}: {
  tenantId: string;
  tenantName: string;
  initial: VcWorkbench;
  bcg?: { approved: boolean; qualitative?: boolean; items?: { title: string; quadrant: string | null; placeable: boolean }[] } | null;
}) {
  const router = useRouter();
  const [wb, setWb] = useState(initial);
  const [chainId, setChainId] = useState(initial.chains[0]?.id ?? "");
  const [view, setView] = useState<View>(initial.chains[0]?.scope_confirmed ? "chain" : "scope");
  const [activityId, setActivityId] = useState<string | null>(null);
  const [draftCategory, setDraftCategory] = useState<VcCategory | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [synthesis, setSynthesis] = useState(initial.version.synthesis_text);
  const [synthesisPublic, setSynthesisPublic] = useState(initial.version.synthesis_public);
  const [actionTitle, setActionTitle] = useState("");

  const chain = wb.chains.find((item) => item.id === chainId) ?? wb.chains[0];
  const version = wb.version;
  const readOnly = version.status === "approved";
  const catalog = useMemo(() => buildVcCatalog(wb.inputs), [wb.inputs]);
  const labels = VC_CATEGORY_LABELS[chain?.business_type ?? "service"];
  const applicable = chain?.activities.filter((activity) => !activity.not_applicable) ?? [];
  const reviewed = applicable.filter((activity) => activity.review_status === "reviewed" && !activity.needs_revision);
  const selected = chain?.activities.find((activity) => activity.id === activityId) ?? (draftCategory && chain ? blankActivity(chain.id, draftCategory) : null);

  async function reload() {
    const loaded = await loadValueChainWorkbenchAction(tenantId);
    if (loaded.ok && loaded.data) {
      setWb(loaded.data);
      setSynthesis(loaded.data.version.synthesis_text);
      setSynthesisPublic(loaded.data.version.synthesis_public);
    }
    return loaded;
  }

  async function run(label: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      const result = await fn();
      if (!result.ok) {
        setError(result.error ?? "Actie mislukt");
        return false;
      }
      await reload();
      return true;
    } finally {
      setBusy(null);
    }
  }

  function openActivity(id: string) {
    setDraftCategory(null);
    setActivityId(id);
    setView("activity");
  }

  const duplicateTime = Boolean(
    selected?.id &&
      selected.time_value &&
      chain?.activities.some(
        (activity) =>
          activity.id !== selected.id &&
          activity.time_value === selected.time_value &&
          activity.time_unit === selected.time_unit &&
          activity.time_scope === selected.time_scope &&
          activity.time_source !== "" &&
          activity.time_source === selected.time_source,
      ),
  );

  if (!chain) {
    return <p className="p-8 text-sm">Geen waardeketen gevonden.</p>;
  }

  if (view === "activity" && selected) {
    return (
      <ValueChainActivityPanel
        key={selected.id || draftCategory || "new"}
        tenantId={tenantId}
        activity={selected}
        businessType={chain.business_type}
        catalog={catalog}
        lines={wb.imports.flatMap((item) => item.lines.map((line) => ({ ...line, scale: item.scale, currency: item.currency })))}
        allocations={wb.allocations}
        financeAccess={wb.finance_access}
        costRate={version.cost_rate}
        costRateConfirmed={version.cost_rate_confirmed}
        costRateUnit={version.cost_rate_unit}
        currency={version.cost_rate_currency || "EUR"}
        readOnly={readOnly}
        busy={busy}
        duplicateTime={duplicateTime}
        otherActivities={chain.activities.filter((activity) => activity.id !== selected.id).map((activity) => ({ id: activity.id, name: activity.name }))}
        vrioResources={wb.inputs.vrio_resources.map((resource) => ({ id: resource.id, title: resource.title }))}
        onBack={() => { setView("chain"); setDraftCategory(null); }}
        onOpenFinance={() => setView("finance")}
        onSave={async (patch) => {
          const ok = await run("activity", () => saveVcActivityAction(tenantId, activityPayload(chain.id, selected, patch)));
          if (ok && !selected.id) {
            setDraftCategory(null);
            setView("chain");
          }
        }}
        onReview={async () => {
          if (!selected.id) return;
          await run("review", () => setVcActivityReviewAction(tenantId, { activityId: selected.id, reviewed: true }));
        }}
        onResolveAi={async (accept) => {
          if (!selected.id) return;
          await run("ai", () => resolveVcAiAction(tenantId, { activityId: selected.id, accept }));
        }}
        onAddDependency={async (input) => {
          if (!selected.id) return;
          await run("dependency", () => saveVcDependencyAction(tenantId, { activityId: selected.id, dependencyId: null, ...input }));
        }}
        onDeleteDependency={async (dependencyId) => {
          await run("dependency", () => deleteVcDependencyAction(tenantId, dependencyId));
        }}
        onExclude={async (reason) => {
          if (!selected.id) return;
          const ok = await run("activity", () => setVcApplicabilityAction(tenantId, { activityId: selected.id, applicable: false, reason }));
          if (ok) setView("chain");
        }}
        onArchive={async (detach) => {
          if (!selected.id || !detach) return;
          const ok = await run("activity", () => archiveVcActivityAction(tenantId, { activityId: selected.id, detach: true }));
          if (ok) setView("chain");
        }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 md:px-10">
      <header className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-vice-text-muted">
            Klanten / {tenantName} / Strategie · {VALUE_CHAIN_FRAMEWORK_INDEX} van {AUDIT_FRAMEWORK_COUNT} · Waardeketen
          </p>
          <Button type="button" asChild variant="secondary" className="h-8 text-xs">
            <Link href={`/klanten/${tenantId}/strategie/${BCG_ROUTE}`}>Terug naar BCG</Link>
          </Button>
        </div>
        <h1 className="mt-3 text-2xl font-semibold text-vice-text md:text-3xl">Waar ontstaat de waarde?</h1>
        <p className="mt-2 text-sm text-vice-text-muted">
          We structureren wat al in het dossier staat. Ontbrekende kosten of marges blijven leeg.
        </p>
        <p className="mt-1 text-xs text-vice-text-muted">
          Versie {version.version_number} · {VC_STATUS_LABELS[version.status]}
          {version.ai_generated_at ? ` · AI-voorbereiding ${formatDate(version.ai_generated_at)}` : ""}
        </p>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        {(["5C", "SWOT", "VRIO", "Porter", "PESTEL"] as const).map((label) => {
          const source = label === "5C" ? wb.upstream.five_c : label === "SWOT" ? wb.upstream.swot : label === "VRIO" ? wb.upstream.vrio : label === "Porter" ? wb.upstream.porter : wb.upstream.pestel;
          return (
            <span key={label} className="inline-flex items-center gap-1 rounded-full border border-vice-border px-3 py-1 text-xs">
              {source ? <CheckCircle2 className="size-3.5 text-emerald-600" aria-hidden /> : <AlertTriangle className="size-3.5 text-amber-600" aria-hidden />}
              {label} {source ? `v${source.version_number}` : label === "VRIO" ? "nog niet goedgekeurd" : "ontbreekt"}
            </span>
          );
        })}
        {bcg?.approved ? (
          <Link href={`/klanten/${tenantId}/strategie/${BCG_ROUTE}`} className="inline-flex items-center rounded-full border border-vice-border px-3 py-1 text-xs">
            BCG {bcg.qualitative ? "kwalitatief" : `v${bcg.items?.filter((item) => item.placeable).length ?? 0} geplaatst`}
          </Link>
        ) : (
          <Link href={`/klanten/${tenantId}/strategie/${BCG_ROUTE}`} className="inline-flex items-center rounded-full border border-vice-border px-3 py-1 text-xs">
            BCG nog open
          </Link>
        )}
      </div>

      {wb.chains.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {wb.chains.map((item) => (
            <Button key={item.id} type="button" variant={item.id === chain.id ? "secondary" : "ghost"} className="h-8 text-xs" onClick={() => setChainId(item.id)}>
              {item.offering || "Nieuwe keten"}
            </Button>
          ))}
        </div>
      )}

      {error && <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
      {notice && <p className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm" role="status">{notice}</p>}
      {chain.needs_revision && (
        <p className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">De afbakening is gewijzigd. Beoordeel de activiteiten opnieuw. Er is geen automatische herberekening.</p>
      )}

      {(view === "scope" || !chain.scope_confirmed) && view !== "finance" && (
        <ScopeForm
          chainId={chain.id}
          initial={{
            offering: chain.offering || wb.inputs.tenant.name,
            businessType: chain.business_type,
            market: chain.market || wb.inputs.porter_scope?.market_sector || "",
            periodLabel: chain.period_label,
            goal: chain.goal || wb.inputs.tenant.audit_goal,
          }}
          busy={busy !== null}
          readOnly={readOnly}
          onSave={async (input) => {
            const ok = await run("scope", () => saveVcChainAction(tenantId, { chainId: chain.id, ...input }));
            if (ok) setView("chain");
          }}
        />
      )}

      {view === "finance" && (
        <div className="mb-6">
          <Button type="button" variant="secondary" className="mb-4 h-8 text-xs" onClick={() => setView("chain")}>← Terug naar de keten</Button>
          {wb.finance_access ? (
            <ValueChainFinancePanel
              imports={wb.imports.filter((item) => item.chain_id === chain.id || item.chain_id == null)}
              allocations={wb.allocations}
              activities={chain.activities}
              offering={chain.offering}
              currencyFallback={version.cost_rate_currency || "EUR"}
              readOnly={readOnly}
              busy={busy}
              onImport={async (draft) => {
                await run("import", () => saveVcImportAction(tenantId, { versionId: version.id, chainId: chain.id, ...draft }));
              }}
              onLine={async (lineId, patch) => {
                await run("line", () => setVcLineAction(tenantId, { lineId, ...patch }));
              }}
              onConfirmImport={async (importId) => {
                await run("import", () => confirmVcImportAction(tenantId, importId));
              }}
              onAllocate={async (input) => {
                await run("allocation", () => saveVcAllocationAction(tenantId, input));
              }}
            />
          ) : (
            <p className="rounded-xl border border-vice-border p-4 text-sm">Je hebt geen financiële leesrechten voor deze klant. De kwalitatieve waardeketen blijft beschikbaar.</p>
          )}
        </div>
      )}

      {view !== "finance" && chain.scope_confirmed && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{chain.offering}</p>
              <p className="text-xs text-vice-text-muted">{VC_BUSINESS_LABELS[chain.business_type]} · {chain.market || "markt niet ingevuld"} · {chain.period_label || "periode niet ingevuld"}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" className="h-8 text-xs" onClick={() => setView("scope")}>Afbakening</Button>
              {!readOnly && (
                <Button type="button" variant="secondary" className="h-8 gap-1 text-xs" disabled={busy !== null} onClick={() => void run("ai", async () => {
                  const result = await prepareValueChainAction(tenantId, { chainId: chain.id, activityId: null });
                  if (result.ok) setNotice("Voorstel bewaard als concept. Bedragen zijn niet geschat.");
                  return result;
                })}>
                  {busy === "ai" ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                  Bereid de waardeketen voor met AI
                </Button>
              )}
            </div>
          </div>

          <p className="mb-3 text-xs text-vice-text-muted">Ondersteunend staat boven primair. Er zijn geen pijlen: dit is geen verplichte volgorde.</p>
          <ActivityRow title="Ondersteunend" categories={VC_SUPPORT} labels={labels} activities={chain.activities} onOpen={openActivity} />
          <ActivityRow title="Primair" categories={VC_PRIMARY} labels={labels} activities={chain.activities} onOpen={openActivity} />

          {!readOnly && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" variant="secondary" className="gap-1" onClick={() => { setActivityId(null); setDraftCategory("operations"); setView("activity"); }}>
                <Plus className="size-4" /> Activiteit toevoegen
              </Button>
              <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => void run("chain", () => addVcChainAction(tenantId, { versionId: version.id }))}>
                Nog een waardeketen
              </Button>
            </div>
          )}

          <section className="mt-8 rounded-2xl border border-vice-border bg-vice-surface p-5">
            <h2 className="text-base font-medium">Financiële onderbouwing</h2>
            <p className="mt-1 text-sm text-vice-text-muted">Voeg een resultatenrekening toe om kosten en marges beter te begrijpen. Zonder upload blijft deze analyse volledig bruikbaar.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" className={goldButtonClass} onClick={() => setView("finance")}>Financieel document toevoegen</Button>
              {!version.finance_deferred && !readOnly && (
                <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => void run("finance", () => setVcFinanceFlagsAction(tenantId, { versionId: version.id, deferred: true, publish: version.publish_financials }))}>
                  Later aanvullen
                </Button>
              )}
            </div>
            {version.finance_deferred && <p className="mt-3 text-xs text-vice-text-muted">Financiële onderbouwing is uitgesteld. Onbekende kosten blokkeren de kwalitatieve analyse niet.</p>}
          </section>

          <section className="mt-8 rounded-2xl border border-vice-border bg-vice-surface p-5">
            <h2 className="text-lg font-medium">Wat betekent dit voor deze klant?</h2>
            <textarea className={cn(textareaClass, "mt-3 min-h-[120px]")} disabled={readOnly || busy !== null} value={synthesis} onChange={(event) => setSynthesis(event.target.value)} placeholder="Waar ontstaat klantwaarde, waar zitten knelpunten, en welke informatie ontbreekt nog?" />
            <label className="mt-3 block text-sm">
              <span className="text-vice-text-muted">Publieke tekst zonder bedragen</span>
              <textarea className={cn(textareaClass, "mt-1 min-h-[72px]")} disabled={readOnly || busy !== null} value={synthesisPublic} onChange={(event) => setSynthesisPublic(event.target.value)} />
            </label>
            {!readOnly && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => void run("synthesis", () => saveVcSynthesisAction(tenantId, { versionId: version.id, synthesisText: synthesis, synthesisPublic, reviewed: false }))}>Opslaan als concept</Button>
                <Button type="button" className={goldButtonClass} disabled={busy !== null || synthesis.trim().length < 20} onClick={() => void run("synthesis", () => saveVcSynthesisAction(tenantId, { versionId: version.id, synthesisText: synthesis, synthesisPublic, reviewed: true }))}>Markeer als beoordeeld</Button>
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Input value={actionTitle} disabled={readOnly} onChange={(event) => setActionTitle(event.target.value)} placeholder="Voorgestelde actie, nog geen opdracht" />
              {!readOnly && (
                <Button type="button" variant="secondary" disabled={busy !== null || actionTitle.trim().length < 3} onClick={() => void run("action", async () => {
                  const result = await saveVcActionAction(tenantId, {
                    versionId: version.id, actionId: null, activityId: null, title: actionTitle, problem: "", expectedOutcome: "", ownerName: "", evaluation: "", deadline: "", status: "proposed",
                  });
                  if (result.ok) setActionTitle("");
                  return result;
                })}>
                  Actie voorstellen
                </Button>
              )}
            </div>
            <ul className="mt-3 space-y-1 text-sm">
              {wb.actions.map((action) => (
                <li key={action.id} className="flex items-center justify-between gap-2">
                  <span>{action.title}</span>
                  <Chip tone={action.status === "confirmed" ? "green" : "neutral"}>{action.status === "confirmed" ? "Bevestigd" : "Voorstel"}</Chip>
                  {!readOnly && action.status === "proposed" && (
                    <Button type="button" variant="secondary" className="h-7 text-xs" disabled={busy !== null} onClick={() => void run("action", () => saveVcActionAction(tenantId, { ...actionPayload(version.id, action), status: "confirmed" }))}>Bevestigen</Button>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <footer className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-vice-border pt-6 text-sm">
            <p>{reviewed.length} van {applicable.length} activiteiten beoordeeld{version.synthesis_reviewed ? " · synthese beoordeeld" : " · synthese nog te beoordelen"}</p>
            {readOnly ? (
              <div className="flex gap-2">
                <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => void run("revision", () => createVcRevisionAction(tenantId))}>Nieuwe conceptversie</Button>
                <Button type="button" asChild className={goldButtonClass}><Link href={`/klanten/${tenantId}/strategie/${STP_ROUTE}`}>Naar STP →</Link></Button>
              </div>
            ) : (
              <Button type="button" className={goldButtonClass} disabled={busy !== null || reviewed.length !== applicable.length || applicable.length === 0 || !version.synthesis_reviewed} onClick={() => void run("approve", async () => {
                const result = await approveValueChainAction(tenantId, { versionId: version.id, expectedUpdatedAt: version.updated_at });
                if (result.ok) router.push(`/klanten/${tenantId}/strategie/${STP_ROUTE}`);
                return result;
              })}>
                Goedkeuren en verder →
              </Button>
            )}
          </footer>
        </>
      )}
    </div>
  );
}

function ActivityRow({
  title,
  categories,
  labels,
  activities,
  onOpen,
}: {
  title: string;
  categories: readonly VcCategory[];
  labels: Record<VcCategory, string>;
  activities: VcActivity[];
  onOpen: (id: string) => void;
}) {
  return (
    <section className="mb-4">
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-vice-text-muted">{title}</h2>
      <div className={cn("grid gap-3", categories.length === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-5")}>
        {categories.map((category) => {
          const rows = activities.filter((activity) => activity.category === category);
          return (
            <div key={category} className="rounded-xl border border-vice-border bg-vice-surface p-3">
              <p className="text-xs text-vice-text-muted">{labels[category]}</p>
              {rows.length === 0 && <p className="mt-2 text-sm text-vice-text-muted">Nog leeg</p>}
              <ul className="mt-2 space-y-2">
                {rows.map((activity) => (
                  <li key={activity.id}>
                    <button type="button" className="w-full rounded-lg border border-transparent px-2 py-1.5 text-left hover:border-vice-gold/50" onClick={() => onOpen(activity.id)}>
                      <span className="block text-sm font-medium">{activity.name}</span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {activity.not_applicable && <Chip>Niet van toepassing</Chip>}
                        {activity.bottleneck_observation && <Chip tone="amber">Knelpunt</Chip>}
                        {(activity.refs.length === 0 || activity.evidence_level === "hypothesis") && <Chip tone="amber">Bewijs nodig</Chip>}
                        {activity.review_status === "reviewed" && !activity.needs_revision ? <Chip tone="green">Beoordeeld</Chip> : <Chip>Te beoordelen</Chip>}
                        {activity.ai_state === "proposed" && <Chip tone="gold">AI-voorstel</Chip>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ScopeForm({
  initial,
  busy,
  readOnly,
  onSave,
}: {
  chainId: string;
  initial: { offering: string; businessType: VcBusinessType; market: string; periodLabel: string; goal: string };
  busy: boolean;
  readOnly: boolean;
  onSave: (input: { offering: string; businessType: VcBusinessType; market: string; periodLabel: string; goal: string }) => Promise<void>;
}) {
  const [offering, setOffering] = useState(initial.offering);
  const [businessType, setBusinessType] = useState<VcBusinessType>(initial.businessType);
  const [market, setMarket] = useState(initial.market);
  const [periodLabel, setPeriodLabel] = useState(initial.periodLabel);
  const [goal, setGoal] = useState(initial.goal);
  return (
    <section className="mb-8 rounded-2xl border border-vice-border bg-vice-surface p-5">
      <h2 className="text-lg font-medium">Wat onderzoeken we?</h2>
      <p className="mt-1 text-sm text-vice-text-muted">Cijfers van het hele bedrijf worden niet vanzelf aan één dienst gekoppeld.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Aanbod of bedrijfsonderdeel<Input className="mt-1" value={offering} disabled={readOnly} onChange={(event) => setOffering(event.target.value)} /></label>
        <label className="text-sm">Bedrijfstype
          <select className="mt-1 w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm" value={businessType} disabled={readOnly} onChange={(event) => setBusinessType(event.target.value as VcBusinessType)}>
            {VC_BUSINESS_TYPES.map((item) => <option key={item} value={item}>{VC_BUSINESS_LABELS[item]}</option>)}
          </select>
        </label>
        <label className="text-sm">Markt of regio<Input className="mt-1" value={market} disabled={readOnly} onChange={(event) => setMarket(event.target.value)} /></label>
        <label className="text-sm">Analyseperiode<Input className="mt-1" value={periodLabel} disabled={readOnly} onChange={(event) => setPeriodLabel(event.target.value)} /></label>
        <label className="text-sm sm:col-span-2">Doel<textarea className={cn(textareaClass, "mt-1")} value={goal} disabled={readOnly} onChange={(event) => setGoal(event.target.value)} /></label>
      </div>
      {!readOnly && (
        <Button type="button" className={cn("mt-4", goldButtonClass)} disabled={busy || offering.trim().length < 2} onClick={() => void onSave({ offering, businessType, market, periodLabel, goal })}>
          Afbakening bewaren
        </Button>
      )}
    </section>
  );
}

function activityPayload(chainId: string, activity: VcActivity, patch: ActivityPatch) {
  return {
    chainId,
    activityId: activity.id || null,
    expectedUpdatedAt: activity.updated_at || null,
    ...patch,
    effect: patch.effect,
    questionStatus: patch.questionStatus as "open" | "answered" | "queued_meeting" | "accepted_open",
  };
}

function actionPayload(versionId: string, action: VcWorkbench["actions"][number]) {
  return {
    versionId,
    actionId: action.id,
    activityId: action.activity_id,
    title: action.title,
    problem: action.problem,
    expectedOutcome: action.expected_outcome,
    ownerName: action.owner_name,
    evaluation: action.evaluation,
    deadline: action.deadline,
    status: "confirmed" as const,
  };
}

