"use client";

import {
  CheckCircle2,
  FileText,
  Globe,
  Link2,
  Loader2,
  Plus,
  Sparkles,
  StickyNote,
  Video,
  X,
} from "lucide-react";
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
  PestelResearchInput,
  PestelResearchInputKind,
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
  initialResearchInputs: PestelResearchInput[];
  initialActiveJob: PestelResearchJob | null;
};

const MEETING_REVIEW_LABELS: Record<string, string> = {
  approved: "Goedgekeurd",
  pending: "Te beoordelen",
  draft: "Concept",
};

function researchInputIcon(kind: PestelResearchInputKind) {
  switch (kind) {
    case "meeting":
      return Video;
    case "website":
      return Globe;
    case "document":
      return FileText;
    default:
      return StickyNote;
  }
}

function describeResearchInput(
  input: PestelResearchInput,
  meetings: PestelMeetingOption[],
): string {
  if (input.kind === "meeting" && input.meeting_recording_id) {
    const m = meetings.find((x) => x.id === input.meeting_recording_id);
    const status = m ? MEETING_REVIEW_LABELS[m.review_status] ?? m.review_status : "";
    return m ? `${m.title}${status ? ` · ${status}` : ""}` : "Meeting";
  }
  if (input.kind === "website") {
    return input.label.trim() || input.url || "Website";
  }
  return input.label.trim() || "Bron";
}

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
  initialResearchInputs,
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
  const [researchInputs, setResearchInputs] = useState<PestelResearchInput[]>(
    initialResearchInputs,
  );
  const [meetingToLink, setMeetingToLink] = useState("");
  const [newWebsiteUrl, setNewWebsiteUrl] = useState("");
  const [newWebsiteLabel, setNewWebsiteLabel] = useState("");
  const [newDocLabel, setNewDocLabel] = useState("");
  const [newDocUrl, setNewDocUrl] = useState("");
  const [newDocExcerpt, setNewDocExcerpt] = useState("");
  const [newNoteLabel, setNewNoteLabel] = useState("");
  const [newNoteExcerpt, setNewNoteExcerpt] = useState("");
  const [sourcePanel, setSourcePanel] = useState<
    "meeting" | "website" | "document" | "note" | null
  >(null);
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
  const [researchCurrentDimension, setResearchCurrentDimension] = useState<
    PestelDimension | null
  >((initialActiveJob?.progress?.current_dimension as PestelDimension) ?? null);

  const researchActive =
    Boolean(researchJobId) ||
    version.status === "research_running" ||
    initialActiveJob?.status === "running" ||
    initialActiveJob?.status === "queued";

  const researchUiActive =
    researchActive || busy === "research-start" || busy === "research-step";

  const researchProgressPct = Math.round(
    (researchDimensionsDone.length / PESTEL_DIMENSIONS.length) * 100,
  );

  useEffect(() => {
    setInsights(initialInsights);
    setVersion(initialVersion);
    setResearchInputs(initialResearchInputs);
  }, [initialInsights, initialVersion, initialResearchInputs]);

  useEffect(() => {
    if (!researchJobId || researchLoopRef.current) return;

    researchLoopRef.current = true;
    let cancelled = false;
    const jobId = researchJobId;

    void (async () => {
      while (!cancelled) {
        setBusy("research-step");
        setVersion((v) => ({ ...v, status: "research_running" }));
        const step = await runPestelResearchStepAction(tenantId, jobId);
        setBusy(null);
        if (!step.ok || !step.data) {
          setError(step.ok ? "Onbekende fout" : step.error);
          setResearchJobId(null);
          router.refresh();
          break;
        }

        setResearchMessage(step.data.message);
        setResearchDimensionsDone(step.data.dimensionsDone);
        setResearchCurrentDimension(
          (step.data.currentDimension as PestelDimension | null) ?? null,
        );

        if (step.data.status === "failed") {
          setError(step.data.message);
          setResearchJobId(null);
          router.refresh();
          break;
        }

        router.refresh();

        if (step.data.done) {
          setResearchJobId(null);
          setResearchCurrentDimension(null);
          if (step.data.status === "completed") {
            setSaveState("AI-onderzoek afgerond — bekijk de inzichten per kaart.");
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
  }, [researchJobId, tenantId, router]);

  useEffect(() => {
    if (initialActiveJob?.progress?.dimensions_done) {
      setResearchDimensionsDone(initialActiveJob.progress.dimensions_done);
    }
  }, [initialActiveJob]);

  async function startAiResearch() {
    setError(null);
    setSaveState(null);
    setBusy("research-start");
    const scopeOk = await saveScope({ silent: true });
    if (!scopeOk) {
      setBusy(null);
      return;
    }
    const result = await startPestelResearchAction(tenantId, version.id);
    setBusy(null);
    if (!result.ok || !result.data) {
      setError(result.ok ? "Start mislukt" : result.error);
      return;
    }
    setResearchDimensionsDone([]);
    setResearchCurrentDimension("political");
    setResearchJobId(result.data.jobId);
    setResearchMessage("Onderzoek gestart — live web + AI per perspectief (kan enkele minuten duren)…");
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

  const linkedMeetingIds = useMemo(
    () =>
      new Set(
        researchInputs
          .filter((i) => i.kind === "meeting" && i.meeting_recording_id)
          .map((i) => i.meeting_recording_id as string),
      ),
    [researchInputs],
  );

  const meetingsAvailableToLink = useMemo(
    () => initialMeetings.filter((m) => !linkedMeetingIds.has(m.id)),
    [initialMeetings, linkedMeetingIds],
  );

  function removeResearchInput(index: number) {
    setResearchInputs((prev) => prev.filter((_, i) => i !== index));
  }

  function linkMeeting() {
    if (!meetingToLink) return;
    const m = initialMeetings.find((x) => x.id === meetingToLink);
    if (!m) return;
    setResearchInputs((prev) => [
      ...prev,
      {
        kind: "meeting",
        meeting_recording_id: m.id,
        label: m.title,
        excerpt: "",
      },
    ]);
    setMeetingToLink("");
    setSourcePanel(null);
  }

  function linkAllMeetings() {
    setResearchInputs((prev) => {
      const existing = new Set(
        prev
          .filter((i) => i.kind === "meeting" && i.meeting_recording_id)
          .map((i) => i.meeting_recording_id as string),
      );
      const additions: PestelResearchInput[] = initialMeetings
        .filter((m) => !existing.has(m.id))
        .map((m) => ({
          kind: "meeting",
          meeting_recording_id: m.id,
          label: m.title,
          excerpt: "",
        }));
      return [...prev, ...additions];
    });
  }

  function addWebsiteSource() {
    const url = newWebsiteUrl.trim();
    if (!url) {
      setError("Vul een URL in voor de website.");
      return;
    }
    setResearchInputs((prev) => [
      ...prev,
      {
        kind: "website",
        label: newWebsiteLabel.trim() || url,
        url,
        excerpt: "",
      },
    ]);
    setNewWebsiteUrl("");
    setNewWebsiteLabel("");
    setSourcePanel(null);
    setError(null);
  }

  function addDocumentSource() {
    if (!newDocLabel.trim() && !newDocExcerpt.trim()) {
      setError("Document: vul minstens een titel of inhoud in.");
      return;
    }
    setResearchInputs((prev) => [
      ...prev,
      {
        kind: "document",
        label: newDocLabel.trim() || "Document",
        url: newDocUrl.trim() || null,
        excerpt: newDocExcerpt,
      },
    ]);
    setNewDocLabel("");
    setNewDocUrl("");
    setNewDocExcerpt("");
    setSourcePanel(null);
    setError(null);
  }

  function addNoteSource() {
    if (!newNoteExcerpt.trim()) {
      setError("Notitie: vul tekst in.");
      return;
    }
    setResearchInputs((prev) => [
      ...prev,
      {
        kind: "note",
        label: newNoteLabel.trim() || "Interne notitie",
        excerpt: newNoteExcerpt,
      },
    ]);
    setNewNoteLabel("");
    setNewNoteExcerpt("");
    setSourcePanel(null);
    setError(null);
  }

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

  async function saveScope(options?: { silent?: boolean }): Promise<boolean> {
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
      researchInputs: researchInputs.map((i) => ({
        kind: i.kind,
        meeting_recording_id:
          i.kind === "meeting" ? i.meeting_recording_id ?? "" : "",
        label: i.label,
        url: i.url ?? "",
        excerpt: i.excerpt,
      })),
    });
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    if (!options?.silent) {
      setSaveState("Afbakening opgeslagen");
    }
    setVersion((v) => ({
      ...v,
      status: v.status === "not_started" ? "draft" : v.status,
    }));
    return true;
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

      {error && (
        <div
          className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-900 dark:text-red-100"
          role="alert"
        >
          <p className="font-medium">Onderzoek gestopt</p>
          <p className="mt-1">{error}</p>
          <p className="mt-2 text-xs opacity-90">
            Controleer TAVILY_API_KEY / OPENAI_API_KEY, migratie 307 op Supabase, en probeer opnieuw.
            Gedeeltelijke inzichten blijven staan als die al waren opgeslagen.
          </p>
        </div>
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
              <p className="font-semibold text-vice-text">AI-onderzoek bezig</p>
              <p className="mt-0.5 text-sm text-vice-text-muted">
                {researchMessage || "Even geduld — dit kan 1–3 minuten per perspectief duren…"}
              </p>
            </div>
            <span className="text-sm font-medium tabular-nums text-vice-text">
              {researchDimensionsDone.length}/{PESTEL_DIMENSIONS.length} perspectieven
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-vice-border/80">
            <div
              className="h-full rounded-full bg-vice-gold transition-all duration-500"
              style={{ width: `${Math.max(researchProgressPct, researchUiActive ? 8 : 0)}%` }}
            />
          </div>
          <ul className="mt-3 flex flex-wrap gap-2 text-xs">
            {PESTEL_DIMENSIONS.map((dim) => {
              const done = researchDimensionsDone.includes(dim);
              const active = researchCurrentDimension === dim && researchUiActive;
              return (
                <li
                  key={dim}
                  className={cn(
                    "rounded-full px-2.5 py-1",
                    done && "bg-green-500/15 text-green-900 dark:text-green-100",
                    active && !done && "bg-vice-gold/25 font-medium text-vice-text",
                    !done && !active && "bg-vice-surface-muted text-vice-text-muted",
                  )}
                >
                  {done && <CheckCircle2 className="mr-1 inline size-3" aria-hidden />}
                  {active && !done && (
                    <Loader2 className="mr-1 inline size-3 animate-spin" aria-hidden />
                  )}
                  {PESTEL_DIMENSION_META[dim].label}
                </li>
              );
            })}
          </ul>
          {researchActive && (
            <Button
              type="button"
              variant="ghost"
              className="mt-3 h-8 text-xs"
              disabled={busy !== null}
              onClick={cancelResearch}
            >
              Onderzoek annuleren
            </Button>
          )}
        </div>
      )}

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

        <div className="mt-8 border-t border-vice-border pt-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 text-base font-medium text-vice-text">
                <Link2 className="size-4 text-vice-gold" aria-hidden />
                Bronnen voor AI-onderzoek
              </h3>
              <p className="mt-1 max-w-2xl text-sm text-vice-text-muted">
                Koppel interne context: meetings, uploads/notities en nuttige start-URLs. De AI
                doet altijd ook extern onderzoek en levert per inzicht publiek bewijs (https-sites).
                Zonder opgeslagen lijst geldt voor meetings: alle transcripts (voorkeur
                goedgekeurd). Na opslaan bepalen gekoppelde meetings/documenten welke interne
                bronnen citeerbaar zijn — geen blokkade op internetonderzoek.
              </p>
            </div>
            {initialMeetings.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                className="h-8 text-xs"
                disabled={researchActive || busy !== null}
                onClick={linkAllMeetings}
              >
                Alle meetings koppelen
              </Button>
            )}
          </div>

          {researchInputs.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {researchInputs.map((input, index) => {
                const Icon = researchInputIcon(input.kind);
                return (
                  <li
                    key={`${input.kind}-${input.meeting_recording_id ?? input.url ?? index}`}
                    className="flex items-start gap-3 rounded-xl border border-vice-border bg-vice-bg/60 px-3 py-2 text-sm"
                  >
                    <Icon className="mt-0.5 size-4 shrink-0 text-vice-gold" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-vice-text">
                        {describeResearchInput(input, initialMeetings)}
                      </p>
                      <p className="text-xs capitalize text-vice-text-muted">
                        {input.kind === "note" ? "Interne notitie" : input.kind}
                      </p>
                      {input.url && (
                        <p className="truncate text-xs text-vice-text-muted">{input.url}</p>
                      )}
                      {input.excerpt && input.kind !== "meeting" && (
                        <p className="mt-1 line-clamp-2 text-xs text-vice-text-muted">
                          {input.excerpt}
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      className="size-8 shrink-0 p-0"
                      disabled={researchActive}
                      aria-label="Bron verwijderen"
                      onClick={() => removeResearchInput(index)}
                    >
                      <X className="size-4" aria-hidden />
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-4 rounded-xl border border-dashed border-vice-border px-4 py-3 text-sm text-vice-text-muted">
              Nog geen bronnen gekoppeld. Voeg meetings of andere bronnen toe vóór AI-onderzoek
              voor volledige controle.
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              className="h-9 text-xs"
              disabled={researchActive || meetingsAvailableToLink.length === 0}
              onClick={() => setSourcePanel(sourcePanel === "meeting" ? null : "meeting")}
            >
              <Video className="size-3.5" aria-hidden />
              Meeting
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="h-9 text-xs"
              disabled={researchActive}
              onClick={() => setSourcePanel(sourcePanel === "website" ? null : "website")}
            >
              <Globe className="size-3.5" aria-hidden />
              Website
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="h-9 text-xs"
              disabled={researchActive}
              onClick={() => setSourcePanel(sourcePanel === "document" ? null : "document")}
            >
              <FileText className="size-3.5" aria-hidden />
              Document
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="h-9 text-xs"
              disabled={researchActive}
              onClick={() => setSourcePanel(sourcePanel === "note" ? null : "note")}
            >
              <StickyNote className="size-3.5" aria-hidden />
              Notitie
            </Button>
          </div>

          {sourcePanel === "meeting" && (
            <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-vice-border bg-vice-surface-muted/40 p-4">
              <div className="min-w-[200px] flex-1 space-y-1">
                <Label htmlFor="link-meeting">Meeting met transcript</Label>
                <select
                  id="link-meeting"
                  className="w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm"
                  value={meetingToLink}
                  onChange={(e) => setMeetingToLink(e.target.value)}
                >
                  <option value="">Kies…</option>
                  {meetingsAvailableToLink.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title} · {MEETING_REVIEW_LABELS[m.review_status] ?? m.review_status}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="button" className="h-10" onClick={linkMeeting} disabled={!meetingToLink}>
                Koppelen
              </Button>
            </div>
          )}

          {sourcePanel === "website" && (
            <div className="mt-3 space-y-3 rounded-xl border border-vice-border bg-vice-surface-muted/40 p-4">
              <div className="space-y-1">
                <Label htmlFor="src-url">URL (https)</Label>
                <Input
                  id="src-url"
                  value={newWebsiteUrl}
                  onChange={(e) => setNewWebsiteUrl(e.target.value)}
                  placeholder="https://…"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="src-web-label">Label (optioneel)</Label>
                <Input
                  id="src-web-label"
                  value={newWebsiteLabel}
                  onChange={(e) => setNewWebsiteLabel(e.target.value)}
                />
              </div>
              <Button type="button" onClick={addWebsiteSource}>
                Website toevoegen
              </Button>
            </div>
          )}

          {sourcePanel === "document" && (
            <div className="mt-3 space-y-3 rounded-xl border border-vice-border bg-vice-surface-muted/40 p-4">
              <p className="text-xs text-vice-text-muted">
                Documenten-module komt later; plak nu kerninhoud of een link naar een geüpload
                bestand.
              </p>
              <div className="space-y-1">
                <Label htmlFor="src-doc-title">Titel</Label>
                <Input
                  id="src-doc-title"
                  value={newDocLabel}
                  onChange={(e) => setNewDocLabel(e.target.value)}
                  placeholder="Jaarverslag 2024"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="src-doc-url">Link (optioneel)</Label>
                <Input
                  id="src-doc-url"
                  value={newDocUrl}
                  onChange={(e) => setNewDocUrl(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="src-doc-excerpt">Inhoud / samenvatting voor de AI</Label>
                <textarea
                  id="src-doc-excerpt"
                  className="min-h-[80px] w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm"
                  value={newDocExcerpt}
                  onChange={(e) => setNewDocExcerpt(e.target.value)}
                />
              </div>
              <Button type="button" onClick={addDocumentSource}>
                Document toevoegen
              </Button>
            </div>
          )}

          {sourcePanel === "note" && (
            <div className="mt-3 space-y-3 rounded-xl border border-vice-border bg-vice-surface-muted/40 p-4">
              <div className="space-y-1">
                <Label htmlFor="src-note-label">Label</Label>
                <Input
                  id="src-note-label"
                  value={newNoteLabel}
                  onChange={(e) => setNewNoteLabel(e.target.value)}
                  placeholder="Gesprek met sectorfederatie"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="src-note-text">Tekst voor de AI</Label>
                <textarea
                  id="src-note-text"
                  className="min-h-[80px] w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm"
                  value={newNoteExcerpt}
                  onChange={(e) => setNewNoteExcerpt(e.target.value)}
                />
              </div>
              <Button type="button" onClick={addNoteSource}>
                Notitie toevoegen
              </Button>
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
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
            className="bg-vice-gold text-[#1a1814] hover:bg-vice-gold-hover"
            disabled={busy !== null || researchUiActive}
            onClick={startAiResearch}
          >
            {researchUiActive ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="size-4" aria-hidden />
            )}
            {researchUiActive ? "Onderzoek bezig…" : "Onderzoek de markt met AI"}
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
                      {researchUiActive ?
                        researchDimensionsDone.includes(dim) ?
                          "Geen inzichten opgeslagen voor dit perspectief."
                        : researchCurrentDimension === dim ?
                          "Live web + AI vullen dit perspectief aan…"
                        : "In wachtrij — volgt na vorige perspectieven."
                      : "Nog geen inzichten. Start AI-onderzoek of voeg handmatig toe."}
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
