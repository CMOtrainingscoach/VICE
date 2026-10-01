"use client";

import { CheckCircle2, Loader2, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AUDIT_FRAMEWORK_COUNT } from "@/lib/pestel/constants";
import {
  PORTER_FORCE_META,
  PORTER_FORCES,
  PORTER_FRAMEWORK_INDEX,
  PORTER_INTENSITY_LABELS,
  PORTER_STATUS_LABELS,
  porterIntensityBadgeClass,
  type PorterForceKey,
  type PorterIntensity,
} from "@/lib/porter/constants";
import { validatePorterScopeForResearch } from "@/lib/porter/market-scope";
import type { PorterForce, PorterVersion, PorterWorkbench } from "@/lib/porter/types";
import {
  cancelPorterResearchAction,
  loadPorterWorkbenchAction,
  runPorterResearchStepAction,
  savePorterForceAction,
  savePorterScopeAction,
  savePorterSynthesisAction,
  startPorterResearchAction,
} from "@/modules/porter/actions";
import { cn } from "@/lib/utils";

type PorterWorkspaceProps = {
  tenantId: string;
  tenantName: string;
  initial: PorterWorkbench;
};

function parseCompetitorsText(text: string): { name: string; url?: string }[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, url] = line.split("|").map((p) => p.trim());
      return url ? { name, url } : { name };
    });
}

function competitorsToText(list: PorterVersion["known_competitors"]): string {
  return list
    .map((c) => (c.url ? `${c.name} | ${c.url}` : c.name))
    .join("\n");
}

