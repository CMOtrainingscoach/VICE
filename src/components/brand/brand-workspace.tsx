"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Chip, fieldClass, goldButtonClass } from "@/components/stp/stp-ui";
import {
  BRAND_FRAMEWORK_INDEX,
  BRAND_STEP_LABELS,
  BRAND_STEP_QUESTIONS,
  BRAND_STEPS,
  DIMENSION_LABELS,
  EVIDENCE_LABELS,
  EVIDENCE_STATUSES,
  JUDGEMENT_LABELS,
  JUDGEMENTS,
  KELLER_LEVELS,
  MATERIAL_LABELS,
  MATERIAL_TYPES,
  PAGE_ROLE_LABELS,
  PAGE_ROLES,
  PERSONA_ROUTE,
  PRIORITY_KIND_LABELS,
  PRIORITY_KINDS,
  type BrandDimensionKey,
  type BrandStep,
  type MaterialType,
  type PageRole,
} from "@/lib/brand/constants";
import { approvalBlocked, brandChecks } from "@/lib/brand/checks";
import type { BrandDimension, BrandFinding, BrandPage, BrandPriority, BrandSource, BrandWorkbench } from "@/lib/brand/types";
import { AUDIT_FRAMEWORK_COUNT } from "@/lib/pestel/constants";
import { finalizeAuditContextAction, saveAuditContextAction, type AuditContextDocument } from "@/modules/audit/context-actions";
import {
  archiveBrandFindingAction,
  archiveBrandPriorityAction,
  archiveBrandSourceAction,
  confirmBrandImageAction,
  exportBrandTextAction,
  fetchBrandPageAction,
  loadBrandWorkbenchAction,
  proposeBrandAssessmentAction,
  publishBrandAction,
  runBrandAuditAction,
  saveBrandConclusionAction,
  saveBrandDimensionAction,
  saveBrandFindingAction,
  saveBrandPageAction,
  saveBrandPriorityAction,
  saveBrandSetupAction,
  searchBrandMentionsAction,
  setBrandStepAction,
  unpublishBrandAction,
  updateBrandSourceAction,
  uploadBrandSourceAction,
} from "@/modules/brand/actions";

type SaveState = "saving" | "saved" | "unsaved" | "error";

