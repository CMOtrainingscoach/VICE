"use client";

import { Plus, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AUDIT_FRAMEWORK_COUNT,
  PESTEL_DIMENSIONS,
  PESTEL_DIMENSION_META,
  PESTEL_FRAMEWORK_INDEX,
  PESTEL_STATUS_LABELS,
  type PestelDimension,
} from "@/lib/pestel/constants";
import type {
  PestelInsight,
  PestelMeetingOption,
  PestelResearchJob,
  PestelVersion,
} from "@/lib/pestel/types";
import {
  cancelPestelResearchAction,
  deletePestelInsightAction,
  runPestelResearchStepAction,
  savePestelInsightAction,
  savePestelScopeAction,
  savePestelSynthesisAction,
  startPestelResearchAction,
} from "@/modules/pestel/actions";
import { cn } from "@/lib/utils";

type PestelWorkspaceProps = {
  tenantId: string;
  tenantName: string;
  initialVersion: PestelVersion;
  initialInsights: PestelInsight[];
  initialMeetings: PestelMeetingOption[];
  initialActiveJob: PestelResearchJob | null;
};

type DraftSource = {
  source_type: "website" | "document" | "meeting" | "manual";
  label: string;
  url: string;
  publisher: string;
  excerpt: string;
  meeting_recording_id: string;
  meeting_offset_ms: string;
};

function emptyDraft(dimension: PestelDimension): Omit<PestelInsight, "id" | "sources"> & {
  sources: DraftSource[];
} {
  return {
    dimension,
    title: "",
    observation: "",
    client_relevance: "",
    opportunity_risk: "unclear",
    impact: "unknown",
    impact_note: "",
    insight_time_horizon: "",
    evidence_level: "hypothesis",
    advisor_note: "",
    origin: "manual",
    review_status: "pending",
    sort_order: 0,
    sources: [],
  };
}

function insightToDraft(ins: PestelInsight) {
  return {
    ...ins,
    sources:
      ins.sources.length > 0 ?
        ins.sources.map((s) => ({
          source_type: s.source_type,
          label: s.label ?? "",
          url: s.url ?? "",
          publisher: s.publisher ?? "",
          excerpt: s.excerpt ?? "",
          meeting_recording_id: s.meeting_recording_id ?? "",
          meeting_offset_ms:
            s.meeting_offset_ms != null ? String(s.meeting_offset_ms) : "",
        }))
      : [],
  };
}

