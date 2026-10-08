"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, ImageIcon, LoaderCircle, Pencil, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LENGTH_LABELS, type BlogConcept, type BlogConceptSummary, type BlogLength, type BlogMode, type BrandContext } from "@/lib/content/blog-types";
import {
  applyBlogRewriteAction,
  createBlogConceptAction,
  deleteBlogConceptAction,
  deleteBlogVisualAction,
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
  const [conceptList, setConceptList] = useState(concepts);
  const [deletingId, setDeletingId] = useState("");
  const [pendingVisual, setPendingVisual] = useState<{ id: string; url: string; altText: string } | null>(null);
  const [selectedStyleId, setSelectedStyleId] = useState(brand.styles[0]?.id ?? "");
  const editorRef = useRef<HTMLDivElement>(null);
  const dirtyRef = useRef(false);
  const savedRangeRef = useRef<Range | null>(null);
  const conceptRef = useRef(concept);
  const autosaveTimerRef = useRef<number | null>(null);
  const savingRef = useRef(false);
  conceptRef.current = concept;

  const AUTOSAVE_IDLE_MS = 5000;

  function rememberEditorSelection() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !editorRef.current) return;
    const range = selection.getRangeAt(0);
    if (editorRef.current.contains(range.commonAncestorContainer)) {
      savedRangeRef.current = range.cloneRange();
    }
  }

  function syncEditorFromDom() {
    const editor = editorRef.current;
    if (!editor) return;
    dirtyRef.current = true;
    const next = editor.innerHTML;
    setBodyHtml(next);
    setTitle(extractTitleClient(next) || title);
    setSaveState("idle");
  }

  function insertHtmlAtRange(html: string, range: Range) {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    const holder = document.createElement("div");
    holder.innerHTML = html;
    const fragment = document.createDocumentFragment();
    let lastNode: ChildNode | null = null;
    while (holder.firstChild) {
      lastNode = fragment.appendChild(holder.firstChild);
    }
    range.deleteContents();
    range.insertNode(fragment);

    if (lastNode) {
      const after = document.createRange();
      after.setStartAfter(lastNode);
      after.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(after);
      savedRangeRef.current = after.cloneRange();
    }

    enhanceEditorWidgets(editor);
    syncEditorFromDom();
  }

  function insertHtmlAtCursor(html: string) {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection();
    let range: Range | null = null;
    if (savedRangeRef.current) {
      try {
        range = savedRangeRef.current.cloneRange();
      } catch {
        range = null;
      }
    }
    if (!range && selection && selection.rangeCount > 0) {
      const current = selection.getRangeAt(0);
      if (editor.contains(current.commonAncestorContainer)) range = current;
    }
    if (!range) {
      range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
    }
    insertHtmlAtRange(html, range);
  }

  function insertMoreBreak() {
    insertHtmlAtCursor(BLOG_MORE_BREAK_HTML);
  }

  function removeEditorWidget(node: Element, selector: string) {
    const parent = node.closest(selector) ?? node;
    parent.remove();
    syncEditorFromDom();
    rememberEditorSelection();
  }

  function setEditorHtml(html: string) {
    if (!editorRef.current) return;
    editorRef.current.innerHTML = html;
    requestAnimationFrame(() => enhanceEditorWidgets(editorRef.current));
  }

  function beginVisualPlacement(visual: { id: string; url: string | null; altText: string }) {
    if (!visual.url) {
      setError("Dit beeld heeft geen downloadbare URL. Genereer opnieuw of herlaad de pagina.");
      return;
    }
    setError("");
    setPendingVisual({ id: visual.id, url: visual.url, altText: visual.altText });
    editorRef.current?.focus();
  }

  function cancelVisualPlacement() {
    setPendingVisual(null);
  }

  async function deleteVisual(visualId: string) {
    if (!window.confirm("Deze gegenereerde afbeelding permanent verwijderen?")) return;
    setBusy("delete-visual");
    setError("");
    const result = await deleteBlogVisualAction(visualId);
    setBusy("");
    if (!result.ok || !result.data) {
      setError(result.ok ? "Visual verwijderen mislukt" : result.error);
      return;
    }
    setConcept(result.data);
    if (pendingVisual?.id === visualId) setPendingVisual(null);
    const documentHtml = ensureDocumentHtml(result.data.title, result.data.bodyHtml);
    setTitle(result.data.title);
    setBodyHtml(documentHtml);
    if (forceEditor || Boolean(result.data.title || result.data.bodyHtml)) {
      setEditorHtml(documentHtml);
    }
    dirtyRef.current = false;
    setSaveState("saved");
    router.refresh();
  }

  function placeVisualAtPoint(clientX: number, clientY: number) {
    if (!pendingVisual || !editorRef.current) return;
    const range = caretRangeFromPoint(clientX, clientY, editorRef.current);
    if (!range) return;
    insertHtmlAtRange(
      buildInlineVisualHtmlClient({
        visualId: pendingVisual.id,
        url: pendingVisual.url,
        altText: pendingVisual.altText,
      }),
      range,
    );
    setPendingVisual(null);
  }

  useEffect(() => {
    setConceptList(concepts);
  }, [concepts]);

  useEffect(() => {
    if (!brand.styles.some((style) => style.id === selectedStyleId)) {
      setSelectedStyleId(brand.styles[0]?.id ?? "");
    }
  }, [brand.styles, selectedStyleId]);

  useEffect(() => {
    if (!pendingVisual) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setPendingVisual(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingVisual]);

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
        setEditorHtml(documentHtml);
      } else {
        requestAnimationFrame(() => enhanceEditorWidgets(editorRef.current));
      }
    } else {
      setForceEditor(false);
    }
  }, [initial]);

  function scheduleAutosave() {
    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = window.setTimeout(() => {
      void runQuietAutosave();
    }, AUTOSAVE_IDLE_MS);
  }

  async function runQuietAutosave() {
    const current = conceptRef.current;
    if (!current || !dirtyRef.current || savingRef.current || busy !== "") return;
    savingRef.current = true;
    setSaveState("saving");
    const htmlSnapshot = editorRef.current?.innerHTML ?? bodyHtml;
    const titleSnapshot = extractTitleClient(htmlSnapshot) || title;
    try {
      const saved = await saveBlogConceptAction(
        current.id,
        current.updatedAt,
        {
          title: titleSnapshot,
          bodyHtml: htmlSnapshot,
          mode,
          language,
          lengthKey,
          sourceText,
        },
        { quiet: true },
      );
      if (!saved.ok || !saved.data) {
        setSaveState("failed");
        return;
      }
      const stillTyping = editorRef.current?.innerHTML !== htmlSnapshot;
      // Geen editor-HTML overschrijven: alleen metadata bijwerken zodat typen niet onderbroken wordt.
      setConcept((prev) =>
        prev && prev.id === saved.data!.id
          ? {
              ...prev,
              updatedAt: saved.data!.updatedAt,
              wordCount: stillTyping ? prev.wordCount : saved.data!.wordCount,
              textJobStatus: saved.data!.textJobStatus,
              textJobError: saved.data!.textJobError,
            }
          : saved.data!,
      );
      dirtyRef.current = stillTyping;
      setSaveState(stillTyping ? "idle" : "saved");
      if (stillTyping) scheduleAutosave();
    } finally {
      savingRef.current = false;
    }
  }

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!concept || !dirtyRef.current) return;
    scheduleAutosave();
    // Alleen herplannen bij inhoudelijke wijzigingen; blur/save regelt de rest.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scheduleAutosave is stabiel genoeg via refs
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
      setEditorHtml(documentHtml);
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
      requestAnimationFrame(() => setEditorHtml(documentHtml));
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
    setEditorHtml(saved.data.bodyHtml);
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
    setEditorHtml(documentHtml);
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
      const result = await generateBlogVisualAction(current.id, tweak, selectedStyleId || undefined);
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
    const rawHtml = editorRef.current?.innerHTML ?? bodyHtml;
    const html = toBlogExportHtmlClient(rawHtml);
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

  async function deleteConcept(itemId: string) {
    if (!window.confirm("Dit blogconcept permanent verwijderen? Tekst, revisies en visuals gaan mee weg.")) {
      return;
    }
    setDeletingId(itemId);
    setError("");
    const result = await deleteBlogConceptAction(itemId);
    setDeletingId("");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setConceptList((list) => list.filter((item) => item.id !== itemId));
    if (concept?.id === itemId) {
      setConcept(null);
      setForceEditor(false);
      setTitle("");
      setBodyHtml("");
      router.replace(`/klanten/${tenantId}/content/blog`);
    }
    router.refresh();
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
                {saveState === "saving"
                  ? "Opslaan…"
                  : saveState === "saved"
                    ? "Opgeslagen"
                    : saveState === "failed"
                      ? "Opslaan mislukt"
                      : "Wordt zo opgeslagen"}
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
            selectedStyleId={selectedStyleId}
            onStyleChange={setSelectedStyleId}
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
            <EditorToolbar
              editorRef={editorRef}
              onInsertMore={() => insertMoreBreak()}
            />
            {pendingVisual ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-vice-gold/40 bg-vice-gold/10 px-3 py-2 text-sm">
                <span>Klik in het artikel waar de foto moet komen.</span>
                <Button type="button" variant="ghost" className="h-8 px-2" onClick={cancelVisualPlacement}>
                  Annuleren
                </Button>
              </div>
            ) : null}
            <div
              ref={editorRef}
              className={`prose-vice mt-4 min-h-80 rounded-md border border-transparent px-1 py-2 outline-none focus:border-vice-border ${pendingVisual ? "is-placing-visual" : ""}`}
              contentEditable
              suppressContentEditableWarning
              onMouseUp={rememberEditorSelection}
              onKeyUp={rememberEditorSelection}
              onBlur={() => {
                rememberEditorSelection();
                if (dirtyRef.current) void runQuietAutosave();
              }}
              onClick={(event) => {
                const target = event.target as HTMLElement | null;
                if (!target) return;

                const removeMore = target.closest("[data-remove-more]");
                const more = target.closest("[data-blog-more]");
                if (removeMore && more) {
                  event.preventDefault();
                  event.stopPropagation();
                  removeEditorWidget(more, "[data-blog-more]");
                  return;
                }

                const removeVisual = target.closest("[data-remove-visual]");
                const figure = target.closest("figure.blog-inline-visual, figure[data-visual-id]");
                if (removeVisual && figure) {
                  event.preventDefault();
                  event.stopPropagation();
                  removeEditorWidget(figure, "figure[data-visual-id]");
                  return;
                }

                if (pendingVisual) {
                  event.preventDefault();
                  placeVisualAtPoint(event.clientX, event.clientY);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape" && pendingVisual) {
                  event.preventDefault();
                  cancelVisualPlacement();
                  return;
                }
                if (event.key !== "Backspace" && event.key !== "Delete") return;
                const editor = editorRef.current;
                const selection = window.getSelection();
                if (!editor || !selection || !selection.isCollapsed || selection.rangeCount === 0) return;
                const range = selection.getRangeAt(0);
                const side = event.key === "Backspace" ? "before" : "after";
                const adjacentMore = findAdjacentWidget(range, side, "[data-blog-more]");
                if (adjacentMore) {
                  event.preventDefault();
                  removeEditorWidget(adjacentMore, "[data-blog-more]");
                  return;
                }
                const adjacentVisual = findAdjacentWidget(range, side, "figure[data-visual-id]");
                if (adjacentVisual) {
                  event.preventDefault();
                  removeEditorWidget(adjacentVisual, "figure[data-visual-id]");
                }
              }}
              onInput={() => {
                dirtyRef.current = true;
                const html = editorRef.current?.innerHTML ?? "";
                setBodyHtml(html);
                setTitle(extractTitleClient(html) || title);
                setSaveState("idle");
                rememberEditorSelection();
                enhanceEditorWidgets(editorRef.current);
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
            selectedStyleId={selectedStyleId}
            onStyleChange={setSelectedStyleId}
            onSelect={(visualId) => {
              if (!concept) return;
              void selectBlogVisualAction(concept.id, concept.updatedAt, visualId).then((result) => {
                if (result.ok && result.data) setConcept(result.data);
              });
            }}
            onAlt={(visualId, alt) => void updateBlogVisualAltAction(visualId, alt)}
            onInsert={(visual) => beginVisualPlacement(visual)}
            onDeleteVisual={(visualId) => void deleteVisual(visualId)}
            placing={Boolean(pendingVisual)}
            onCancelPlace={cancelVisualPlacement}
            deletingVisual={busy === "delete-visual"}
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

      {conceptList.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-sm font-medium text-vice-text">Mijn blogconcepten</h2>
          <ul className="mt-3 divide-y divide-vice-border rounded-xl border border-vice-border bg-vice-surface">
            {conceptList.map((item) => (
              <li key={item.id} className="flex items-center gap-2 px-3 py-2 sm:px-4">
                <Link
                  href={`/klanten/${tenantId}/content/blog/${item.id}`}
                  className="min-w-0 flex-1 rounded-md px-1 py-2 text-sm hover:bg-vice-surface-muted/60"
                >
                  <span className="block truncate">{item.title || item.sourceText || "Naamloos concept"}</span>
                  <span className="mt-0.5 block text-xs text-vice-text-muted">
                    {new Date(item.updatedAt).toLocaleString("nl-BE", { timeZone: "Europe/Brussels" })}
                  </span>
                </Link>
                <div className="flex shrink-0 items-center gap-1">
                  <Link
                    href={`/klanten/${tenantId}/content/blog/${item.id}`}
                    className="inline-flex size-8 items-center justify-center rounded-md text-vice-text-muted hover:bg-vice-surface-muted hover:text-vice-text"
                    aria-label="Concept bewerken"
                    title="Bewerken"
                  >
                    <Pencil className="size-4" aria-hidden />
                  </Link>
                  <Button
                    type="button"
                    variant="ghost"
                    className="size-8 p-0 text-vice-text-muted hover:bg-vice-surface-muted hover:text-vice-danger"
                    disabled={deletingId === item.id || busy !== ""}
                    aria-label="Concept verwijderen"
                    title="Verwijderen"
                    onClick={() => void deleteConcept(item.id)}
                  >
                    {deletingId === item.id ? (
                      <LoaderCircle className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <Trash2 className="size-4" aria-hidden />
                    )}
                  </Button>
                </div>
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
  onInsert,
  onDeleteVisual,
  placing,
  onCancelPlace,
  deletingVisual,
  selectedStyleId,
  onStyleChange,
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
  onInsert?: (visual: { id: string; url: string | null; altText: string }) => void;
  onDeleteVisual?: (visualId: string) => void;
  placing?: boolean;
  onCancelPlace?: () => void;
  deletingVisual?: boolean;
  selectedStyleId?: string;
  onStyleChange?: (styleId: string) => void;
  disabledReason?: string;
}) {
  const selected = concept?.selectedVisual;
  const styleOptions = brand.styles;
  return (
    <section className="rounded-2xl border border-vice-border bg-vice-surface p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-medium">Blogvisual</h2>
        {selected ? <span className="rounded-full border border-vice-border px-2 py-0.5 text-[11px] text-vice-text-muted">AI-gegenereerd</span> : null}
      </div>
      {styleOptions.length > 0 ? (
        <div className="mt-4">
          <Label className="mb-1.5 block text-xs text-vice-text-muted">Beeldstijl</Label>
          <select
            className="w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm"
            value={selectedStyleId || styleOptions[0]?.id || ""}
            disabled={busy || deletingVisual}
            onChange={(event) => onStyleChange?.(event.target.value)}
          >
            {styleOptions.map((style) => (
              <option key={style.id} value={style.id}>{style.name}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-vice-text-muted">
            De gekozen merkstijl-prompt wordt hard meegestuurd bij generatie.
          </p>
        </div>
      ) : null}
      {selected?.url ? (
        <div className="mt-4 space-y-3">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selected.url} alt={selected.altText || "Blogvisual"} className="w-full rounded-xl border border-vice-border object-cover" />
            {onDeleteVisual ? (
              <Button
                type="button"
                variant="ghost"
                className="absolute right-2 top-2 size-8 bg-vice-surface/90 p-0 text-vice-text-muted shadow-sm hover:bg-vice-surface hover:text-vice-danger"
                disabled={busy || deletingVisual}
                aria-label="Afbeelding verwijderen"
                title="Verwijderen"
                onClick={() => onDeleteVisual(selected.id)}
              >
                {deletingVisual ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-vice-text-muted">
            Beeldstijl: {selected.styleSummary || "merkbeeldstijl"}
            {selected.brandVersionNumber != null ? ` · Brand v${selected.brandVersionNumber}` : ""}
          </p>
          {placing ? (
            <p className="rounded-lg border border-vice-gold/40 bg-vice-gold/10 px-3 py-2 text-xs">
              Klik nu in het artikel op de gewenste plaats. Esc of Annuleren om te stoppen.
            </p>
          ) : (
            <p className="text-xs text-vice-text-muted">
              Klik “In artikel invoegen” en daarna op de plek in de tekst.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={!canGenerate || busy || deletingVisual} onClick={onGenerate}>
              {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
              Opnieuw genereren
            </Button>
            <Button type="button" variant="secondary" disabled={!canGenerate || busy || deletingVisual} onClick={onTweak}>
              Pas beeld aan
            </Button>
            {placing ? (
              <Button type="button" variant="secondary" onClick={onCancelPlace}>
                Annuleren
              </Button>
            ) : (
              <Button
                type="button"
                variant="secondary"
                disabled={!onInsert || !selected.url || deletingVisual}
                title="Klik daarna in het artikel waar de foto moet staan"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onInsert?.(selected)}
              >
                In artikel invoegen
              </Button>
            )}
            <a className="inline-flex h-10 items-center rounded-md border border-vice-border px-4 text-sm" href={selected.url} download>
              Download
            </a>
            {onDeleteVisual ? (
              <Button
                type="button"
                variant="ghost"
                className="text-vice-danger hover:bg-vice-surface-muted"
                disabled={busy || deletingVisual}
                onClick={() => onDeleteVisual(selected.id)}
              >
                <Trash2 className="size-4" /> Verwijderen
              </Button>
            ) : null}
          </div>
          <Field label="Alt-tekst">
            <Input
              defaultValue={selected.altText}
              onBlur={(event) => onAlt?.(selected.id, event.target.value)}
            />
          </Field>
          {concept && concept.visuals.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {concept.visuals.map((visual) => (
                <div
                  key={visual.id}
                  className={`relative overflow-hidden rounded-lg border ${concept.selectedVisualId === visual.id ? "border-vice-gold" : "border-vice-border"}`}
                >
                  <button
                    type="button"
                    className="block w-full"
                    onClick={() => onSelect?.(visual.id)}
                    aria-label="Visual selecteren"
                  >
                    {visual.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={visual.url} alt="" className="aspect-video w-full object-cover" />
                    ) : (
                      <span className="flex aspect-video items-center justify-center text-xs text-vice-text-muted">…</span>
                    )}
                  </button>
                  {onDeleteVisual ? (
                    <button
                      type="button"
                      className="absolute right-1 top-1 inline-flex size-6 items-center justify-center rounded-full border border-vice-border bg-vice-surface/95 text-vice-text-muted hover:text-vice-danger"
                      aria-label="Variant verwijderen"
                      title="Verwijderen"
                      disabled={busy || deletingVisual}
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteVisual(visual.id);
                      }}
                    >
                      <Trash2 className="size-3" />
                    </button>
                  ) : null}
                </div>
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

function EditorToolbar({
  editorRef,
  onInsertMore,
}: {
  editorRef: React.RefObject<HTMLDivElement | null>;
  onInsertMore: () => void;
}) {
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
      <ToolButton
        onClick={onInsertMore}
        title="Korte versie / meer lezen (WordPress & Blogger <!--more-->)"
      >
        Meer…
      </ToolButton>
      <ToolButton onClick={() => command("undo")}>Undo</ToolButton>
      <ToolButton onClick={() => command("redo")}>Redo</ToolButton>
    </div>
  );
}

function ToolButton({ children, onClick, title }: { children: ReactNode; onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      className="rounded-md border border-vice-border px-2 py-1 text-xs text-vice-text-muted hover:text-vice-text"
      onClick={onClick}
      onMouseDown={(event) => event.preventDefault()}
    >
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

const BLOG_MORE_BREAK_HTML =
  '<div class="blog-more-break" data-blog-more="true" contenteditable="false"><span>Meer lezen — korte versie stopt hier</span><button type="button" class="blog-more-break-remove" data-remove-more="true" contenteditable="false" aria-label="Meer-lezen verwijderen" title="Verwijderen">×</button></div>';

function enhanceEditorWidgets(root: HTMLElement | null) {
  if (!root) return;
  root.querySelectorAll<HTMLElement>("[data-blog-more]").forEach((node) => {
    if (node.querySelector("[data-remove-more]")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "blog-more-break-remove";
    button.setAttribute("data-remove-more", "true");
    button.setAttribute("contenteditable", "false");
    button.setAttribute("aria-label", "Meer-lezen verwijderen");
    button.title = "Verwijderen";
    button.textContent = "×";
    node.appendChild(button);
  });
  root.querySelectorAll<HTMLElement>("figure[data-visual-id]").forEach((node) => {
    node.classList.add("blog-inline-visual");
    if (node.querySelector("[data-remove-visual]")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "blog-inline-visual-remove";
    button.setAttribute("data-remove-visual", "true");
    button.setAttribute("contenteditable", "false");
    button.setAttribute("aria-label", "Afbeelding verwijderen");
    button.title = "Verwijderen";
    button.textContent = "×";
    node.prepend(button);
  });
}

function findAdjacentWidget(range: Range, side: "before" | "after", selector: string): Element | null {
  const container = range.startContainer;
  const offset = range.startOffset;

  const asElement = (node: Node | null): Element | null => {
    if (!node) return null;
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      if (el.matches?.(selector)) return el;
      return el.closest?.(selector) ?? null;
    }
    return null;
  };

  const walk = (node: Node | null, direction: "previousSibling" | "nextSibling"): Element | null => {
    let current: Node | null = node;
    while (current) {
      const hit =
        asElement(current) ??
        (current.nodeType === Node.ELEMENT_NODE ? (current as Element).querySelector?.(selector) : null);
      if (hit) return hit;
      current = (current as ChildNode)[direction];
    }
    return null;
  };

  if (container.nodeType === Node.TEXT_NODE) {
    const text = container.textContent ?? "";
    if (side === "before" && offset === 0) {
      return (
        walk(container.previousSibling, "previousSibling") ??
        asElement(container.parentElement?.previousSibling ?? null) ??
        walk(container.parentElement?.previousSibling ?? null, "previousSibling")
      );
    }
    if (side === "after" && offset === text.length) {
      return (
        walk(container.nextSibling, "nextSibling") ??
        asElement(container.parentElement?.nextSibling ?? null) ??
        walk(container.parentElement?.nextSibling ?? null, "nextSibling")
      );
    }
    return null;
  }

  if (container.nodeType === Node.ELEMENT_NODE) {
    const el = container as Element;
    if (side === "before") {
      const prev = el.childNodes[offset - 1] ?? el.previousSibling;
      return asElement(prev) ?? walk(prev, "previousSibling");
    }
    const next = el.childNodes[offset] ?? el.nextSibling;
    return asElement(next) ?? walk(next, "nextSibling");
  }

  return null;
}

function caretRangeFromPoint(clientX: number, clientY: number, editor: HTMLElement): Range | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  let range: Range | null = null;
  if (typeof doc.caretRangeFromPoint === "function") {
    range = doc.caretRangeFromPoint(clientX, clientY);
  } else if (typeof doc.caretPositionFromPoint === "function") {
    const pos = doc.caretPositionFromPoint(clientX, clientY);
    if (pos) {
      range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      range.collapse(true);
    }
  }
  if (!range || !editor.contains(range.commonAncestorContainer)) {
    // Fallback: einde van de editor
    range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
  }
  return range;
}

function escapeHtmlClient(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildInlineVisualHtmlClient(input: { visualId: string; url: string; altText: string }): string {
  const alt = escapeHtmlClient(input.altText || "Blogvisual");
  const id = escapeHtmlClient(input.visualId);
  const src = escapeHtmlClient(input.url);
  return `<figure class="blog-inline-visual" data-visual-id="${id}" contenteditable="false"><button type="button" class="blog-inline-visual-remove" data-remove-visual="true" contenteditable="false" aria-label="Afbeelding verwijderen" title="Verwijderen">×</button><img data-visual-id="${id}" src="${src}" alt="${alt}" /></figure>`;
}

function toBlogExportHtmlClient(html: string): string {
  return html
    .replace(/<div[^>]*data-blog-more(?:="[^"]*")?[^>]*>[\s\S]*?<\/div>/gi, "<!--more-->")
    .replace(/<hr[^>]*data-blog-more(?:="[^"]*")?[^>]*\/?>/gi, "<!--more-->");
}

function htmlToPlainClient(html: string): string {
  return html
    .replace(/<div[^>]*data-blog-more(?:="[^"]*")?[^>]*>[\s\S]*?<\/div>/gi, "\n\n<!--more-->\n\n")
    .replace(/<!--more-->/gi, "\n\n<!--more-->\n\n")
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