export function BrandWorkspace({
  tenantId,
  tenantName,
  initial,
  initialContext,
}: {
  tenantId: string;
  tenantName: string;
  initial: BrandWorkbench;
  initialContext: AuditContextDocument | null;
}) {
  const [wb, setWb] = useState(initial);
  const [context, setContext] = useState(initialContext);
  const [save, setSave] = useState<SaveState>("saved");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [lens, setLens] = useState<"visual" | "text" | "journey">("visual");
  const [pageId, setPageId] = useState(initial.pages[0]?.id ?? "");
  const [dimensionId, setDimensionId] = useState(initial.dimensions[0]?.id ?? "");
  const version = wb.version;
  const locked = version.status === "approved";
  const step = version.current_step;
  const checks = brandChecks(wb);
  const readyPages = wb.pages.filter((page) => page.included && page.status === "ready").length;
  const selectedPages = wb.pages.filter((page) => page.included && page.status !== "excluded").length;

  async function reload(versionId = version.id) {
    const next = await loadBrandWorkbenchAction(tenantId, versionId);
    if (!next.ok || !next.data) {
      setError(next.ok ? "Herladen mislukt." : next.error);
      setSave("error");
      return null;
    }
    setWb(next.data);
    setSave("saved");
    return next.data;
  }

  async function run(label: string, task: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(label);
    setError("");
    setSave("saving");
    try {
      const result = await task();
      if (!result.ok) {
        setError(result.error || "Dit is niet gelukt. Je vorige tekst blijft staan.");
        setSave("error");
        return;
      }
      await reload();
    } catch {
      setError("De verbinding viel weg. Je tekst blijft staan.");
      setSave("error");
    } finally {
      setBusy("");
    }
  }

  async function openOverview() {
    await run("Auditcontext bewaren", async () => {
      const saved = await saveBrandConclusionAction(tenantId, conclusionPayload(wb));
      if (!saved.ok) return saved;
      const doc = await saveAuditContextAction(tenantId, { versionId: version.id });
      if (!doc.ok || !doc.data) return doc.ok ? { ok: false, error: "Geen contextbestand." } : doc;
      setContext(doc.data);
      return { ok: true };
    });
  }

  async function finalizeOverview() {
    await run("Audit afronden", async () => {
      const done = await finalizeAuditContextAction(tenantId, { versionId: version.id, expectedUpdatedAt: version.updated_at });
      if (!done.ok) return done;
      setContext((current) => current ? { ...current, status: "final" } : current);
      return { ok: true };
    });
  }

  async function go(next: BrandStep) {
    if (locked) {
      setWb((prev) => ({ ...prev, version: { ...prev.version, current_step: next } }));
      return;
    }
    await run("Stap openen", async () => {
      const moved = await setBrandStepAction(tenantId, { versionId: version.id, step: next });
      if (!moved.ok && next === "overview" && /Onbekende stap|current_step/i.test(moved.error)) {
        return { ok: false, error: "Pas migratie 20260330133700 toe in de Supabase SQL-editor, na 20260330133600." };
      }
      return moved;
    });
  }

  async function reopen() {
    await run(version.published_at ? "Publicatie intrekken" : "Bewerken hervatten", async () => {
      const opened = await unpublishBrandAction(tenantId, { versionId: version.id });
      if (!opened.ok) return opened;
      const next = await loadBrandWorkbenchAction(tenantId, version.id);
      if (!next.ok || !next.data) return { ok: false, error: next.ok ? "Herladen mislukt." : next.error };
      if (next.data.version.status === "approved") {
        return { ok: false, error: "De velden blijven dicht. Pas migratie 20260330133300 toe in de Supabase SQL-editor, na 20260330133200." };
      }
      return { ok: true };
    });
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 md:px-10 print:max-w-none">
      <header className="print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <Link href={`/klanten/${tenantId}/strategie/${PERSONA_ROUTE}`} className="text-vice-text-muted hover:text-vice-gold">← Terug naar persona’s</Link>
          <p className="text-xs text-vice-text-muted">{save === "saving" ? "Opslaan…" : save === "error" || save === "unsaved" ? "Niet opgeslagen" : "Opgeslagen"}</p>
        </div>
        <p className="mt-4 text-xs font-medium uppercase tracking-wide text-vice-gold">{BRAND_FRAMEWORK_INDEX} van {AUDIT_FRAMEWORK_COUNT} · Brand audit · {tenantName} · versie {version.version_number}</p>
        <h1 className="mt-2 text-2xl font-semibold text-vice-text md:text-3xl">{BRAND_STEP_QUESTIONS[step]}</h1>
        <ol className="mt-6 flex flex-wrap gap-2" aria-label="Stappen">
          {BRAND_STEPS.map((item, index) => (
            <li key={item}>
              <button type="button" className={`rounded-full px-3 py-1 text-sm ${item === step ? "bg-vice-text text-vice-bg" : "bg-vice-surface-muted text-vice-text-muted"}`} onClick={() => void go(item)}>
                {index + 1}. {BRAND_STEP_LABELS[item]}
              </button>
            </li>
          ))}
        </ol>
      </header>
      {locked ? (
        <div className="mt-6 rounded-lg border border-vice-border bg-vice-surface px-4 py-3 text-sm">
          <p className="font-medium">De velden zijn grijs omdat deze versie goedgekeurd is.</p>
          <Button type="button" className={`mt-3 ${goldButtonClass}`} onClick={() => void reopen()}>{version.published_at ? "Trek publicatie in en bewerk" : "Hervat bewerken"}</Button>
        </div>
      ) : null}
      {version.needs_review ? <p className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">{version.review_note}</p> : null}
      {error ? <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-800 dark:text-red-200" role="alert">{error}</p> : null}
      {busy ? <p className="mt-4 text-sm" aria-live="polite">{busy}</p> : null}

      <div className="mt-8">
        {step === "sources" ? (
          <SourcesStep
            wb={wb}
            locked={locked}
            onChange={(patch) => {
              setWb((prev) => ({ ...prev, version: { ...prev.version, ...patch } }));
              setSave("unsaved");
            }}
            onSave={(patch) => {
              const next = { ...wb, version: { ...wb.version, ...patch } };
              setWb(next);
              void run("Bronnen bewaren", () => saveBrandSetupAction(tenantId, setupPayload(next)));
            }}
            onUpload={(file) => {
              const body = new FormData();
              body.set("versionId", version.id);
              body.set("file", file);
              void run("Bestand bewaren", () => uploadBrandSourceAction(tenantId, body));
            }}
            onSource={(source) => void run("Bron bijwerken", () => updateBrandSourceAction(tenantId, sourcePayload(source)))}
            onArchiveSource={(id) => void run("Vermelding verwijderen", () => archiveBrandSourceAction(tenantId, { id }))}
            onSearch={() => void run("Publieke vermeldingen zoeken", () => searchBrandMentionsAction(tenantId, { versionId: version.id }))}
            onStart={() => void run("Documenten, site en snapshot worden gelezen", async () => {
              const saved = await saveBrandSetupAction(tenantId, setupPayload(wb));
              if (!saved.ok) return saved;
              return runBrandAuditAction(tenantId, { versionId: version.id });
            })}
          />
        ) : null}
        {step === "website" ? (
          <WebsiteStep
            wb={wb}
            locked={locked}
            lens={lens}
            pageId={pageId || wb.pages[0]?.id || ""}
            readyPages={readyPages}
            selectedPages={selectedPages}
            onLens={setLens}
            onPage={setPageId}
            onFetch={(page) => void run("Paginatest ophalen", () => fetchBrandPageAction(tenantId, pagePayload(version.id, page)))}
            onSavePage={(page) => void run("Pagina bewaren", () => saveBrandPageAction(tenantId, pagePayload(version.id, page)))}
            onFinding={(finding) => void run("Bevinding bewaren", () => saveBrandFindingAction(tenantId, findingPayload(version.id, finding)))}
            onArchiveFinding={(id) => void run("Bevinding verwijderen", () => archiveBrandFindingAction(tenantId, { id }))}
            onBack={() => void go("sources")}
            onRescan={() => void run("Documenten, site en snapshot worden gelezen", () => runBrandAuditAction(tenantId, { versionId: version.id }))}
            onNext={() => void go("image")}
          />
        ) : null}
        {step === "image" ? (
          <ImageStep
            wb={wb}
            locked={locked}
            dimensionId={dimensionId || wb.dimensions[0]?.id || ""}
            onSelect={setDimensionId}
            onSave={(dimension) => void run("Beoordeling bewaren", () => saveBrandDimensionAction(tenantId, dimensionPayload(dimension)))}
            onPropose={() => void run("Lege velden voorstellen", () => proposeBrandAssessmentAction(tenantId, { versionId: version.id, expectedUpdatedAt: version.updated_at }))}
            onBack={() => void go("website")}
            onNext={() => void run("Beoordeling bevestigen", () => confirmBrandImageAction(tenantId, { versionId: version.id }))}
          />
        ) : null}
        {step === "conclusion" ? (
          <ConclusionStep
            wb={wb}
            checks={checks}
            locked={locked}
            onChange={(patch) => {
              setWb((prev) => ({ ...prev, version: { ...prev.version, ...patch } }));
              setSave("unsaved");
            }}
            onSave={(patch) => {
              const next = { ...wb, version: { ...wb.version, ...patch } };
              setWb(next);
              void run("Conclusie bewaren", () => saveBrandConclusionAction(tenantId, conclusionPayload(next)));
            }}
            onPriority={(priority) => void run("Prioriteit bewaren", () => saveBrandPriorityAction(tenantId, priorityPayload(version.id, priority)))}
            onArchivePriority={(id) => void run("Prioriteit verwijderen", () => archiveBrandPriorityAction(tenantId, { id }))}
            onOverview={() => void openOverview()}
            onExport={() => void run("Tekst klaarzetten", async () => {
              const exported = await exportBrandTextAction(tenantId, { versionId: version.id });
              if (!exported.ok || !exported.data) return exported.ok ? { ok: false, error: "Geen tekst" } : exported;
              await navigator.clipboard.writeText(exported.data.text);
              return { ok: true };
            })}
            onPrint={() => window.print()}
            onBack={() => void go("image")}
            onReopen={() => void reopen()}
          />
        ) : null}
        {step === "overview" ? (
          <OverviewStep
            context={context}
            checks={checks}
            locked={locked}
            published={Boolean(version.published_at)}
            onRefresh={() => void openOverview()}
            onFinalize={() => void finalizeOverview()}
            onPublish={() => void run("Publiceren", () => publishBrandAction(tenantId, { versionId: version.id }))}
            onBack={() => void go("conclusion")}
            onReopen={() => void reopen()}
          />
        ) : null}
      </div>
    </div>
  );
}

function setupPayload(wb: BrandWorkbench) {
  const version = wb.version;
  return {
    versionId: version.id,
    model: version.model,
    websiteUrl: version.website_url,
    periodLabel: version.period_label,
    researchAvailability: version.research_availability,
    scopeNote: version.scope_note,
    positioningIntended: version.positioning_intended || wb.links.stp.sentence || "",
  };
}

function sourcePayload(source: BrandSource) {
  return {
    sourceId: source.id,
    materialType: (MATERIAL_TYPES as readonly string[]).includes(source.material_type) ? source.material_type as MaterialType : "other",
    label: source.label || "Bron",
    periodLabel: source.period_label,
    currency: source.currency,
    channel: source.channel,
    audience: source.audience,
    note: source.note,
    excerpt: source.excerpt,
  };
}

function pagePayload(versionId: string, page: BrandPage) {
  return {
    versionId,
    pageId: page.id || null,
    url: page.url,
    role: ((PAGE_ROLES as readonly string[]).includes(page.role) ? page.role : "other") as PageRole,
    included: page.included,
    status: page.status,
    errorMessage: page.error_message,
    excerpt: page.excerpt,
  };
}

function findingPayload(versionId: string, finding: Partial<BrandFinding> & Pick<BrandFinding, "lens" | "observation">) {
  return {
    versionId,
    findingId: finding.id ?? null,
    pageId: finding.page_id ?? null,
    sourceId: finding.source_id ?? null,
    lens: finding.lens,
    observation: finding.observation,
    meaning: finding.meaning ?? "",
    proposal: finding.proposal ?? "",
    hypothesis: finding.hypothesis ?? true,
    personaLabel: finding.persona_label ?? "",
    phaseLabel: finding.phase_label ?? "",
  };
}

function dimensionPayload(dimension: BrandDimension) {
  return {
    dimensionId: dimension.id,
    intended: dimension.intended,
    observed: dimension.observed,
    gapNote: dimension.gap_note,
    evidenceStatus: dimension.evidence_status,
    judgement: dimension.judgement,
    limitsNote: dimension.limits_note,
    openQuestion: dimension.open_question,
    hypothesis: dimension.hypothesis,
  };
}

function conclusionPayload(wb: BrandWorkbench) {
  const version = wb.version;
  return {
    versionId: version.id,
    verdict: version.verdict,
    strongest: version.strongest,
    weakest: version.weakest,
    unassessed: version.unassessed,
    gapSummary: version.gap_summary,
    positioningIntended: version.positioning_intended,
    perceptionObserved: version.perception_observed,
    acceptedUncertainty: version.accepted_uncertainty,
    openQuestions: version.open_questions,
  };
}

function priorityPayload(versionId: string, priority: Partial<BrandPriority> & Pick<BrandPriority, "title">) {
  return {
    versionId,
    priorityId: priority.id ?? null,
    title: priority.title,
    problem: priority.problem ?? "",
    action: priority.action ?? "",
    outcome: priority.outcome ?? "",
    validationQuestion: priority.validation_question ?? "",
    kind: priority.kind ?? "research",
    priority: priority.priority ?? "medium",
    reason: priority.reason ?? "",
    personaLabel: priority.persona_label ?? "",
    phaseLabel: priority.phase_label ?? "",
  };
}

function SourcesStep(props: {
  wb: BrandWorkbench;
  locked: boolean;
  onChange: (patch: Partial<BrandWorkbench["version"]>) => void;
  onSave: (patch?: Partial<BrandWorkbench["version"]>) => void;
  onUpload: (file: File) => void;
  onSource: (source: BrandSource) => void;
  onArchiveSource: (id: string) => void;
  onSearch: () => void;
  onStart: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const version = props.wb.version;
  const linked = [
    props.wb.links.stp.present ? "STP" : "",
    props.wb.links.personas.present ? "Persona’s" : "",
    props.wb.links.journeys.count ? "Klantreis" : "",
  ].filter(Boolean);
  return (
    <section className="space-y-6">
      <p className="max-w-prose text-sm text-vice-text-muted">Start brand audit leest de geüploade PDF- en Word-bestanden, maakt een snapshot van de homepage en vult de website, de piramide en de samenvatting. Jij kunt elk veld daarna wijzigen. Een nieuwe scan laat die wijziging staan. Een website bewijst niet wat de markt ervan vindt.</p>
      <div className="grid gap-3 md:grid-cols-2">
        {([["keller", "Keller", "Aanbevolen", "Merkopbouw van bekendheid naar binding."], ["aaker", "Aaker", "Alternatief", "Aparte merkwaardedimensies, zonder piramide."]] as const).map(([model, title, badge, copy]) => (
          <button key={model} type="button" disabled={props.locked} className={`rounded-xl border p-4 text-left ${version.model === model ? "border-vice-gold bg-vice-surface" : "border-vice-border bg-vice-surface"}`} onClick={() => {
            if (model !== version.model && props.wb.dimensions.some((item) => item.judgement || item.observed) && !window.confirm("Een nieuwe modelspecifieke beoordeling is nodig. Bronnen en websitepagina’s blijven. De vorige beoordeling wordt gearchiveerd. Conclusies worden niet overgenomen.")) return;
            props.onSave({ model });
          }}>
            <span className="text-xs uppercase tracking-wide text-vice-gold">{badge}</span>
            <span className="mt-1 block font-medium">{title}</span>
            <span className="mt-1 block text-sm text-vice-text-muted">{copy}</span>
          </button>
        ))}
      </div>
      <label className="block text-xs text-vice-text-muted">Website
        <input className={`${fieldClass} mt-1`} disabled={props.locked} value={version.website_url} onChange={(event) => props.onChange({ website_url: event.target.value })} onBlur={(event) => props.onSave({ website_url: event.target.value })} />
      </label>
      <label className="block text-xs text-vice-text-muted">Periode
        <input className={`${fieldClass} mt-1`} disabled={props.locked} value={version.period_label} placeholder="Bijvoorbeeld 2026" onChange={(event) => props.onChange({ period_label: event.target.value })} onBlur={(event) => props.onSave({ period_label: event.target.value })} />
      </label>
      <div
        className="rounded-xl border border-dashed border-vice-border bg-vice-surface p-6 text-sm"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files[0];
          if (file && !props.locked) props.onUpload(file);
        }}
      >
        <p className="font-medium">Merkmateriaal uploaden</p>
        <p className="mt-1 text-vice-text-muted">PDF, DOCX, JPEG, PNG of WebP, tot 8 MB. Sleep een bestand hierheen of kies er een. Oude DOC eerst bewaren als DOCX of PDF. De audit leest de tekst in PDF en Word. Een pdf zonder tekstlaag wordt niet gelezen.</p>
        <input ref={fileRef} type="file" accept=".pdf,.docx,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" className="sr-only" disabled={props.locked} onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) props.onUpload(file);
        }} />
        <Button type="button" variant="secondary" className="mt-3" disabled={props.locked} onClick={() => fileRef.current?.click()}>Kies een bestand</Button>
      </div>
      <ul className="space-y-3">
        {props.wb.sources.map((source) => (
          <li key={source.id} className="rounded-xl border border-vice-border bg-vice-surface p-4 text-sm">
            <div className="flex flex-wrap items-start gap-3">
              {source.url ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={source.url} alt="" className="h-16 w-16 rounded-lg object-cover" />
                </>
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 font-medium">{source.label}</p>
                  <RemoveButton label="Verwijder deze informatie" disabled={props.locked} onClick={() => props.onArchiveSource(source.id)} />
                </div>
                <p className="text-xs text-vice-text-muted">{source.kind === "public" ? "Publieke vermelding" : source.excerpt.trim().length >= 40 ? "Gelezen" : source.status === "stored" ? "Bewaard, nog niet uitgelezen" : source.status}</p>
                {source.error_message ? <p className="text-xs text-amber-800 dark:text-amber-200">{source.error_message}</p> : null}
                {source.excerpt ? <p className="mt-2 text-vice-text-muted">{source.excerpt}</p> : null}
                {source.source_url ? <a className="mt-1 inline-block text-xs text-vice-gold" href={source.source_url} target="_blank" rel="noreferrer">{source.source_url}</a> : null}
              </div>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <select className={fieldClass} disabled={props.locked} value={(MATERIAL_TYPES as readonly string[]).includes(source.material_type) ? source.material_type : "other"} onChange={(event) => props.onSource({ ...source, material_type: event.target.value })}>
                {MATERIAL_TYPES.map((item) => <option key={item} value={item}>{MATERIAL_LABELS[item]}</option>)}
              </select>
              <select className={fieldClass} disabled={props.locked} value={source.currency} onChange={(event) => props.onSource({ ...source, currency: event.target.value as BrandSource["currency"] })}>
                <option value="current">Huidig materiaal</option>
                <option value="historical">Historisch materiaal</option>
                <option value="unknown">Periode onbekend</option>
              </select>
              <input className={fieldClass} disabled={props.locked} placeholder="Kanaal" value={source.channel} onChange={(event) => props.onSource({ ...source, channel: event.target.value })} />
              <input className={fieldClass} disabled={props.locked} placeholder="Toelichting of kernpassage" value={source.note} onChange={(event) => props.onSource({ ...source, note: event.target.value })} />
            </div>
          </li>
        ))}
      </ul>
      <p className="text-sm">Gekoppeld: {linked.length ? linked.join(" · ") : "nog geen STP, persona’s of klantreis"}.</p>
      {props.wb.links.stp.sentence ? <p className="text-sm text-vice-text-muted">Positionering die we toetsen: {props.wb.links.stp.sentence}</p> : null}
      <div className="rounded-xl border border-vice-border bg-vice-surface p-4">
        <p className="text-sm font-medium">Heeft de klant nog merkonderzoek dat hier ontbreekt?</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant={version.research_availability === "uploaded" ? "primary" : "secondary"} disabled={props.locked} onClick={() => props.onSave({ research_availability: "uploaded" })}>Onderzoek uploaden</Button>
          <Button type="button" variant={version.research_availability === "unavailable" ? "primary" : "secondary"} disabled={props.locked} onClick={() => props.onSave({ research_availability: "unavailable" })}>Nog niet beschikbaar</Button>
          <Button type="button" variant="secondary" disabled={props.locked} onClick={props.onSearch}>Zoek publieke vermeldingen</Button>
        </div>
        <p className="mt-3 text-xs text-vice-text-muted">Share of search en share of voice: niet beschikbaar. Er is geen bron met teller én noemer. Een handvol zoekresultaten is geen marktaandeel.</p>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3">
        <span />
        <Button type="button" className={goldButtonClass} disabled={props.locked} onClick={props.onStart}>{props.wb.pages.some((page) => page.status === "ready") || props.wb.findings.length > 0 ? "Scan opnieuw" : "Start brand audit"}</Button>
      </footer>
    </section>
  );
}

