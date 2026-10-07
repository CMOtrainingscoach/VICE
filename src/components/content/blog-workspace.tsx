"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, ImageIcon, LoaderCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LENGTH_LABELS, type BlogConcept, type BlogConceptSummary, type BlogLength, type BlogMode, type BrandContext } from "@/lib/content/blog-types";
import {
  applyBlogRewriteAction,
  createBlogConceptAction,
  generateBlogTextAction,
  generateBlogVisualAction,
  rewriteBlogTextAction,
  saveBlogConceptAction,
  selectBlogVisualAction,
  updateBlogVisualAltAction,
} from "@/modules/content/blog-actions";

export function BlogWorkspace({
  tenantId,
  tenantName,
  brand,
  initial,
  concepts,
}: {
  tenantId: string;
  tenantName: string;
  brand: BrandContext;
  initial: BlogConcept | null;
  concepts: BlogConceptSummary[];
}) {
  const router = useRouter();
  const [concept, setConcept] = useState<BlogConcept | null>(initial);
  const [mode, setMode] = useState<BlogMode>(initial?.mode ?? "new");
  const [language, setLanguage] = useState(initial?.language ?? "nl");
  const [lengthKey, setLengthKey] = useState<BlogLength>(initial?.lengthKey ?? "medium");
  const [sourceText, setSourceText] = useState(initial?.sourceText ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [bodyHtml, setBodyHtml] = useState(initial?.bodyHtml ?? "");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [proposal, setProposal] = useState<{ title: string; bodyHtml: string; instruction: string } | null>(null);
  const [rewriteOpen, setRewriteOpen] = useState(false);
  const [rewriteInstruction, setRewriteInstruction] = useState("");
  const [visualTweak, setVisualTweak] = useState("");
  const [tweakOpen, setTweakOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [forceEditor, setForceEditor] = useState(Boolean(initial && (initial.title || initial.bodyHtml)));
  const editorRef = useRef<HTMLDivElement>(null);
  const dirtyRef = useRef(false);
  const conceptRef = useRef(concept);
  conceptRef.current = concept;

  useEffect(() => {
    setConcept(initial);
    if (initial) {
      setMode(initial.mode);
      setLanguage(initial.language);
      setLengthKey(initial.lengthKey);
      setSourceText(initial.sourceText);
      const documentHtml = ensureDocumentHtml(initial.title, initial.bodyHtml);
      setTitle(initial.title || extractTitleClient(documentHtml));
      setBodyHtml(documentHtml);
      setForceEditor(Boolean(initial.title || initial.bodyHtml));
      if (editorRef.current && editorRef.current.innerHTML !== documentHtml) {
        editorRef.current.innerHTML = documentHtml;
      }
    } else {
      setForceEditor(false);
    }
  }, [initial]);

  useEffect(() => {
    if (!concept || !dirtyRef.current) return;
    const timer = window.setTimeout(() => {
      const current = conceptRef.current;
      if (!current || !dirtyRef.current) return;
      setSaveState("saving");
      const html = editorRef.current?.innerHTML ?? bodyHtml;
      void saveBlogConceptAction(current.id, current.updatedAt, {
        title: extractTitleClient(html) || title,
        bodyHtml: html,
        mode,
        language,
        lengthKey,
        sourceText,
      }).then((saved) => {
        if (!saved.ok || !saved.data) {
          setSaveState("failed");
          return;
        }
        setConcept(saved.data);
        dirtyRef.current = false;
        setSaveState("saved");
      });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [title, bodyHtml, mode, language, lengthKey, sourceText, concept?.id]);

  const hasResult = forceEditor || Boolean(concept && (concept.title || concept.bodyHtml));
  const canGenerateText = brand.hasVoice && sourceText.trim().length >= 8 && busy !== "text";
  const canGenerateVisual = brand.hasVisual && sourceText.trim().length >= 8 && busy !== "image";
  const brandOutdated =
    Boolean(concept?.brandVersionNumber != null && brand.versionNumber != null) &&
    concept!.brandVersionNumber !== brand.versionNumber;

  async function ensureConcept() {
    let current = concept;
    if (!current) {
      const created = await createBlogConceptAction({
        tenantId,
        mode,
        language,
        lengthKey,
        sourceText,
      });
      if (!created.ok || !created.data) {
        setError(created.ok ? "Concept aanmaken mislukt" : created.error);
        return null;
      }
      current = created.data;
      setConcept(current);
      router.replace(`/klanten/${tenantId}/content/blog/${current.id}`);
      return current;
    }
    const saved = await saveBlogConceptAction(current.id, current.updatedAt, {
      mode,
      language,
      lengthKey,
      sourceText,
    });
    if (!saved.ok || !saved.data) {
      setError(saved.ok ? "Opslaan mislukt" : saved.error);
      return null;
    }
    setConcept(saved.data);
    return saved.data;
  }

  async function startGenerate() {
    setError("");
    setBusy("text");
    try {
      const current = await ensureConcept();
      if (!current) return;
      const generated = await generateBlogTextAction(current.id);
      if (!generated.ok || !generated.data) {
        setError(generated.ok ? "Genereren mislukt" : generated.error);
        return;
      }
      const documentHtml = ensureDocumentHtml(generated.data.title, generated.data.bodyHtml);
      setConcept(generated.data);
      setTitle(generated.data.title);
      setBodyHtml(documentHtml);
      setForceEditor(true);
      if (editorRef.current) editorRef.current.innerHTML = documentHtml;
      dirtyRef.current = false;
      setSaveState("saved");
      router.refresh();
    } finally {
      setBusy("");
    }
  }

  async function startManual() {
    setError("");
    setBusy("save");
    try {
      const current = await ensureConcept();
      if (!current) return;
      const documentHtml = ensureDocumentHtml(current.title || "Titel", current.bodyHtml || "<p></p>");
      setForceEditor(true);
      setTitle(extractTitleClient(documentHtml));
      setBodyHtml(documentHtml);
      requestAnimationFrame(() => {
        if (editorRef.current) editorRef.current.innerHTML = documentHtml;
      });
      setSaveState("saved");
    } finally {
      setBusy("");
    }
  }

  async function saveExplicit() {
    if (!concept) return;
    setSaveState("saving");
    setError("");
    const html = editorRef.current?.innerHTML ?? bodyHtml;
    const saved = await saveBlogConceptAction(concept.id, concept.updatedAt, {
      title: extractTitleClient(html) || title,
      bodyHtml: html,
      mode,
      language,
      lengthKey,
      sourceText,
    });
    if (!saved.ok || !saved.data) {
      setSaveState("failed");
      setError(saved.ok ? "Opslaan mislukt" : saved.error);
      return;
    }
    setConcept(saved.data);
    setTitle(saved.data.title);
    setBodyHtml(saved.data.bodyHtml);
    if (editorRef.current) editorRef.current.innerHTML = saved.data.bodyHtml;
    dirtyRef.current = false;
    setSaveState("saved");
  }

  async function runRewrite() {
    if (!concept) return;
    setBusy("rewrite");
    setError("");
    const result = await rewriteBlogTextAction(concept.id, rewriteInstruction);
    setBusy("");
    if (!result.ok || !result.data) {
      setError(result.ok ? "Herschrijven mislukt" : result.error);
      return;
    }
    setProposal({ ...result.data.proposal, instruction: rewriteInstruction });
    setRewriteOpen(false);
  }

  async function acceptProposal() {
    if (!concept || !proposal) return;
    if (dirtyRef.current) {
      setError("Je hebt intussen handmatig gewijzigd. Vergelijk het voorstel en kies bewust.");
    }
    setBusy("rewrite");
    const applied = await applyBlogRewriteAction(
      concept.id,
      concept.updatedAt,
      proposal.title,
      proposal.bodyHtml,
      proposal.instruction,
    );
    setBusy("");
    if (!applied.ok || !applied.data) {
      setError(applied.ok ? "Voorstel toepassen mislukt" : applied.error);
      return;
    }
    const documentHtml = ensureDocumentHtml(applied.data.title, applied.data.bodyHtml);
    setConcept(applied.data);
    setTitle(applied.data.title);
    setBodyHtml(documentHtml);
    if (editorRef.current) editorRef.current.innerHTML = documentHtml;
    dirtyRef.current = false;
    setProposal(null);
    setSaveState("saved");
  }

  async function runVisual(tweak?: string) {
    setBusy("image");
    setError("");
    try {
      const current = await ensureConcept();
      if (!current) return;
      const result = await generateBlogVisualAction(current.id, tweak);
      if (!result.ok || !result.data) {
        setError(result.ok ? "Visual genereren mislukt" : result.error);
        return;
      }
      setConcept(result.data);
      router.refresh();
    } finally {
      setBusy("");
      setTweakOpen(false);
      setVisualTweak("");
    }
  }

  async function copyText() {
    const html = editorRef.current?.innerHTML ?? bodyHtml;
    const plain = htmlToPlainClient(html);
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        }),
      ]);
    } catch {
      await navigator.clipboard.writeText(plain);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 md:px-10">
      <p className="text-sm text-vice-text-muted">
        {tenantName} / Content / Blogpost
      </p>
      <Link href={`/klanten/${tenantId}/content`} className="mt-3 inline-flex text-sm text-vice-text-muted hover:text-vice-gold">
        ← Terug naar Content
      </Link>

      {!hasResult ? (
        <>
          <h1 className="mt-6 font-display text-4xl tracking-tight text-vice-text">Waarover wil je schrijven?</h1>
          <p className="mt-2 text-sm text-vice-text-muted">Van jouw idee naar een blog in de stem van je merk.</p>
        </>
      ) : (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-4xl tracking-tight text-vice-text">Je blogpost</h1>
              <span className="rounded-full border border-vice-border px-3 py-1 text-xs text-vice-text-muted">Concept</span>
              <span className="text-xs text-vice-text-muted">
                {saveState === "saving" ? "Opslaan…" : saveState === "saved" ? "Automatisch opgeslagen" : saveState === "failed" ? "Opslaan mislukt" : "Nog niet opgeslagen"}
              </span>
            </div>
          </div>
          <Button type="button" variant="secondary" disabled={busy !== "" || !concept} onClick={() => void saveExplicit()}>
            Bewaar concept
          </Button>
        </div>
      )}

      <BrandBar brand={brand} />
      {brandOutdated ? (
        <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
          Dit concept gebruikt Brand v{concept?.brandVersionNumber}. Er is een nieuwere versie (v{brand.versionNumber}). Tekst of beeld worden niet automatisch bijgewerkt.
        </p>
      ) : null}

      {!hasResult ? (
        <div className="mt-8 grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          <section className="rounded-2xl border border-vice-border bg-vice-surface p-6">
            <div className="flex flex-wrap gap-2">
              <ModeChip active={mode === "new"} onClick={() => setMode("new")}>Nieuw artikel</ModeChip>
              <ModeChip active={mode === "rewrite"} onClick={() => setMode("rewrite")}>Bestaande tekst herschrijven</ModeChip>
            </div>
            <Label className="mt-6 block text-sm">Onderwerp of ruwe tekst</Label>
            <textarea
              className="mt-2 min-h-40 w-full rounded-md border border-vice-border bg-vice-bg px-3 py-3 text-sm"
              value={sourceText}
              onChange={(event) => setSourceText(event.target.value)}
              placeholder={mode === "rewrite" ? "Plak de tekst die je wilt herschrijven…" : "Hoe breng je als groeiende kmo meer structuur in je marketing?"}
            />
            <p className="mt-2 text-xs text-vice-text-muted">
              Beschrijf je idee of plak tekst die je wilt laten herschrijven.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Taal">
                <select className={fieldClass} value={language} onChange={(event) => setLanguage(event.target.value)}>
                  <option value="nl">Nederlands</option>
                  <option value="en">Engels</option>
                </select>
              </Field>
              <Field label="Lengte">
                <select className={fieldClass} value={lengthKey} onChange={(event) => setLengthKey(event.target.value as BlogLength)}>
                  {(Object.keys(LENGTH_LABELS) as BlogLength[]).map((key) => (
                    <option key={key} value={key}>{LENGTH_LABELS[key]}</option>
                  ))}
                </select>
              </Field>
            </div>
            {!brand.hasVoice ? (
              <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
                Tone of voice ontbreekt. <Link className="text-vice-gold" href={brand.brandHref}>Vul tone of voice aan</Link>. Handmatig schrijven kan wel; merkgebonden generatie staat uit.
              </p>
            ) : null}
            <div className="mt-6 flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={!canGenerateText}
                title={!brand.hasVoice ? "Tone of voice ontbreekt" : sourceText.trim().length < 8 ? "Vul eerst een onderwerp in" : undefined}
                onClick={() => void startGenerate()}
              >
                {busy === "text" ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                Genereer met AI
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={sourceText.trim().length < 8 || busy !== ""}
                onClick={() => void startManual()}
              >
                Schrijf zelf
              </Button>
            </div>
          </section>
          <VisualCard
            brand={brand}
            concept={concept}
            canGenerate={canGenerateVisual}
            busy={busy === "image"}
            onGenerate={() => void runVisual()}
            disabledReason={
              !brand.hasVisual
                ? "Beeldstijl ontbreekt"
                : sourceText.trim().length < 8
                  ? "Vul eerst een onderwerp in"
                  : undefined
            }
          />
        </div>
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          <section className="rounded-2xl border border-vice-border bg-vice-surface p-4 md:p-6">
            <EditorToolbar editorRef={editorRef} />
            <div
              ref={editorRef}
              className="prose-vice mt-4 min-h-80 rounded-md border border-transparent px-1 py-2 outline-none focus:border-vice-border"
              contentEditable
              suppressContentEditableWarning
              onInput={() => {
                dirtyRef.current = true;
                const html = editorRef.current?.innerHTML ?? "";
                setBodyHtml(html);
                setTitle(extractTitleClient(html) || title);
                setSaveState("idle");
              }}
            />
            <p className="mt-3 text-xs text-vice-text-muted">{concept?.wordCount ?? 0} woorden</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" variant="secondary" disabled={!brand.hasVoice || busy !== ""} onClick={() => setRewriteOpen((value) => !value)}>
                <Sparkles className="size-4" /> Herschrijf met AI
              </Button>
              <Button type="button" variant="secondary" onClick={() => void copyText()}>
                <Copy className="size-4" /> {copied ? "Gekopieerd" : "Kopieer tekst"}
              </Button>
            </div>
            {rewriteOpen ? (
              <div className="mt-4 rounded-xl border border-vice-border p-4">
                <p className="text-sm font-medium">Wat wil je aanpassen?</p>
                <textarea
                  className={`${fieldClass} mt-2 min-h-20`}
                  value={rewriteInstruction}
                  onChange={(event) => setRewriteInstruction(event.target.value)}
                  placeholder="Korter, duidelijker, andere invalshoek…"
                />
                <div className="mt-3 flex gap-2">
                  <Button type="button" disabled={busy !== "" || !rewriteInstruction.trim()} onClick={() => void runRewrite()}>
                    {busy === "rewrite" ? <LoaderCircle className="size-4 animate-spin" /> : null}
                    Voorstel maken
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setRewriteOpen(false)}>Annuleren</Button>
                </div>
              </div>
            ) : null}
            {proposal ? (
              <div className="mt-4 rounded-xl border border-vice-gold/40 bg-vice-gold/5 p-4">
                <p className="text-sm font-medium">AI-voorstel</p>
                <div className="prose-vice mt-2 max-h-64 overflow-auto" dangerouslySetInnerHTML={{ __html: proposal.bodyHtml }} />
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" disabled={busy !== ""} onClick={() => void acceptProposal()}>Voorstel gebruiken</Button>
                  <Button type="button" variant="secondary" onClick={() => setProposal(null)}>Huidige tekst behouden</Button>
                </div>
              </div>
            ) : null}
          </section>
          <VisualCard
            brand={brand}
            concept={concept}
            canGenerate={canGenerateVisual}
            busy={busy === "image"}
            onGenerate={() => void runVisual()}
            onTweak={() => setTweakOpen(true)}
            onSelect={(visualId) => {
              if (!concept) return;
              void selectBlogVisualAction(concept.id, concept.updatedAt, visualId).then((result) => {
                if (result.ok && result.data) setConcept(result.data);
              });
            }}
            onAlt={(visualId, alt) => void updateBlogVisualAltAction(visualId, alt)}
          />
        </div>
      )}

      {tweakOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-vice-border bg-vice-surface p-5">
            <p className="text-sm font-medium">Wat wil je veranderen?</p>
            <p className="mt-1 text-xs text-vice-text-muted">Dit maakt een nieuwe variant. De beeldstijl van het merk blijft gelden.</p>
            <textarea className={`${fieldClass} mt-3 min-h-24`} value={visualTweak} onChange={(event) => setVisualTweak(event.target.value)} />
            <div className="mt-3 flex gap-2">
              <Button type="button" disabled={!visualTweak.trim() || busy !== ""} onClick={() => void runVisual(visualTweak)}>
                Nieuwe variant genereren
              </Button>
              <Button type="button" variant="ghost" onClick={() => setTweakOpen(false)}>Annuleren</Button>
            </div>
          </div>
        </div>
      ) : null}

      {concepts.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-sm font-medium text-vice-text">Mijn blogconcepten</h2>
          <ul className="mt-3 divide-y divide-vice-border rounded-xl border border-vice-border bg-vice-surface">
            {concepts.map((item) => (
              <li key={item.id}>
                <Link href={`/klanten/${tenantId}/content/blog/${item.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-vice-surface-muted/60">
                  <span>{item.title || item.sourceText || "Naamloos concept"}</span>
                  <span className="text-xs text-vice-text-muted">
                    {new Date(item.updatedAt).toLocaleString("nl-BE", { timeZone: "Europe/Brussels" })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {error ? <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300" role="alert">{error}</p> : null}
    </div>
  );
}

function BrandBar({ brand }: { brand: BrandContext }) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-vice-border bg-vice-surface px-4 py-3 text-sm">
      <span className="flex size-8 items-center justify-center rounded-full bg-vice-surface-muted text-xs font-semibold">
        {(brand.brandName || brand.tenantName).slice(0, 2).toUpperCase()}
      </span>
      <span className="font-medium">
        {brand.brandName || brand.tenantName}
        {brand.versionNumber != null ? ` · Brand v${brand.versionNumber}` : ""}
      </span>
      <span className="inline-flex items-center gap-1 text-xs text-vice-text-muted">
        {brand.hasVoice ? <Check className="size-3.5 text-emerald-600" /> : null}
        {brand.hasVoice ? "Tone of voice gekoppeld" : "Tone of voice ontbreekt"}
      </span>
      <span className="inline-flex items-center gap-1 text-xs text-vice-text-muted">
        {brand.hasVisual ? <Check className="size-3.5 text-emerald-600" /> : null}
        {brand.hasVisual ? "Beeldstijl gekoppeld" : "Beeldstijl ontbreekt"}
      </span>
      <Link href={brand.brandHref} className="ml-auto text-xs text-vice-gold">
        Bekijk merkrichtlijnen
      </Link>
    </div>
  );
}

function VisualCard({
  brand,
  concept,
  canGenerate,
  busy,
  onGenerate,
  onTweak,
  onSelect,
  onAlt,
  disabledReason,
}: {
  brand: BrandContext;
  concept: BlogConcept | null;
  canGenerate: boolean;
  busy: boolean;
  onGenerate: () => void;
  onTweak?: () => void;
  onSelect?: (id: string) => void;
  onAlt?: (id: string, alt: string) => void;
  disabledReason?: string;
}) {
  const selected = concept?.selectedVisual;
  return (
    <section className="rounded-2xl border border-vice-border bg-vice-surface p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-medium">Blogvisual</h2>
        {selected ? <span className="rounded-full border border-vice-border px-2 py-0.5 text-[11px] text-vice-text-muted">AI-gegenereerd</span> : null}
      </div>
      {selected?.url ? (
        <div className="mt-4 space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={selected.url} alt={selected.altText || "Blogvisual"} className="w-full rounded-xl border border-vice-border object-cover" />
          <p className="text-xs text-vice-text-muted">
            Beeldstijl: {selected.styleSummary || "merkbeeldstijl"}
            {selected.brandVersionNumber != null ? ` · Brand v${selected.brandVersionNumber}` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={!canGenerate || busy} onClick={onGenerate}>
              {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
              Opnieuw genereren
            </Button>
            <Button type="button" variant="secondary" disabled={!canGenerate || busy} onClick={onTweak}>
              Pas beeld aan
            </Button>
            <a className="inline-flex h-10 items-center rounded-md border border-vice-border px-4 text-sm" href={selected.url} download>
              Download
            </a>
          </div>
          <Field label="Alt-tekst">
            <Input
              defaultValue={selected.altText}
              onBlur={(event) => onAlt?.(selected.id, event.target.value)}
            />
          </Field>
          {concept && concept.visuals.length > 1 ? (
            <div className="grid grid-cols-3 gap-2">
              {concept.visuals.map((visual) => (
                <button
                  key={visual.id}
                  type="button"
                  className={`overflow-hidden rounded-lg border ${concept.selectedVisualId === visual.id ? "border-vice-gold" : "border-vice-border"}`}
                  onClick={() => onSelect?.(visual.id)}
                >
                  {visual.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={visual.url} alt="" className="aspect-video w-full object-cover" />
                  ) : (
                    <span className="flex aspect-video items-center justify-center text-xs text-vice-text-muted">…</span>
                  )}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-4">
          <div className="flex aspect-video items-center justify-center rounded-xl border border-dashed border-vice-border bg-vice-bg text-vice-text-muted">
            <ImageIcon className="size-8 opacity-50" />
          </div>
          <p className="mt-4 text-sm text-vice-text-muted">
            Een passend beeld in de stijl van {brand.brandName || brand.tenantName}. Gebaseerd op je onderwerp en de gekoppelde beeldstijl.
          </p>
          {!brand.hasVisual ? (
            <p className="mt-3 text-sm">
              Beeldstijl ontbreekt. <Link className="text-vice-gold" href={brand.brandHref}>Ga naar Brand</Link>.
            </p>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            className="mt-4"
            disabled={!canGenerate || busy}
            title={!canGenerate ? disabledReason : undefined}
            onClick={onGenerate}
          >
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
            Genereer visual
          </Button>
          <p className="mt-3 text-xs text-vice-text-muted">Je kunt tekst en beeld daarna aanpassen.</p>
        </div>
      )}
      {concept?.imageJobError ? <p className="mt-3 text-sm text-red-700 dark:text-red-300">{concept.imageJobError}</p> : null}
    </section>
  );
}

function EditorToolbar({ editorRef }: { editorRef: React.RefObject<HTMLDivElement | null> }) {
  function command(cmd: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
  }
  return (
    <div className="flex flex-wrap gap-1 border-b border-vice-border pb-3">
      <ToolButton onClick={() => command("formatBlock", "h1")}>H1</ToolButton>
      <ToolButton onClick={() => command("formatBlock", "h2")}>H2</ToolButton>
      <ToolButton onClick={() => command("formatBlock", "h3")}>H3</ToolButton>
      <ToolButton onClick={() => command("formatBlock", "p")}>Tekst</ToolButton>
      <ToolButton onClick={() => command("bold")}><strong>B</strong></ToolButton>
      <ToolButton onClick={() => command("italic")}><em>I</em></ToolButton>
      <ToolButton onClick={() => command("insertUnorderedList")}>• Lijst</ToolButton>
      <ToolButton onClick={() => {
        const href = window.prompt("Link-URL");
        if (href) command("createLink", href);
      }}>Link</ToolButton>
      <ToolButton onClick={() => command("undo")}>Undo</ToolButton>
      <ToolButton onClick={() => command("redo")}>Redo</ToolButton>
    </div>
  );
}

function ToolButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" className="rounded-md border border-vice-border px-2 py-1 text-xs text-vice-text-muted hover:text-vice-text" onClick={onClick}>
      {children}
    </button>
  );
}

function ModeChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs ${active ? "bg-vice-gold text-white" : "border border-vice-border text-vice-text-muted"}`}
    >
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Label className="mb-1.5 block text-xs text-vice-text-muted">{label}</Label>
      {children}
    </div>
  );
}

function htmlToPlainClient(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<li>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function extractTitleClient(html: string): string {
  const match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return match ? htmlToPlainClient(match[1]) : "";
}

function ensureDocumentHtml(title: string, bodyHtml: string): string {
  const html = bodyHtml?.trim() || "";
  if (/<h1[\s>]/i.test(html)) return html;
  const safe = title
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return `<h1>${safe || "Titel"}</h1>${html || "<p></p>"}`;
}

const fieldClass = "w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm";