export function PorterWorkspace({ tenantId, tenantName, initial }: PorterWorkspaceProps) {
  const router = useRouter();
  const researchLoopRef = useRef(false);
  const [version, setVersion] = useState(initial.version);
  const [forces, setForces] = useState(initial.forces);
  const [pestelContext] = useState(initial.pestelContext);

  const [marketSector, setMarketSector] = useState(version.market_sector);
  const [offering, setOffering] = useState(version.offering_description);
  const [geoMarkets, setGeoMarkets] = useState(version.geo_markets.join(", "));
  const [clientSegment, setClientSegment] = useState(version.client_segment);
  const [timeHorizon, setTimeHorizon] = useState(version.time_horizon);
  const [researchQuestion, setResearchQuestion] = useState(version.research_question);
  const [competitorsText, setCompetitorsText] = useState(
    competitorsToText(version.known_competitors),
  );
  const [synthesisText, setSynthesisText] = useState(version.synthesis_text);

  const [panelForce, setPanelForce] = useState<PorterForce | null>(null);
  const [forceDraft, setForceDraft] = useState({
    intensity: "unknown" as PorterIntensity,
    motivation: "",
    client_relevance: "",
    advisor_note: "",
    headline_factor: "",
  });

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initial.lastResearchError);
  const [saveState, setSaveState] = useState<string | null>(null);
  const [researchJobId, setResearchJobId] = useState<string | null>(
    initial.activeResearchJob?.id ?? null,
  );
  const [researchMessage, setResearchMessage] = useState(
    initial.activeResearchJob?.progress?.message ?? "",
  );
  const [researchForcesDone, setResearchForcesDone] = useState<string[]>(
    initial.activeResearchJob?.progress?.forces_done ?? [],
  );

  const researchActive =
    Boolean(researchJobId) ||
    version.status === "research_running" ||
    initial.activeResearchJob?.status === "running" ||
    initial.activeResearchJob?.status === "queued";

  const researchUiActive =
    researchActive || busy === "research-start" || busy === "research-step";

  const researchProgressPct = Math.round(
    (researchForcesDone.length / PORTER_FORCES.length) * 100,
  );

  const reloadWorkbench = useCallback(async () => {
    const reloaded = await loadPorterWorkbenchAction(tenantId);
    if (reloaded.ok && reloaded.data) {
      setForces(reloaded.data.forces);
      setVersion(reloaded.data.version);
    }
  }, [tenantId]);

  const forcesByKey = useMemo(() => {
    const map = Object.fromEntries(PORTER_FORCES.map((k) => [k, null as PorterForce | null]));
    for (const f of forces) {
      map[f.force_key as PorterForceKey] = f;
    }
    return map as Record<PorterForceKey, PorterForce | null>;
  }, [forces]);

  const reviewedForces = forces.filter((f) => f.review_status === "reviewed").length;

  const hasForceInput = forces.some(
    (f) => f.headline_factor.trim() || f.motivation.trim() || f.intensity !== "unknown",
  );

  useEffect(() => {
    if (!researchJobId || researchLoopRef.current) return;

    researchLoopRef.current = true;
    let cancelled = false;
    const jobId = researchJobId;

    void (async () => {
      while (!cancelled) {
        setBusy("research-step");
        setVersion((v) => ({ ...v, status: "research_running" }));
        const step = await runPorterResearchStepAction(tenantId, jobId);
        setBusy(null);
        if (!step.ok || !step.data) {
          setError(step.ok ? "Onbekende fout" : step.error);
          setResearchJobId(null);
          void reloadWorkbench();
          break;
        }

        setResearchMessage(step.data.message);
        setResearchForcesDone(step.data.forcesDone);

        if (step.data.status === "failed") {
          setError(step.data.message);
          setResearchJobId(null);
          void reloadWorkbench();
          break;
        }

        await reloadWorkbench();

        if (step.data.done) {
          setResearchJobId(null);
          setVersion((v) => ({
            ...v,
            status: step.data?.status === "completed" ? "draft" : v.status,
          }));
          if (step.data.status === "completed") {
            setSaveState("AI-analyse afgerond — bekijk en beoordeel elke kracht.");
            setError(null);
          }
          break;
        }
      }
      researchLoopRef.current = false;
    })();

    return () => {
      cancelled = true;
      researchLoopRef.current = false;
    };
  }, [researchJobId, tenantId, reloadWorkbench]);

  useEffect(() => {
    if (initial.activeResearchJob?.id && !researchJobId) {
      setResearchJobId(initial.activeResearchJob.id);
      setResearchMessage(initial.activeResearchJob.progress?.message ?? "Analyse hervat…");
      researchLoopRef.current = false;
    }
  }, [initial.activeResearchJob, researchJobId]);

  async function saveScope(silent = false): Promise<boolean> {
    setBusy("scope");
    if (!silent) setError(null);
    const geo = geoMarkets
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const result = await savePorterScopeAction(tenantId, {
      versionId: version.id,
      marketSector,
      offeringDescription: offering,
      geoMarkets: geo,
      clientSegment,
      timeHorizon,
      researchQuestion,
      knownCompetitors: parseCompetitorsText(competitorsText),
    });
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    if (!silent) setSaveState("Marktafbakening opgeslagen");
    setVersion((v) => ({ ...v, status: v.status === "not_started" ? "draft" : v.status }));
    return true;
  }

  async function startAiAnalysis() {
    setError(null);
    setSaveState(null);
    const scopeCheck = validatePorterScopeForResearch({
      tenantName,
      marketSector,
      offeringDescription: offering,
      clientSegment,
      geoMarkets: geoMarkets
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
    });
    if (!scopeCheck.ok) {
      setError(scopeCheck.message);
      return;
    }
    setBusy("research-start");
    const scopeOk = await saveScope(true);
    if (!scopeOk) {
      setBusy(null);
      return;
    }
    const result = await startPorterResearchAction(tenantId, version.id);
    setBusy(null);
    if (!result.ok || !result.data) {
      setError(result.ok ? "Start mislukt" : result.error);
      return;
    }
    setResearchForcesDone([]);
    setResearchJobId(result.data.jobId);
    setResearchMessage(
      "Analyse gestart — live web + AI per kracht (kan enkele minuten duren)…",
    );
    researchLoopRef.current = false;
  }

  async function cancelResearch() {
    const jobId = researchJobId ?? initial.activeResearchJob?.id;
    if (!jobId) return;
    setBusy("research-cancel");
    const result = await cancelPorterResearchAction(tenantId, jobId);
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setResearchJobId(null);
    router.refresh();
  }

  async function saveSynthesis() {
    setBusy("synthesis");
    const result = await savePorterSynthesisAction(tenantId, {
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

  function openForce(f: PorterForce) {
    setPanelForce(f);
    setForceDraft({
      intensity: (f.intensity as PorterIntensity) || "unknown",
      motivation: f.motivation,
      client_relevance: f.client_relevance,
      advisor_note: f.advisor_note,
      headline_factor: f.headline_factor,
    });
  }

  async function saveForce(markReviewed: boolean) {
    if (!panelForce) return;
    setBusy("force");
    setError(null);
    const result = await savePorterForceAction(tenantId, {
      versionId: version.id,
      forceId: panelForce.id,
      forceKey: panelForce.force_key as PorterForceKey,
      intensity: forceDraft.intensity,
      motivation: forceDraft.motivation,
      clientRelevance: forceDraft.client_relevance,
      advisorNote: forceDraft.advisor_note,
      headlineFactor: forceDraft.headline_factor,
      markReviewed,
    });
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const reloaded = await loadPorterWorkbenchAction(tenantId);
    if (reloaded.ok && reloaded.data) {
      setForces(reloaded.data.forces);
      setVersion(reloaded.data.version);
    }
    setPanelForce(null);
    setSaveState(markReviewed ? "Kracht beoordeeld" : "Kracht opgeslagen");
  }

  function ForceCard({ forceKey, className }: { forceKey: PorterForceKey; className?: string }) {
    const meta = PORTER_FORCE_META[forceKey];
    const f = forcesByKey[forceKey];
    if (!f) return null;
    const intensity = (f.intensity as PorterIntensity) || "unknown";
    return (
      <button
        type="button"
        className={cn(
          "rounded-2xl border border-vice-border bg-vice-surface p-4 text-left shadow-sm transition hover:border-vice-gold/50 hover:shadow-md",
          className,
        )}
        onClick={() => openForce(f)}
      >
        <p className="text-xs font-medium uppercase tracking-wide text-vice-text-muted">
          {meta.shortLabel}
        </p>
        <span
          className={cn(
            "mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium",
            porterIntensityBadgeClass(intensity),
          )}
        >
          {PORTER_INTENSITY_LABELS[intensity]}
        </span>
        <p className="mt-2 line-clamp-2 text-sm text-vice-text">
          {f.headline_factor || meta.question}
        </p>
        <p className="mt-2 text-xs text-vice-text-muted">
          {f.source_count} bron{f.source_count === 1 ? "" : "nen"} ·{" "}
          {f.review_status === "reviewed" ? "Beoordeeld" : "Open"}
        </p>
      </button>
    );
  }

  return (
    <div className="relative mx-auto max-w-5xl px-6 py-8 md:px-10">
      <header className="mb-8">
        <p className="text-sm text-vice-text-muted">
          <Link href={`/klanten/${tenantId}/strategie/pestel`} className="hover:text-vice-gold">
            ← PESTEL
          </Link>
          {" · "}
          Klanten / {tenantName} / Strategie
        </p>
        <p className="mt-1 text-xs font-medium uppercase tracking-wide text-vice-gold">
          Stap {PORTER_FRAMEWORK_INDEX} van {AUDIT_FRAMEWORK_COUNT} · Porter
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-vice-text md:text-3xl">
          Hoe sterk is jouw positie in de markt?
        </h1>
        <p className="mt-2 text-sm text-vice-text-muted">
          Versie {version.version_number} · {PORTER_STATUS_LABELS[version.status]}
        </p>
      </header>

      {error && (
        <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      {researchUiActive && (
        <div
          className="mb-6 rounded-2xl border-2 border-vice-gold/50 bg-vice-gold/10 px-5 py-4 shadow-sm"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="flex flex-wrap items-center gap-3">
            <Loader2 className="size-5 shrink-0 animate-spin text-vice-gold" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-vice-text">AI-analyse bezig</p>
              <p className="mt-0.5 text-sm text-vice-text-muted">
                {researchMessage || "Even geduld — per kracht webonderzoek + analyse…"}
              </p>
            </div>
            <span className="text-sm font-medium tabular-nums text-vice-text">
              {researchForcesDone.length}/{PORTER_FORCES.length} krachten
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-vice-border/80">
            <div
              className="h-full rounded-full bg-vice-gold transition-all duration-500"
              style={{ width: `${researchProgressPct}%` }}
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            className="mt-3 h-8 text-xs"
            disabled={busy !== null}
            onClick={cancelResearch}
          >
            Annuleren
          </Button>
        </div>
      )}

      <section className="rounded-2xl border border-vice-border bg-vice-surface p-6">
        <h2 className="text-lg font-medium">Markt en concurrentie afbakenen</h2>
        {pestelContext.approved ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm">
            <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
            <span>
              PESTEL goedgekeurd · {pestelContext.insights.length} relevante inzichten beschikbaar
            </span>
          </div>
        ) : (
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-200">
            Keur PESTEL eerst goed om inzichten automatisch mee te nemen in Porter.
          </p>
        )}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label>Sector / markt</Label>
            <Input value={marketSector} onChange={(e) => setMarketSector(e.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Aanbod (diensten / producten)</Label>
            <textarea
              className="min-h-[72px] w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm"
              value={offering}
              onChange={(e) => setOffering(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Geografische markt</Label>
            <Input value={geoMarkets} onChange={(e) => setGeoMarkets(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Klantsegment</Label>
            <Input value={clientSegment} onChange={(e) => setClientSegment(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Tijdshorizon</Label>
            <Input value={timeHorizon} onChange={(e) => setTimeHorizon(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Specifieke onderzoeksvraag (optioneel)</Label>
            <Input value={researchQuestion} onChange={(e) => setResearchQuestion(e.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Bekende concurrenten (optioneel, één per regel — naam of naam | url)</Label>
            <textarea
              className="min-h-[64px] w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm"
              value={competitorsText}
              onChange={(e) => setCompetitorsText(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={busy !== null || researchUiActive}
            onClick={() => void saveScope()}
          >
            Afbakening opslaan
          </Button>
          <Button
            type="button"
            className="gap-2 bg-vice-gold text-[#1a1814] hover:bg-vice-gold-hover"
            disabled={busy !== null || researchUiActive}
            onClick={() => void startAiAnalysis()}
          >
            {busy === "research-start" ?
              <Loader2 className="size-4 animate-spin" aria-hidden />
            : <Sparkles className="size-4" aria-hidden />}
            Analyseer de vijf krachten met AI
          </Button>
        </div>
      </section>

      {pestelContext.insights.length > 0 && (
        <section className="mt-6 rounded-2xl border border-dashed border-vice-border p-4">
          <p className="text-xs font-medium text-vice-text-muted">Meegenomen PESTEL-inzichten</p>
          <ul className="mt-2 space-y-1 text-sm">
            {pestelContext.insights.slice(0, 5).map((ins) => (
              <li key={ins.id}>
                <span className="text-vice-gold">{ins.title}</span>
                <span className="text-vice-text-muted"> — {ins.dimension}</span>
              </li>
            ))}
            {pestelContext.insights.length > 5 && (
              <li className="text-xs text-vice-text-muted">
                +{pestelContext.insights.length - 5} meer
              </li>
            )}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-medium">Waar zit de concurrentiedruk?</h2>
        <p className="mt-1 text-sm text-vice-text-muted">
          Klik op een kracht om inschatting, factoren en bronnen te bewerken.
        </p>
        <div
          className="mt-6 hidden gap-3 md:grid md:gap-4"
          style={{
            gridTemplateAreas: `
              ". top ."
              "left center right"
              ". bottom ."
            `,
            gridTemplateColumns: "1fr 1.2fr 1fr",
          }}
        >
          <ForceCard forceKey="new_entrants" className="md:[grid-area:top]" />
          <ForceCard forceKey="suppliers" className="md:[grid-area:left]" />
          <ForceCard forceKey="rivalry" className="md:[grid-area:center] ring-1 ring-vice-gold/30" />
          <ForceCard forceKey="buyers" className="md:[grid-area:right]" />
          <ForceCard forceKey="substitutes" className="md:[grid-area:bottom]" />
        </div>
        <div className="mt-4 space-y-3 md:hidden">
          {PORTER_FORCES.map((k) => (
            <ForceCard key={k} forceKey={k} className="w-full" />
          ))}
        </div>
      </section>

      <section className="mt-8 rounded-2xl border border-vice-border bg-vice-surface p-6">
        <h2 className="text-lg font-medium">Wat betekent dit voor {tenantName}?</h2>
        <p className="mt-1 text-xs text-vice-text-muted">
          Strategische synthese over alle vijf krachten
        </p>
        {!hasForceInput && (
          <p className="mt-3 rounded-lg bg-vice-surface-muted/60 px-3 py-2 text-xs text-vice-text-muted">
            Vul eerst minstens één kracht in. Daarna kun je hier de synthese schrijven.
          </p>
        )}
        <textarea
          className={cn(
            "mt-4 min-h-[120px] w-full rounded-xl border border-vice-border bg-vice-bg px-4 py-3 text-sm",
            !hasForceInput && "cursor-not-allowed opacity-60",
          )}
          disabled={!hasForceInput || busy !== null}
          value={synthesisText}
          onChange={(e) => setSynthesisText(e.target.value)}
        />
        <Button
          type="button"
          className="mt-3"
          variant="secondary"
          disabled={!hasForceInput || busy !== null}
          onClick={saveSynthesis}
        >
          Synthese opslaan
        </Button>
      </section>

      <footer className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-vice-border pt-6 text-sm">
        <p className="text-vice-text-muted">{reviewedForces} van 5 krachten beoordeeld</p>
        <Button type="button" variant="secondary" disabled title="Goedkeuring volgt later">
          Goedkeuren en verder →
        </Button>
      </footer>

      {saveState && (
        <p className="mt-4 text-sm text-green-700" role="status">
          {saveState}
        </p>
      )}

      {panelForce && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/40"
          role="presentation"
          onClick={() => setPanelForce(null)}
        >
          <aside
            className="flex h-full w-full max-w-md flex-col border-l border-vice-border bg-vice-surface shadow-xl"
            role="dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-vice-border px-5 py-4">
              <h2 className="text-lg font-medium">
                {PORTER_FORCE_META[panelForce.force_key as PorterForceKey].shortLabel}
              </h2>
              <button type="button" className="rounded-md p-1 hover:bg-vice-surface-muted" onClick={() => setPanelForce(null)}>
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <p className="text-sm text-vice-text-muted">
                {PORTER_FORCE_META[panelForce.force_key as PorterForceKey].question}
              </p>
              <div className="space-y-2">
                <Label>Inschatting</Label>
                <select
                  className="w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm"
                  value={forceDraft.intensity}
                  onChange={(e) =>
                    setForceDraft((d) => ({
                      ...d,
                      intensity: e.target.value as PorterIntensity,
                    }))
                  }
                >
                  {(["unknown", "low", "medium", "high"] as const).map((v) => (
                    <option key={v} value={v}>
                      {PORTER_INTENSITY_LABELS[v]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Motivatie</Label>
                <textarea
                  className="min-h-[80px] w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm"
                  value={forceDraft.motivation}
                  onChange={(e) => setForceDraft((d) => ({ ...d, motivation: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Belangrijkste factor (kort, voor overzicht)</Label>
                <Input
                  value={forceDraft.headline_factor}
                  onChange={(e) =>
                    setForceDraft((d) => ({ ...d, headline_factor: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Betekenis voor {tenantName}</Label>
                <textarea
                  className="min-h-[80px] w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm"
                  value={forceDraft.client_relevance}
                  onChange={(e) =>
                    setForceDraft((d) => ({ ...d, client_relevance: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Eigen aanvulling ({tenantName})</Label>
                <textarea
                  className="min-h-[60px] w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm"
                  value={forceDraft.advisor_note}
                  onChange={(e) => setForceDraft((d) => ({ ...d, advisor_note: e.target.value }))}
                />
              </div>
              {pestelContext.insights.length > 0 && (
                <div className="rounded-lg border border-dashed border-violet-500/40 bg-violet-500/5 p-3 text-xs">
                  <p className="font-medium text-violet-800 dark:text-violet-200">
                    Relevante PESTEL-input
                  </p>
                  <p className="mt-1 text-vice-text-muted">
                    Koppel factoren en bronnen aan PESTEL-inzichten (volledige factor-UI volgt).
                  </p>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2 border-t border-vice-border px-5 py-4">
              <Button
                type="button"
                variant="secondary"
                disabled={busy !== null}
                onClick={() => saveForce(false)}
              >
                Opslaan als concept
              </Button>
              <Button
                type="button"
                className="bg-vice-gold text-[#1a1814] hover:bg-vice-gold-hover"
                disabled={busy !== null}
                onClick={() => saveForce(true)}
              >
                Markeer als beoordeeld
              </Button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