function WebsiteStep(props: {
  wb: BrandWorkbench;
  locked: boolean;
  lens: "visual" | "text" | "journey";
  pageId: string;
  readyPages: number;
  selectedPages: number;
  onLens: (lens: "visual" | "text" | "journey") => void;
  onPage: (id: string) => void;
  onFetch: (page: BrandPage) => void;
  onSavePage: (page: BrandPage) => void;
  onFinding: (finding: Partial<BrandFinding> & Pick<BrandFinding, "lens" | "observation">) => void;
  onArchiveFinding: (id: string) => void;
  onBack: () => void;
  onRescan: () => void;
  onNext: () => void;
}) {
  const page = props.wb.pages.find((item) => item.id === props.pageId) ?? props.wb.pages[0];
  const findings = props.wb.findings.filter((item) => item.lens === props.lens);
  const [url, setUrl] = useState("");
  const [role, setRole] = useState<PageRole>("other");
  const [observation, setObservation] = useState("");
  const [meaning, setMeaning] = useState("");
  const [proposal, setProposal] = useState("");
  const [persona, setPersona] = useState(props.wb.links.personas.people[0]?.role_title ?? "");
  const [phase, setPhase] = useState("");
  return (
    <section className="space-y-5">
      <p className="max-w-prose text-sm text-vice-text-muted">De AI vult deze bevindingen vanuit de snapshot, de paginatekst en de documenten. Pas ze aan; een volgende scan overschrijft jouw tekst niet. De snapshot toont de homepage, niet de hele site en geen marktperceptie. {props.selectedPages ? `${props.readyPages} van ${props.selectedPages} pagina's meegenomen.` : "Nog geen pagina geselecteerd."}</p>
      <div className="flex flex-wrap gap-2" role="tablist">
        {([["visual", "Visueel"], ["text", "Tekst"], ["journey", "Klantreis"]] as const).map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={props.lens === key} className={`rounded-full px-3 py-1 text-sm ${props.lens === key ? "bg-vice-text text-vice-bg" : "bg-vice-surface-muted"}`} onClick={() => props.onLens(key)}>{label}</button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-vice-text-muted">Pagina
          <select className={`${fieldClass} mt-1`} value={page?.id ?? ""} onChange={(event) => props.onPage(event.target.value)}>
            {props.wb.pages.map((item) => <option key={item.id} value={item.id}>{PAGE_ROLE_LABELS[(PAGE_ROLES as readonly string[]).includes(item.role) ? item.role as PageRole : "other"]} · {item.status}</option>)}
          </select>
        </label>
        {page ? <Button type="button" variant="secondary" disabled={props.locked || !page.included} onClick={() => props.onFetch(page)}>Haal tekst op</Button> : null}
        {page ? <Button type="button" variant="ghost" disabled={props.locked} onClick={() => props.onSavePage({ ...page, included: !page.included, status: page.included ? "excluded" : "pending" })}>{page.included ? "Sluit uit" : "Neem weer op"}</Button> : null}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <input className={fieldClass} disabled={props.locked} placeholder="https://… extra pagina" value={url} onChange={(event) => setUrl(event.target.value)} />
        <select className={fieldClass} disabled={props.locked} value={role} onChange={(event) => setRole(event.target.value as PageRole)}>
          {PAGE_ROLES.map((item) => <option key={item} value={item}>{PAGE_ROLE_LABELS[item]}</option>)}
        </select>
        <Button type="button" variant="secondary" disabled={props.locked || url.trim().length < 8} onClick={() => props.onSavePage({ id: "", url, role, included: true, fetched_at: null, status: "pending", error_message: "", excerpt: "" })}>Voeg pagina toe</Button>
      </div>
      {page?.error_message ? <p className="text-sm text-amber-800 dark:text-amber-200">{page.error_message}</p> : null}
      {props.lens === "visual" ? <WebsiteSnapshot page={props.wb.pages.find((item) => item.screenshot_url) ?? props.wb.pages.find((item) => item.role === "home")} findings={findings} locked={props.locked} onArchive={props.onArchiveFinding} /> : null}
      {page?.excerpt ? <blockquote className="rounded-xl border border-vice-border bg-vice-surface p-4 text-sm text-vice-text-muted">{page.excerpt}</blockquote> : null}
      {props.lens === "visual" ? (
        <ul className="flex flex-wrap gap-3">
          {props.wb.sources.filter((source) => source.url).map((source) => (
            <li key={source.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={source.url} alt={source.label} className="h-24 w-24 rounded-lg object-cover" />
            </li>
          ))}
        </ul>
      ) : null}
      {props.lens === "journey" ? (
        <div className="grid gap-2 md:grid-cols-2">
          <select className={fieldClass} value={persona} onChange={(event) => setPersona(event.target.value)}>
            {props.wb.links.personas.people.map((item) => <option key={item.id} value={item.role_title}>{item.role_title}{item.hypothesis ? " · hypothese" : ""}</option>)}
          </select>
          <input className={fieldClass} placeholder="Journeyfase" value={phase} onChange={(event) => setPhase(event.target.value)} />
        </div>
      ) : null}
      <FindingForm locked={props.locked} observation={observation} meaning={meaning} proposal={proposal} onObservation={setObservation} onMeaning={setMeaning} onProposal={setProposal} onSave={() => {
        props.onFinding({ lens: props.lens, observation, meaning, proposal, hypothesis: true, page_id: page?.id ?? null, persona_label: props.lens === "journey" ? persona : "", phase_label: props.lens === "journey" ? phase : "" });
        setObservation(""); setMeaning(""); setProposal("");
      }} />
      <ul className="space-y-2">
        {findings.map((finding) => (
          <FindingCard key={`${finding.id}:${finding.observation}:${finding.meaning}:${finding.proposal}`} finding={finding} locked={props.locked} onSave={props.onFinding} onArchive={props.onArchiveFinding} />
        ))}
      </ul>
      <footer className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="ghost" onClick={props.onBack}>Terug</Button>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={props.locked} onClick={props.onRescan}>Scan opnieuw</Button>
          <Button type="button" className={goldButtonClass} onClick={props.onNext}>Bekijk merkbeeld</Button>
        </div>
      </footer>
    </section>
  );
}

function RemoveButton(props: { label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-vice-text-muted hover:bg-vice-surface-muted hover:text-red-700 disabled:opacity-50 dark:hover:text-red-300" disabled={props.disabled} aria-label={props.label} title={props.label} onClick={props.onClick}>
      <Trash2 className="size-4" aria-hidden />
    </button>
  );
}

function WebsiteSnapshot(props: { page?: BrandPage; findings: BrandFinding[]; locked: boolean; onArchive: (id: string) => void }) {
  const pins = props.findings.filter((finding) => typeof finding.pin_x === "number" && typeof finding.pin_y === "number");
  if (!props.page?.screenshot_url) {
    return <p className="text-sm text-vice-text-muted">Nog geen homepage-snapshot. De tekst van de site kan wel al gelezen zijn.</p>;
  }
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(16rem,0.8fr)]">
      <div className="relative overflow-hidden rounded-xl border border-vice-border bg-vice-surface">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={props.page.screenshot_url} alt="Snapshot van de homepage" className="w-full" />
        {pins.map((finding, index) => (
          <span key={finding.id} aria-hidden className="absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-vice-gold text-xs font-medium text-[#1a1814]" style={{ left: `${finding.pin_x}%`, top: `${finding.pin_y}%` }}>{index + 1}</span>
        ))}
      </div>
      <ol className="space-y-3">
        {pins.map((finding, index) => (
          <li key={finding.id} className="rounded-xl border border-vice-border bg-vice-surface p-3 text-sm">
            <div className="flex items-start gap-2">
              <p className="min-w-0 flex-1 font-medium">{index + 1}. {finding.observation}</p>
              <RemoveButton label="Verwijder deze bevinding" disabled={props.locked} onClick={() => props.onArchive(finding.id)} />
            </div>
            {finding.meaning ? <p className="mt-1 text-vice-text-muted">{finding.meaning}</p> : null}
          </li>
        ))}
        {pins.length === 0 ? <li className="text-sm text-vice-text-muted">De snapshot staat er. Spelden verschijnen bij zichtbare elementen.</li> : null}
      </ol>
    </div>
  );
}