export function PestelWorkspace({
  tenantId,
  tenantName,
  initialVersion,
  initialInsights,
  initialMeetings,
  initialActiveJob,
}: PestelWorkspaceProps) {
  const router = useRouter();
  const researchLoopRef = useRef(false);
  const [version, setVersion] = useState(initialVersion);
  const [insights, setInsights] = useState(initialInsights);
  const [marketSector, setMarketSector] = useState(version.market_sector);
  const [geoMarkets, setGeoMarkets] = useState(version.geo_markets.join(", "));
  const [timeHorizon, setTimeHorizon] = useState(version.time_horizon);
  const [offeringAudience, setOfferingAudience] = useState(version.offering_audience);
  const [researchQuestion, setResearchQuestion] = useState(version.research_question);
  const [synthesisText, setSynthesisText] = useState(version.synthesis_text);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(() => emptyDraft("political"));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<string | null>(null);
  const [researchJobId, setResearchJobId] = useState<string | null>(
    initialActiveJob?.id ?? null,
  );
  const [researchMessage, setResearchMessage] = useState(
    initialActiveJob?.progress?.message ?? "",
  );
  const [researchDimensionsDone, setResearchDimensionsDone] = useState<string[]>(
    initialActiveJob?.progress?.dimensions_done ?? [],
  );

  const researchActive =
    Boolean(researchJobId) ||
    version.status === "research_running" ||
    initialActiveJob?.status === "running" ||
    initialActiveJob?.status === "queued";

  useEffect(() => {
    if (!researchJobId || researchLoopRef.current) return;

    researchLoopRef.current = true;
    let cancelled = false;

    void (async () => {
      while (!cancelled) {
        const step = await runPestelResearchStepAction(tenantId, researchJobId);
        if (!step.ok || !step.data) {
          setError(step.ok ? "Onbekende fout" : step.error);
          setResearchJobId(null);
          break;
        }
        setResearchMessage(step.data.message);
        if (step.data.done) {
          setResearchJobId(null);
          router.refresh();
          break;
        }
      }
      researchLoopRef.current = false;
    })();

    return () => {
      cancelled = true;
      researchLoopRef.current = false;
    };
  }, [researchJobId, tenantId, router]);

  useEffect(() => {
    if (initialActiveJob?.progress?.dimensions_done) {
      setResearchDimensionsDone(initialActiveJob.progress.dimensions_done);
    }
  }, [initialActiveJob]);

  async function startAiResearch() {
    setError(null);
    setBusy("research-start");
    await saveScope();
    const result = await startPestelResearchAction(tenantId, version.id);
    setBusy(null);
    if (!result.ok || !result.data) {
      setError(result.ok ? "Start mislukt" : result.error);
      return;
    }
    setResearchJobId(result.data.jobId);
    setResearchMessage("Onderzoek gestart…");
    researchLoopRef.current = false;
  }

  async function cancelResearch() {
    const jobId = researchJobId ?? initialActiveJob?.id;
    if (!jobId) return;
    setBusy("research-cancel");
    const result = await cancelPestelResearchAction(tenantId, jobId);
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setResearchJobId(null);
    router.refresh();
  }

  const byDimension = useMemo(() => {
    const map = Object.fromEntries(
      PESTEL_DIMENSIONS.map((d) => [d, [] as PestelInsight[]]),
    ) as Record<PestelDimension, PestelInsight[]>;
    for (const ins of insights) {
      map[ins.dimension]?.push(ins);
    }
    return map;
  }, [insights]);

  const reviewedDimensions = PESTEL_DIMENSIONS.filter((d) =>
    byDimension[d].some((i) => i.review_status === "reviewed"),
  ).length;

  function openNew(dimension: PestelDimension) {
    setEditingId(null);
    setDraft(emptyDraft(dimension));
    setPanelOpen(true);
  }

  function openEdit(ins: PestelInsight) {
    setEditingId(ins.id);
    setDraft(insightToDraft(ins));
    setPanelOpen(true);
  }

  async function saveScope() {
    setBusy("scope");
    setError(null);
    const result = await savePestelScopeAction(tenantId, {
      versionId: version.id,
      marketSector,
      geoMarkets: geoMarkets
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      timeHorizon,
      offeringAudience,
      researchQuestion,
    });
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaveState("Afbakening opgeslagen");
    setVersion((v) => ({
      ...v,
      status: v.status === "not_started" ? "draft" : v.status,
    }));
  }

  async function saveInsight(markReviewed: boolean) {
    setBusy("insight");
    setError(null);
    const result = await savePestelInsightAction(tenantId, {
      versionId: version.id,
      insightId: editingId,
      dimension: draft.dimension,
      title: draft.title,
      observation: draft.observation,
      clientRelevance: draft.client_relevance,
      opportunityRisk: draft.opportunity_risk as "opportunity" | "risk" | "both" | "unclear",
      impact: draft.impact as "low" | "medium" | "high" | "unknown",
      impactNote: draft.impact_note,
      insightTimeHorizon: draft.insight_time_horizon,
      evidenceLevel: draft.evidence_level as "provided" | "observed" | "hypothesis",
      advisorNote: draft.advisor_note,
      markReviewed,
      sources: draft.sources.map((s) => ({
        source_type: s.source_type,
        label: s.label,
        url: s.url,
        publisher: s.publisher,
        excerpt: s.excerpt,
        meeting_recording_id: s.meeting_recording_id || undefined,
        meeting_offset_ms:
          s.meeting_offset_ms ? Number.parseInt(s.meeting_offset_ms, 10) : undefined,
      })),
    });
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPanelOpen(false);
    setSaveState(markReviewed ? "Inzicht beoordeeld" : "Concept opgeslagen");
    router.refresh();
  }

  async function removeInsight(id: string) {
    if (!window.confirm("Inzicht verwijderen?")) return;
    setBusy("delete");
    const result = await deletePestelInsightAction(tenantId, id);
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setInsights((prev) => prev.filter((i) => i.id !== id));
    setPanelOpen(false);
  }

  async function saveSynthesis() {
    setBusy("synthesis");
    const result = await savePestelSynthesisAction(tenantId, {
      versionId: version.id,
      synthesisText,
    });
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaveState("Synthese opgeslagen");
  }

  function addSourceRow() {
    setDraft((d) => ({
      ...d,
      sources: [
        ...d.sources,
        {
          source_type: "manual",
          label: "",
          url: "",
          publisher: "",
          excerpt: "",
          meeting_recording_id: "",
          meeting_offset_ms: "",
        },
      ],
    }));
  }

  const showMatrix = insights.length > 0 || version.status !== "not_started";

  return (
    <div className="relative mx-auto max-w-5xl px-6 py-8 md:px-10">
      <header className="mb-8">
        <p className="text-sm text-vice-text-muted">
          Klanten / {tenantName} / Strategie
        </p>
        <p className="mt-1 text-xs font-medium uppercase tracking-wide text-vice-gold">
          Stap {PESTEL_FRAMEWORK_INDEX} van {AUDIT_FRAMEWORK_COUNT} · PESTEL
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-vice-text md:text-3xl">
          Wat beweegt jouw markt?
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-vice-text-muted">
          Breng externe kansen en risico&apos;s in kaart. Versie {version.version_number} ·{" "}
          {PESTEL_STATUS_LABELS[version.status]}
          {version.results_stale && (
            <span className="ml-2 text-amber-600">· Afbakening gewijzigd — resultaten kunnen verouderd zijn</span>
          )}
        </p>
      </header>

      <section className="mb-8 rounded-2xl border border-vice-border bg-vice-surface p-6">
        <h2 className="text-lg font-medium text-vice-text">Onderzoek afbakenen</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="market">Markt / sector</Label>
            <Input id="market" value={marketSector} onChange={(e) => setMarketSector(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="geo">Geografische markt</Label>
            <Input
              id="geo"
              value={geoMarkets}
              onChange={(e) => setGeoMarkets(e.target.value)}
              placeholder="België, Nederland"
            />
            <p className="text-xs text-vice-text-muted">Meerdere regio&apos;s, komma-gescheiden</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="horizon">Tijdshorizon</Label>
            <Input id="horizon" value={timeHorizon} onChange={(e) => setTimeHorizon(e.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="offering">Aanbod en doelgroep</Label>
            <textarea
              id="offering"
              className="min-h-[72px] w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm"
              value={offeringAudience}
              onChange={(e) => setOfferingAudience(e.target.value)}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="rq">Specifieke onderzoeksvraag (optioneel)</Label>
            <Input
              id="rq"
              value={researchQuestion}
              onChange={(e) => setResearchQuestion(e.target.value)}
            />
          </div>
        </div>
        {researchActive && (
          <div
            className="mt-4 rounded-xl border border-vice-gold/40 bg-vice-surface-muted/60 px-4 py-3 text-sm"
            role="status"
          >
            <p className="font-medium text-vice-text">AI-onderzoek bezig</p>
            <p className="mt-1 text-vice-text-muted">{researchMessage || "Even geduld…"}</p>
            <p className="mt-2 text-xs text-vice-text-muted">
              Stappen: klantinformatie → per PESTEL-perspectief (met bronnen) → concept opslaan.
              Model: configureer via{" "}
              <code className="text-[11px]">VICE_PESTEL_RESEARCH_MODEL</code> (default{" "}
              <code className="text-[11px]">gpt-4o</code>).
            </p>
            {researchDimensionsDone.length > 0 && (
              <p className="mt-1 text-xs text-vice-text-muted">
                Verwerkt: {researchDimensionsDone.join(", ")}
              </p>
            )}
            <Button
              type="button"
              variant="ghost"
              className="mt-2 h-8 text-xs"
              disabled={busy !== null}
              onClick={cancelResearch}
            >
              Annuleren
            </Button>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <Button type="button" variant="secondary" disabled={busy !== null || researchActive} onClick={saveScope}>
            Afbakening opslaan
          </Button>
          <Button
            type="button"
            className="bg-vice-gold text-[#1a1814] hover:bg-vice-gold-hover"
            disabled={busy !== null || researchActive}
            onClick={startAiResearch}
          >
            <Sparkles className="size-4" aria-hidden />
            Onderzoek de markt met AI
          </Button>
          <Button type="button" variant="ghost" onClick={() => openNew("political")}>
            <Plus className="size-4" aria-hidden />
            Zelf een inzicht toevoegen
          </Button>
        </div>
      </section>

      {showMatrix && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs text-amber-800 dark:text-amber-200">
              Concept — te beoordelen
            </span>
            <Button type="button" variant="secondary" disabled title="Sprint 2">
              Opnieuw onderzoeken
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {PESTEL_DIMENSIONS.map((dim) => {
              const meta = PESTEL_DIMENSION_META[dim];
              const list = byDimension[dim];
              const preview = list.slice(0, 2);
              return (
                <article
                  key={dim}
                  className={cn(
                    "rounded-xl border border-vice-border bg-vice-surface p-4 border-l-4",
                    meta.accent,
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-medium text-vice-text">{meta.label}</h3>
                      <p className="text-xs text-vice-text-muted">{meta.hint}</p>
                    </div>
                    <button
                      type="button"
                      className="rounded-md p-1 text-vice-text-muted hover:bg-vice-surface-muted hover:text-vice-gold"
                      aria-label={`Inzicht toevoegen ${meta.label}`}
                      onClick={() => openNew(dim)}
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
                  {list.length === 0 ? (
                    <p className="mt-4 text-sm text-vice-text-muted">
                      Nog geen inzichten. Voeg handmatig toe of start later AI-onderzoek.
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {preview.map((ins) => (
                        <li key={ins.id}>
                          <button
                            type="button"
                            className="w-full text-left text-sm hover:text-vice-gold"
                            onClick={() => openEdit(ins)}
                          >
                            {ins.origin === "ai" && (
                              <span className="mr-2 rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-300">
                                AI-voorstel
                              </span>
                            )}
                            {ins.title || "Zonder titel"}
                          </button>
                          <p className="text-xs text-vice-text-muted">
                            {ins.sources.length} bron{ins.sources.length === 1 ? "" : "nen"} ·{" "}
                            {ins.review_status === "reviewed" ? "Beoordeeld" : "Open"}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                  {list.length > 2 && (
                    <p className="mt-2 text-xs text-vice-text-muted">+{list.length - 2} meer</p>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    className="mt-3 h-8 px-0 text-xs text-vice-gold"
                    onClick={() => (list[0] ? openEdit(list[0]) : openNew(dim))}
                  >
                    {list.length ? "Bekijken" : "Inzicht toevoegen"}
                  </Button>
                </article>
              );
            })}
          </div>

          <section className="mt-8 rounded-2xl border border-vice-border bg-vice-surface p-6">
            <h2 className="text-lg font-medium">Wat betekent dit voor {tenantName}?</h2>
            <p className="mt-1 text-xs text-vice-text-muted">
              Strategische synthese — pas aan wanneer inzichten wijzigen
              {version.synthesis_stale && " · herziening aanbevolen"}
            </p>
            <textarea
              className="mt-4 min-h-[120px] w-full rounded-xl border border-vice-border bg-vice-bg px-4 py-3 text-sm"
              value={synthesisText}
              onChange={(e) => setSynthesisText(e.target.value)}
              placeholder="Belangrijkste externe kansen, risico's, richting en open vragen…"
            />
            <Button
              type="button"
              className="mt-3"
              variant="secondary"
              disabled={busy !== null}
              onClick={saveSynthesis}
            >
              Synthese opslaan
            </Button>
          </section>

          <footer className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-vice-border pt-6 text-sm">
            <p className="text-vice-text-muted">
              {reviewedDimensions} van 6 perspectieven met beoordeeld inzicht
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" disabled>
                Beoordeel inzichten
              </Button>
              <Button type="button" disabled title="Goedkeuring volgt in sprint 3">
                Goedkeuren en verder
              </Button>
            </div>
          </footer>
        </>
      )}

      {!showMatrix && (
        <p className="text-sm text-vice-text-muted">
          Sla de afbakening op of voeg een inzicht toe om de matrix te starten.
        </p>
      )}

      {saveState && (
        <p className="mt-4 text-sm text-green-700" role="status">
          {saveState}
        </p>
      )}
      {error && (
        <p className="mt-4 text-sm text-vice-danger" role="alert">
          {error}
        </p>
      )}

      {panelOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/40"
          role="presentation"
          onClick={() => setPanelOpen(false)}
        >
          <aside
            className="flex h-full w-full max-w-md flex-col border-l border-vice-border bg-vice-surface shadow-xl"
            role="dialog"
            aria-labelledby="pestel-panel-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-vice-border px-5 py-4">
              <h2 id="pestel-panel-title" className="text-lg font-medium">
                Inzicht bewerken
              </h2>
              <button type="button" className="rounded-md p-1 hover:bg-vice-surface-muted" onClick={() => setPanelOpen(false)}>
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {editingId && draft.origin === "ai" && (
                <p className="rounded-lg bg-sky-500/10 px-3 py-2 text-xs text-vice-text-muted">
                  AI-voorstel — controleer feiten en open elke bron (feit vs. duiding) vóór goedkeuring.
                </p>
              )}
              <div className="space-y-2">
                <Label>Perspectief</Label>
                <select
                  className="w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm"
                  value={draft.dimension}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, dimension: e.target.value as PestelDimension }))
                  }
                >
                  {PESTEL_DIMENSIONS.map((d) => (
                    <option key={d} value={d}>
                      {PESTEL_DIMENSION_META[d].label}
                    </option>
                  ))}
                </select>
              </div>
              <Field label="Titel" value={draft.title} onChange={(v) => setDraft((d) => ({ ...d, title: v }))} />
              <FieldArea
                label="Waarneming"
                value={draft.observation}
                onChange={(v) => setDraft((d) => ({ ...d, observation: v }))}
              />
              <FieldArea
                label="Betekenis voor deze klant"
                value={draft.client_relevance}
                onChange={(v) => setDraft((d) => ({ ...d, client_relevance: v }))}
              />
              <div className="grid grid-cols-2 gap-3">
                <SelectField
                  label="Kans / risico"
                  value={draft.opportunity_risk}
                  options={[
                    ["unclear", "Onduidelijk"],
                    ["opportunity", "Kans"],
                    ["risk", "Risico"],
                    ["both", "Beide"],
                  ]}
                  onChange={(v) => setDraft((d) => ({ ...d, opportunity_risk: v }))}
                />
                <SelectField
                  label="Impact"
                  value={draft.impact}
                  options={[
                    ["unknown", "Onbekend"],
                    ["low", "Laag"],
                    ["medium", "Middel"],
                    ["high", "Hoog"],
                  ]}
                  onChange={(v) => setDraft((d) => ({ ...d, impact: v }))}
                />
              </div>
              <Field label="Impact toelichting" value={draft.impact_note} onChange={(v) => setDraft((d) => ({ ...d, impact_note: v }))} />
              <Field label="Tijdshorizon inzicht" value={draft.insight_time_horizon} onChange={(v) => setDraft((d) => ({ ...d, insight_time_horizon: v }))} />
              <SelectField
                label="Onderbouwing"
                value={draft.evidence_level}
                options={[
                  ["hypothesis", "Hypothese"],
                  ["observed", "Waargenomen"],
                  ["provided", "Aangeleverd"],
                ]}
                onChange={(v) => setDraft((d) => ({ ...d, evidence_level: v }))}
              />
              <FieldArea
                label="Eigen aanvulling (Hardwig)"
                value={draft.advisor_note}
                onChange={(v) => setDraft((d) => ({ ...d, advisor_note: v }))}
              />

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Label>Bronnen</Label>
                  <Button type="button" variant="ghost" className="h-8 text-xs" onClick={addSourceRow}>
                    + Bron
                  </Button>
                </div>
                {draft.sources.length === 0 && (
                  <p className="text-xs text-vice-text-muted">Optioneel — meeting, website of documentverwijzing</p>
                )}
                {draft.sources.length === 0 && editingId && (
                  <div className="mb-3 space-y-2 rounded-lg border border-dashed border-vice-border p-3">
                    <p className="text-xs font-medium text-vice-text-muted">Opgeslagen bronnen (alleen-lezen)</p>
                    {(insights.find((i) => i.id === editingId)?.sources ?? []).map((src) => (
                      <SourceEvidenceCard key={src.id ?? src.label} src={src} tenantId={tenantId} />
                    ))}
                  </div>
                )}
                {draft.sources.map((src, idx) => (
                  <div key={idx} className="mb-3 rounded-lg border border-vice-border p-3 space-y-2">
                    <select
                      className="w-full rounded-md border border-vice-border bg-vice-bg px-2 py-1 text-sm"
                      value={src.source_type}
                      onChange={(e) => {
                        const val = e.target.value as DraftSource["source_type"];
                        setDraft((d) => {
                          const sources = [...d.sources];
                          sources[idx] = { ...sources[idx], source_type: val };
                          return { ...d, sources };
                        });
                      }}
                    >
                      <option value="manual">Vrije referentie</option>
                      <option value="website">Website</option>
                      <option value="meeting">Meeting</option>
                      <option value="document">Document</option>
                    </select>
                    {src.source_type === "meeting" && (
                      <select
                        className="w-full rounded-md border border-vice-border bg-vice-bg px-2 py-1 text-sm"
                        value={src.meeting_recording_id}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDraft((d) => {
                            const sources = [...d.sources];
                            const meeting = initialMeetings.find((m) => m.id === val);
                            sources[idx] = {
                              ...sources[idx],
                              meeting_recording_id: val,
                              label: meeting?.title ?? sources[idx].label,
                            };
                            return { ...d, sources };
                          });
                        }}
                      >
                        <option value="">Kies meeting</option>
                        {initialMeetings.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.title}
                          </option>
                        ))}
                      </select>
                    )}
                    <Input
                      placeholder="Label / titel"
                      value={src.label}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDraft((d) => {
                          const sources = [...d.sources];
                          sources[idx] = { ...sources[idx], label: val };
                          return { ...d, sources };
                        });
                      }}
                    />
                    {src.source_type === "website" && (
                      <Input
                        placeholder="URL"
                        value={src.url}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDraft((d) => {
                            const sources = [...d.sources];
                            sources[idx] = { ...sources[idx], url: val };
                            return { ...d, sources };
                          });
                        }}
                      />
                    )}
                    <textarea
                      className="min-h-[60px] w-full rounded-md border border-vice-border bg-vice-bg px-2 py-1 text-sm"
                      placeholder="Fragment / toelichting"
                      value={src.excerpt}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDraft((d) => {
                          const sources = [...d.sources];
                          sources[idx] = { ...sources[idx], excerpt: val };
                          return { ...d, sources };
                        });
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-vice-border px-5 py-4">
              {editingId && (
                <Button type="button" variant="ghost" className="text-vice-danger" disabled={busy !== null} onClick={() => removeInsight(editingId)}>
                  Verwijderen
                </Button>
              )}
              <div className="ml-auto flex flex-wrap gap-2">
                <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => saveInsight(false)}>
                  Opslaan als concept
                </Button>
                <Button
                  type="button"
                  className="bg-vice-gold text-[#1a1814] hover:bg-vice-gold-hover"
                  disabled={busy !== null}
                  onClick={() => saveInsight(true)}
                >
                  Opslaan als beoordeeld
                </Button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function FieldArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <textarea
        className="min-h-[80px] w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function SourceEvidenceCard({
  src,
  tenantId,
}: {
  src: PestelInsight["sources"][number];
  tenantId: string;
}) {
  return (
    <div className="rounded-md bg-vice-surface-muted/50 p-2 text-xs">
      <p className="font-medium text-vice-text">
        {src.is_ai_interpretation ? "Duiding (AI)" : "Feit / bron"}
        {" · "}
        {src.label}
      </p>
      {src.url && (
        <a
          href={src.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 block text-vice-gold hover:underline"
        >
          {src.url}
        </a>
      )}
      {src.meeting_recording_id && (
        <a
          href={`/klanten/${tenantId}/meetings/${src.meeting_recording_id}`}
          className="mt-1 block text-vice-gold hover:underline"
        >
          Open meeting
          {src.meeting_offset_ms != null ?
            ` · ${Math.floor(src.meeting_offset_ms / 60_000)} min in opname`
          : ""}
        </a>
      )}
      <p className="mt-2 whitespace-pre-wrap text-vice-text-muted">{src.excerpt}</p>
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <select
        className="w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}