function FindingCard(props: {
  finding: BrandFinding;
  locked: boolean;
  onSave: (finding: Partial<BrandFinding> & Pick<BrandFinding, "lens" | "observation">) => void;
  onArchive: (id: string) => void;
}) {
  const finding = props.finding;
  const [observation, setObservation] = useState(finding.observation);
  const [meaning, setMeaning] = useState(finding.meaning);
  const [proposal, setProposal] = useState(finding.proposal);
  function commit() {
    if (observation.trim().length < 8) return;
    if (observation === finding.observation && meaning === finding.meaning && proposal === finding.proposal) return;
    props.onSave({ ...finding, observation, meaning, proposal });
  }
  return (
    <li className="space-y-2 rounded-xl border border-vice-border p-3 text-sm">
      <div className="flex justify-end">
        <RemoveButton label="Verwijder deze bevinding" disabled={props.locked} onClick={() => props.onArchive(finding.id)} />
      </div>
      <label className="block text-xs">Waarneming<textarea className={`${fieldClass} mt-1`} rows={2} disabled={props.locked} value={observation} onChange={(event) => setObservation(event.target.value)} onBlur={commit} /></label>
      <label className="block text-xs">Interpretatie<textarea className={`${fieldClass} mt-1`} rows={2} disabled={props.locked} value={meaning} onChange={(event) => setMeaning(event.target.value)} onBlur={commit} /></label>
      <label className="block text-xs">Voorstel<textarea className={`${fieldClass} mt-1`} rows={2} disabled={props.locked} value={proposal} onChange={(event) => setProposal(event.target.value)} onBlur={commit} /></label>
      {finding.hypothesis ? <Chip tone="amber">Hypothese</Chip> : null}
    </li>
  );
}

function FindingForm(props: {
  locked: boolean;
  observation: string;
  meaning: string;
  proposal: string;
  onObservation: (value: string) => void;
  onMeaning: (value: string) => void;
  onProposal: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-vice-border bg-vice-surface p-4">
      <label className="block text-xs">Waarneming<textarea className={`${fieldClass} mt-1`} rows={2} disabled={props.locked} value={props.observation} onChange={(event) => props.onObservation(event.target.value)} /></label>
      <label className="block text-xs">Interpretatie<textarea className={`${fieldClass} mt-1`} rows={2} disabled={props.locked} value={props.meaning} onChange={(event) => props.onMeaning(event.target.value)} /></label>
      <label className="block text-xs">Voorstel, los van de waarneming<textarea className={`${fieldClass} mt-1`} rows={2} disabled={props.locked} value={props.proposal} onChange={(event) => props.onProposal(event.target.value)} /></label>
      <Button type="button" variant="secondary" disabled={props.locked || props.observation.trim().length < 8} onClick={props.onSave}>Bewaar bevinding</Button>
    </div>
  );
}

function ImageStep(props: {
  wb: BrandWorkbench;
  locked: boolean;
  dimensionId: string;
  onSelect: (id: string) => void;
  onSave: (dimension: BrandDimension) => void;
  onPropose: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const selected = props.wb.dimensions.find((item) => item.id === props.dimensionId) ?? props.wb.dimensions[0];
  const keller = props.wb.version.model === "keller";
  return (
    <section className="space-y-5">
      <p className="max-w-prose text-sm text-vice-text-muted">{keller ? "Keller, van bekendheid naar binding. Een hogere laag is niet bewezen omdat een lagere laag positief oogt." : "Aaker, vijf aparte dimensies. Geen Keller-piramide en geen automatische omzetting."} De scan vult deze velden. Wat je zelf wijzigt, blijft bij een nieuwe scan staan.</p>
      {keller ? (
        <ol className="space-y-2" aria-label="Keller-piramide van binding naar bekendheid">
          {KELLER_LEVELS.map((level) => (
            <li key={level.level}>
              <p className="text-xs uppercase tracking-wide text-vice-text-muted">Niveau {level.level} · {level.label}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {level.keys.map((key) => {
                  const dimension = props.wb.dimensions.find((item) => item.dimension_key === key);
                  if (!dimension) return null;
                  return <DimensionButton key={key} dimension={dimension} active={selected?.id === dimension.id} onSelect={props.onSelect} />;
                })}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {props.wb.dimensions.map((dimension) => <li key={dimension.id}><DimensionButton dimension={dimension} active={selected?.id === dimension.id} onSelect={props.onSelect} /></li>)}
        </ul>
      )}
      {selected ? <DimensionEditor key={selected.id} dimension={selected} locked={props.locked} onSave={props.onSave} /> : null}
      <footer className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="ghost" onClick={props.onBack}>Terug</Button>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={props.locked} onClick={props.onPropose}>Stel lege velden voor</Button>
          <Button type="button" className={goldButtonClass} disabled={props.locked} onClick={props.onNext}>Breng je beoordeling in</Button>
        </div>
      </footer>
    </section>
  );
}

function DimensionButton({ dimension, active, onSelect }: { dimension: BrandDimension; active: boolean; onSelect: (id: string) => void }) {
  const label = DIMENSION_LABELS[dimension.dimension_key as BrandDimensionKey] ?? dimension.dimension_key;
  const judgement = dimension.judgement ? JUDGEMENT_LABELS[dimension.judgement] : "Nog leeg";
  return (
    <button type="button" className={`rounded-xl border px-3 py-2 text-left text-sm ${active ? "border-vice-gold bg-vice-surface" : "border-vice-border"}`} onClick={() => onSelect(dimension.id)}>
      <span className="block font-medium">{label}</span>
      <span className="text-xs text-vice-text-muted">{judgement} · {EVIDENCE_LABELS[dimension.evidence_status]}</span>
      {dimension.gap_note ? <span className="mt-1 block max-w-sm text-xs text-vice-text-muted">{dimension.gap_note}</span> : null}
    </button>
  );
}

function DimensionEditor({ dimension, locked, onSave }: { dimension: BrandDimension; locked: boolean; onSave: (dimension: BrandDimension) => void }) {
  const [draft, setDraft] = useState(dimension);
  const label = DIMENSION_LABELS[dimension.dimension_key as BrandDimensionKey] ?? dimension.dimension_key;
  return (
    <div key={dimension.id} className="space-y-3 rounded-xl border border-vice-border bg-vice-surface p-4">
      <h2 className="font-medium">{label}</h2>
      <label className="block text-xs">Bedoeld merkbeeld<textarea className={`${fieldClass} mt-1`} rows={2} disabled={locked} value={draft.intended} onChange={(event) => setDraft({ ...draft, intended: event.target.value })} /></label>
      <label className="block text-xs">Externe waarnemingen<textarea className={`${fieldClass} mt-1`} rows={2} disabled={locked} value={draft.observed} onChange={(event) => setDraft({ ...draft, observed: event.target.value })} /></label>
      <label className="block text-xs">Verschil<textarea className={`${fieldClass} mt-1`} rows={2} disabled={locked} value={draft.gap_note} onChange={(event) => setDraft({ ...draft, gap_note: event.target.value })} /></label>
      <div className="grid gap-2 md:grid-cols-2">
        <label className="text-xs">Bewijs
          <select className={`${fieldClass} mt-1`} disabled={locked} value={draft.evidence_status} onChange={(event) => setDraft({ ...draft, evidence_status: event.target.value as BrandDimension["evidence_status"] })}>
            {EVIDENCE_STATUSES.map((item) => <option key={item} value={item}>{EVIDENCE_LABELS[item]}</option>)}
          </select>
        </label>
        <label className="text-xs">Beoordeling
          <select className={`${fieldClass} mt-1`} disabled={locked} value={draft.judgement} onChange={(event) => setDraft({ ...draft, judgement: event.target.value as BrandDimension["judgement"] })}>
            <option value="">Nog leeg</option>
            {JUDGEMENTS.map((item) => <option key={item} value={item}>{JUDGEMENT_LABELS[item]}</option>)}
          </select>
        </label>
      </div>
      <label className="block text-xs">Beperkingen<textarea className={`${fieldClass} mt-1`} rows={2} disabled={locked} value={draft.limits_note} onChange={(event) => setDraft({ ...draft, limits_note: event.target.value })} /></label>
      <Button type="button" variant="secondary" disabled={locked} onClick={() => onSave({ ...draft, hypothesis: draft.evidence_status === "unknown" || draft.hypothesis })}>Bewaar onderdeel</Button>
    </div>
  );
}

function ConclusionStep(props: {
  wb: BrandWorkbench;
  checks: ReturnType<typeof brandChecks>;
  locked: boolean;
  onChange: (patch: Partial<BrandWorkbench["version"]>) => void;
  onSave: (patch?: Partial<BrandWorkbench["version"]>) => void;
  onPriority: (priority: Partial<BrandPriority> & Pick<BrandPriority, "title">) => void;
  onArchivePriority: (id: string) => void;
  onOverview: () => void;
  onExport: () => void;
  onPrint: () => void;
  onBack: () => void;
  onReopen: () => void;
}) {
  const version = props.wb.version;
  const dirty = useRef(new Set<string>());
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<BrandPriority["kind"]>("research");
  const [action, setAction] = useState("");
  const labels = { ready: "Gereed", attention: "Aandachtspunt", block: "Blokkeert" } as const;
  return (
    <section className="space-y-5" id="brand-print">
      <p className="max-w-prose text-sm text-vice-text-muted">Samenvatting van de audit. De AI heeft deze velden ingevuld; pas aan wat je anders ziet. Geen financiële merkwaardering. Zwak en onvoldoende onderzocht blijven apart.</p>
      {([
        ["verdict", "Conclusie"],
        ["strongest", "Sterkste onderbouwde associaties"],
        ["weakest", "Zwakste onderbouwde onderdelen"],
        ["unassessed", "Nog niet te beoordelen"],
        ["positioning_intended", "Beoogde positionering"],
        ["perception_observed", "Onderbouwde marktperceptie"],
        ["gap_summary", "Belangrijkste verschil"],
        ["accepted_uncertainty", "Aanvaarde onzekerheid"],
      ] as const).map(([key, label]) => (
        <label key={key} className="block text-xs text-vice-text-muted">{label}
          <textarea className={`${fieldClass} mt-1`} rows={2} disabled={props.locked} value={version[key]} onChange={(event) => { dirty.current.add(key); props.onChange({ [key]: event.target.value }); }} onBlur={(event) => { if (!dirty.current.has(key)) return; dirty.current.delete(key); props.onSave({ [key]: event.target.value }); }} />
        </label>
      ))}
      <div className="rounded-xl border border-vice-border p-4">
        <h2 className="font-medium">Merkprioriteiten</h2>
        <ul className="mt-3 space-y-2">
          {props.wb.priorities.map((priority, index) => (
            <li key={priority.id} className="flex items-start gap-2 text-sm">
              <p className="min-w-0 flex-1">
                <span className="font-medium">{index + 1}. {priority.title}</span>
                <span className="text-vice-text-muted"> · {PRIORITY_KIND_LABELS[priority.kind]} · {priority.action}</span>
              </p>
              <RemoveButton label="Verwijder deze prioriteit" disabled={props.locked} onClick={() => props.onArchivePriority(priority.id)} />
            </li>
          ))}
        </ul>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <input className={fieldClass} disabled={props.locked} placeholder="Titel" value={title} onChange={(event) => setTitle(event.target.value)} />
          <select className={fieldClass} disabled={props.locked} value={kind} onChange={(event) => setKind(event.target.value as BrandPriority["kind"])}>
            {PRIORITY_KINDS.map((item) => <option key={item} value={item}>{PRIORITY_KIND_LABELS[item]}</option>)}
          </select>
          <input className={fieldClass} disabled={props.locked} placeholder="Aanbevolen actie" value={action} onChange={(event) => setAction(event.target.value)} />
        </div>
        <Button type="button" className="mt-3" variant="secondary" disabled={props.locked || title.trim().length < 2} onClick={() => { props.onPriority({ title, kind, action }); setTitle(""); setAction(""); }}>Voeg prioriteit toe</Button>
      </div>
      <ul className="space-y-2">
        {props.checks.map((check) => (
          <li key={check.id} className="flex flex-wrap gap-2 text-sm">
            <Chip tone={check.level === "ready" ? "green" : check.level === "attention" ? "amber" : "gold"}>{labels[check.level]}</Chip>
            <span className="font-medium">{check.label}</span>
            <span className="text-vice-text-muted">{check.detail}</span>
          </li>
        ))}
      </ul>
      <footer className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" onClick={props.onBack}>Terug</Button>
          <Button type="button" variant="secondary" onClick={props.onExport}>Kopieer als tekst</Button>
          <Button type="button" variant="secondary" onClick={props.onPrint}>Exporteer via print</Button>
          {props.locked ? <Button type="button" variant="secondary" onClick={props.onReopen}>{version.published_at ? "Trek publicatie in en bewerk" : "Hervat bewerken"}</Button> : null}
        </div>
        <Button type="button" className={goldButtonClass} onClick={props.onOverview}>Bewaar en open overzicht</Button>
      </footer>
    </section>
  );
}

function OverviewStep(props: {
  context: AuditContextDocument | null;
  checks: ReturnType<typeof brandChecks>;
  locked: boolean;
  published: boolean;
  onRefresh: () => void;
  onFinalize: () => void;
  onPublish: () => void;
  onBack: () => void;
  onReopen: () => void;
}) {
  const blocked = approvalBlocked(props.checks);
  const saved = props.context?.savedAt ? new Date(props.context.savedAt).toLocaleString("nl-NL") : "";
  return (
    <section className="space-y-5">
      <p className="max-w-prose text-sm text-vice-text-muted">
        Dit is het markdownbestand met alles wat in de strategische audit is opgeslagen. Latere toepassingen lezen dit bestand als context van het bedrijf. Kijk het na en rond daarna af.
      </p>
      <p className="text-xs text-vice-text-muted">
        {props.context ? `${props.context.status === "final" ? "Afgerond" : "Concept"}${saved ? ` · bewaard ${saved}` : ""}` : "Nog geen bestand."}
      </p>
      {props.context ? (
        <pre className="max-h-[36rem] overflow-auto whitespace-pre-wrap rounded-xl border border-vice-border bg-vice-surface p-4 font-sans text-sm text-vice-text">{props.context.markdown}</pre>
      ) : (
        <p className="rounded-lg border border-vice-border px-4 py-3 text-sm">{props.locked ? "Er is nog geen bestand. Hervat bewerken om het alsnog te bewaren." : "Bewaar de audit om het bestand te maken."}</p>
      )}
      <footer className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" onClick={props.onBack}>Terug</Button>
          {!props.locked ? <Button type="button" variant="secondary" onClick={props.onRefresh}>Werk het bestand bij</Button> : null}
          {props.locked ? <Button type="button" variant="secondary" onClick={props.onReopen}>{props.published ? "Trek publicatie in en bewerk" : "Hervat bewerken"}</Button> : null}
        </div>
        {!props.locked ? (
          <Button type="button" className={goldButtonClass} disabled={!props.context || blocked} onClick={props.onFinalize}>Rond de audit af</Button>
        ) : null}
        {props.locked && !props.published ? (
          <Button type="button" className={goldButtonClass} onClick={props.onPublish}>Publiceer naar klantdashboard</Button>
        ) : null}
      </footer>
    </section>
  );
}
