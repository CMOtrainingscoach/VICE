"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  EyeOff,
  ImagePlus,
  Layers,
  LoaderCircle,
  Plus,
  Sparkles,
  Trash2,
  Type,
} from "lucide-react";
import { ContentBrandCharacterField } from "@/components/content/content-brand-character-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BrandCharacterContentOption } from "@/lib/brand/character-types";
import { googleFontsCssHref, fontStack } from "@/lib/brand/fonts";
import type { ClientBrand, TypeRole } from "@/lib/brand/types";
import {
  BEELD_CANVAS_PRESETS,
  BEELD_QUALITY_OPTIONS,
  beeldExportDimensions,
  beeldPresetById,
  defaultLayerName,
  EU_AI_LABEL_PATH,
  newBeeldLayerId,
  type BeeldComposition,
  type BeeldCompositionSummary,
  type BeeldDocument,
  type BeeldImageQuality,
  type BeeldLayer,
} from "@/lib/content/beeld-types";
import type { BrandContext } from "@/lib/content/blog-types";
import { flattenBeeldDocument } from "@/lib/content/beeld-export";
import {
  beeldLayerIsCanvasDraggable,
  beeldLayerIsFullBleedImage,
  clampPercent,
  detachImageLayerFromCanvas,
} from "@/lib/content/beeld-layer-geometry";
import {
  createBeeldCompositionAction,
  generateBeeldLayerImageAction,
  saveBeeldCompositionAction,
  uploadBeeldLayerImageAction,
} from "@/modules/content/beeld-actions";

const fieldClass =
  "w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm text-vice-text outline-none focus:border-vice-gold";

const TYPE_ROLES: TypeRole[] = ["h1", "h2", "h3", "body"];
const SAVE_DEBOUNCE_MS = 2200;

function fullBleedImageLayer(name: string): BeeldLayer {
  return {
    id: newBeeldLayerId(),
    name,
    kind: "image",
    visible: true,
    locked: false,
    opacity: 1,
    source: "ai",
    storagePath: "",
    mimeType: "image/jpeg",
    url: null,
    prompt: "",
    fit: "cover",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  };
}

function logoLayer(): BeeldLayer {
  return {
    id: newBeeldLayerId(),
    name: "Logo",
    kind: "logo",
    visible: true,
    locked: false,
    opacity: 1,
    x: 68,
    y: 4,
    width: 28,
    height: 14,
  };
}

function aiLabelLayer(): BeeldLayer {
  return {
    id: newBeeldLayerId(),
    name: "AI-label (EU)",
    kind: "ai_label",
    visible: true,
    locked: false,
    opacity: 0.92,
    x: 4,
    y: 82,
    width: 11,
    height: 11,
  };
}

function textLayer(): BeeldLayer {
  return {
    id: newBeeldLayerId(),
    name: "Tekst",
    kind: "text",
    visible: true,
    locked: false,
    opacity: 1,
    text: "Jouw boodschap",
    typeRole: "h2",
    color: "#ffffff",
    align: "center",
    x: 8,
    y: 72,
    width: 84,
    fontSizePx: 42,
  };
}

export function BeeldWorkspace({
  tenantId,
  tenantName,
  brand,
  clientBrand,
  initial,
  compositions,
  brandCharacterOptions,
}: {
  tenantId: string;
  tenantName: string;
  brand: BrandContext;
  clientBrand: ClientBrand | null;
  initial: BeeldComposition | null;
  compositions: BeeldCompositionSummary[];
  brandCharacterOptions: BrandCharacterContentOption[];
}) {
  const router = useRouter();
  const [composition, setComposition] = useState<BeeldComposition | null>(initial);
  const [list, setList] = useState(compositions);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(
    initial?.document.layers[0]?.id ?? null,
  );
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [layerPrompt, setLayerPrompt] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const compositionRef = useRef(composition);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<{ patch: Record<string, unknown>; document?: BeeldDocument } | null>(null);
  const [savePending, setSavePending] = useState(false);

  useEffect(() => {
    compositionRef.current = composition;
  }, [composition]);

  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    },
    [],
  );

  const preset = beeldPresetById(composition?.presetId ?? "instagram_feed");
  const selectedLayer = composition?.document.layers.find((l) => l.id === selectedLayerId) ?? null;

  const fontHref = useMemo(() => {
    if (!clientBrand) return null;
    const families = TYPE_ROLES.map((r) => clientBrand.typography[r].family).filter(Boolean);
    return googleFontsCssHref(families);
  }, [clientBrand]);

  useEffect(() => {
    if (!fontHref) return;
    const id = "vice-beeld-fonts";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = fontHref;
    document.head.appendChild(link);
  }, [fontHref]);

  useEffect(() => {
    if (selectedLayer?.kind === "image") setLayerPrompt(selectedLayer.prompt);
  }, [selectedLayer?.id, selectedLayer?.kind]);

  const flushSave = useCallback(async () => {
    const comp = compositionRef.current;
    const pending = pendingSaveRef.current;
    if (!comp || !pending) return;
    pendingSaveRef.current = null;
    setBusy("save");
    setError("");
    const result = await saveBeeldCompositionAction(comp.id, comp.updatedAt, {
      ...pending.patch,
      ...(pending.document ? { document: pending.document } : {}),
    });
    setBusy("");
    if (!result.ok || !result.data) {
      setError(result.ok ? "Opslaan mislukt" : result.error);
      pendingSaveRef.current = pending;
      return;
    }
    setComposition(result.data);
    setSavePending(false);
  }, []);

  const scheduleSave = useCallback(
    (patch: Record<string, unknown> = {}, document?: BeeldDocument) => {
      const prev = pendingSaveRef.current;
      pendingSaveRef.current = {
        patch: { ...prev?.patch, ...patch },
        document: document ?? prev?.document,
      };
      setSavePending(true);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        void flushSave();
      }, SAVE_DEBOUNCE_MS);
    },
    [flushSave],
  );

  async function persistNow(patch: Record<string, unknown>, nextDocument?: BeeldDocument) {
    if (!composition) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    pendingSaveRef.current = null;
    setSavePending(false);
    setBusy("save");
    setError("");
    const result = await saveBeeldCompositionAction(composition.id, composition.updatedAt, {
      ...patch,
      ...(nextDocument ? { document: nextDocument } : {}),
    });
    setBusy("");
    if (!result.ok || !result.data) {
      setError(result.ok ? "Opslaan mislukt" : result.error);
      return;
    }
    setComposition(result.data);
  }

  async function newComposition() {
    setBusy("new");
    setError("");
    const result = await createBeeldCompositionAction(tenantId);
    setBusy("");
    if (!result.ok || !result.data) {
      setError(result.ok ? "Aanmaken mislukt" : result.error);
      return;
    }
    router.push(`/klanten/${tenantId}/content/beeld/${result.data.id}`);
  }

  function updateDocument(mutator: (doc: BeeldDocument) => BeeldDocument, options?: { immediate?: boolean }) {
    if (!composition) return;
    const next = mutator(composition.document);
    const nextComp = { ...composition, document: next };
    setComposition(nextComp);
    compositionRef.current = nextComp;
    if (options?.immediate) void persistNow({}, next);
    else scheduleSave({}, next);
  }

  function commitDocumentSave() {
    const comp = compositionRef.current;
    if (!comp) return;
    scheduleSave({}, comp.document);
  }

  function patchLayerGeometry(
    layerId: string,
    geometry: { x?: number; y?: number; width?: number; height?: number; fontSizePx?: number },
    persist = true,
  ) {
    if (!composition) return;
    const next: BeeldDocument = {
      layers: composition.document.layers.map((layer) => {
        if (layer.id !== layerId) return layer;
        if (layer.kind === "text") {
          return {
            ...layer,
            x: geometry.x ?? layer.x,
            y: geometry.y ?? layer.y,
            width: geometry.width ?? layer.width,
            fontSizePx: geometry.fontSizePx ?? layer.fontSizePx,
          };
        }
        if (layer.kind === "logo" || layer.kind === "image" || layer.kind === "ai_label") {
          return {
            ...layer,
            x: geometry.x ?? layer.x,
            y: geometry.y ?? layer.y,
            width: geometry.width ?? layer.width,
            height: geometry.height ?? layer.height,
          };
        }
        return layer;
      }),
    };
    const nextComp = { ...composition, document: next };
    setComposition(nextComp);
    compositionRef.current = nextComp;
    if (persist) scheduleSave({}, next);
  }

  function addLayer(kind: "image" | "logo" | "text" | "ai_label") {
    if (!composition) return;
    if (kind === "ai_label" && composition.document.layers.some((l) => l.kind === "ai_label")) {
      setError("Er staat al een AI-label op dit beeld. Verwijder het huidige label om opnieuw toe te voegen.");
      return;
    }
    const imageCount = composition.document.layers.filter((l) => l.kind === "image").length;
    const layer =
      kind === "logo"
        ? logoLayer()
        : kind === "text"
          ? textLayer()
          : kind === "ai_label"
            ? aiLabelLayer()
            : fullBleedImageLayer(defaultLayerName("image", imageCount + 1));
    const next: BeeldDocument = { layers: [...composition.document.layers, layer] };
    setSelectedLayerId(layer.id);
    scheduleSave({}, next);
    setComposition({ ...composition, document: next });
    compositionRef.current = { ...composition, document: next };
  }

  function moveLayer(id: string, dir: -1 | 1) {
    if (!composition) return;
    const layers = [...composition.document.layers];
    const index = layers.findIndex((l) => l.id === id);
    const target = index + dir;
    if (index < 0 || target < 0 || target >= layers.length) return;
    const [item] = layers.splice(index, 1);
    layers.splice(target, 0, item);
    scheduleSave({}, { layers });
    setComposition({ ...composition, document: { layers } });
    compositionRef.current = { ...composition, document: { layers } };
  }

  function removeLayer(id: string) {
    if (!composition) return;
    const layers = composition.document.layers.filter((l) => l.id !== id);
    void persistNow({}, { layers });
    setComposition({ ...composition, document: { layers } });
    if (selectedLayerId === id) setSelectedLayerId(layers[layers.length - 1]?.id ?? null);
  }

  async function generateActiveLayer() {
    if (!composition || !selectedLayer || selectedLayer.kind !== "image") return;
    setBusy("generate");
    setError("");
    const result = await generateBeeldLayerImageAction({
      compositionId: composition.id,
      layerId: selectedLayer.id,
      prompt: layerPrompt,
      expectedUpdatedAt: composition.updatedAt,
    });
    setBusy("");
    if (!result.ok || !result.data) {
      setError(result.ok ? "Genereren mislukt" : result.error);
      return;
    }
    setComposition(result.data);
  }

  async function uploadToActiveLayer(file: File) {
    if (!composition || !selectedLayer || selectedLayer.kind !== "image") return;
    setBusy("upload");
    setError("");
    const form = new FormData();
    form.set("file", file);
    const result = await uploadBeeldLayerImageAction(
      composition.id,
      selectedLayer.id,
      composition.updatedAt,
      form,
    );
    setBusy("");
    if (!result.ok || !result.data) {
      setError(result.ok ? "Upload mislukt" : result.error);
      return;
    }
    setComposition(result.data);
  }

  async function downloadFlat() {
    if (!composition) return;
    setBusy("download");
    setError("");
    try {
      const dims = beeldExportDimensions(composition.presetId, composition.imageQuality);
      const blob = await flattenBeeldDocument({
        document: composition.document,
        preset,
        exportWidth: dims.width,
        exportHeight: dims.height,
        logoUrl: clientBrand?.logoUrl,
        aiLabelUrl: `${window.location.origin}${EU_AI_LABEL_PATH}`,
        typography: clientBrand?.typography ?? {},
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${composition.title.replace(/\s+/g, "-").slice(0, 40) || "beeld"}.jpg`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Download mislukt. Controleer of alle lagen geladen zijn (CORS).");
    } finally {
      setBusy("");
    }
  }

  const previewAspect =
    preset.aspectRatio === "9:16" ? "aspect-[9/16]" : preset.aspectRatio === "16:9" ? "aspect-video" : preset.aspectRatio === "4:5" ? "aspect-[4/5]" : "aspect-square";

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8 md:px-10">
      <p className="text-sm text-vice-text-muted">
        <Link href={`/klanten/${tenantId}/content`} className="hover:text-vice-text">
          {tenantName} / Content
        </Link>
        {" / "}
        Beeldmateriaal
      </p>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-vice-gold">Content</p>
          <h1 className="font-display text-3xl text-vice-text">Beeldmateriaal</h1>
          <p className="mt-2 max-w-xl text-sm text-vice-text-muted">
            Gelaagde merkvisuals: formaat en kwaliteit kiezen, per laag genereren of uploaden, logo en tekst erboven.
          </p>
        </div>
        <Button type="button" disabled={Boolean(busy)} onClick={() => void newComposition()}>
          <Plus className="size-4" />
          Nieuw beeld
        </Button>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)_320px]">
        <aside className="space-y-2">
          <p className="text-xs font-medium uppercase text-vice-text-muted">Projecten</p>
          <ul className="space-y-1">
            {list.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/klanten/${tenantId}/content/beeld/${item.id}`}
                  className={
                    composition?.id === item.id
                      ? "block rounded-md bg-vice-surface px-3 py-2 text-sm text-vice-text"
                      : "block rounded-md px-3 py-2 text-sm text-vice-text-muted hover:bg-vice-surface"
                  }
                >
                  {item.title || "Naamloos"}
                </Link>
              </li>
            ))}
            {list.length === 0 ? (
              <li className="px-3 py-2 text-xs text-vice-text-muted">Nog geen composities.</li>
            ) : null}
          </ul>
        </aside>

        {!composition ? (
          <div className="lg:col-span-2 rounded-xl border border-dashed border-vice-border p-12 text-center text-sm text-vice-text-muted">
            Kies een project of maak een nieuw beeld om te starten.
          </div>
        ) : (
          <>
            <div className="min-w-0 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={composition.title}
                  disabled={Boolean(busy)}
                  onChange={(e) => setComposition({ ...composition, title: e.target.value })}
                  onBlur={() => scheduleSave({ title: composition.title })}
                  className="max-w-xs font-medium"
                />
                <Button type="button" variant="secondary" disabled={Boolean(busy)} onClick={() => void downloadFlat()}>
                  {busy === "download" ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
                  Download compositie
                </Button>
              </div>
              <div
                ref={canvasRef}
                className={`relative mx-auto w-full max-w-lg touch-none overflow-hidden rounded-xl border border-vice-border bg-[#111] ${previewAspect}`}
              >
                {composition.document.layers.map((layer, index) => (
                  <BeeldLayerPreview
                    key={layer.id}
                    layer={layer}
                    zIndex={index + 1}
                    selected={layer.id === selectedLayerId}
                    logoUrl={clientBrand?.logoUrl}
                    typography={clientBrand?.typography}
                    canvasRef={canvasRef}
                    onSelect={() => setSelectedLayerId(layer.id)}
                    onGeometryChange={(geometry, persist) => patchLayerGeometry(layer.id, geometry, persist)}
                    onGeometryCommit={() => commitDocumentSave()}
                  />
                ))}
                {composition.document.layers.length === 0 ? (
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-vice-text-muted">
                    Voeg laag 1 toe (rechts)
                  </div>
                ) : null}
              </div>
              <p className="text-center text-xs text-vice-text-muted">
                {preset.label} · {beeldExportDimensions(composition.presetId, composition.imageQuality).width}×
                {beeldExportDimensions(composition.presetId, composition.imageQuality).height}px export · sleep tekst/logo om
                te verplaatsen
              </p>
            </div>

            <div className="space-y-6">
              <section className="rounded-xl border border-vice-border p-4">
                <h2 className="text-sm font-medium text-vice-text">Canvas</h2>
                <div className="mt-3 space-y-3">
                  <div>
                    <Label className="text-xs text-vice-text-muted">Formaat</Label>
                    <select
                      className={`${fieldClass} mt-1`}
                      value={composition.presetId}
                      disabled={Boolean(busy)}
                      onChange={(e) => {
                        const presetId = e.target.value;
                        setComposition({ ...composition, presetId });
                        scheduleSave({ presetId });
                      }}
                    >
                      {BEELD_CANVAS_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label} ({p.width}×{p.height})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs text-vice-text-muted">Kwaliteit (AI)</Label>
                    <select
                      className={`${fieldClass} mt-1`}
                      value={composition.imageQuality}
                      disabled={Boolean(busy)}
                      onChange={(e) => {
                        const imageQuality = e.target.value as BeeldImageQuality;
                        setComposition({ ...composition, imageQuality });
                        scheduleSave({ imageQuality });
                      }}
                    >
                      {BEELD_QUALITY_OPTIONS.map((q) => (
                        <option key={q.id} value={q.id}>
                          {q.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs text-vice-text-muted">Beeldstijl</Label>
                    <select
                      className={`${fieldClass} mt-1`}
                      value={composition.styleId || brand.styles[0]?.id || ""}
                      disabled={Boolean(busy) || !brand.hasVisual}
                      onChange={(e) => {
                        const styleId = e.target.value;
                        setComposition({ ...composition, styleId });
                        scheduleSave({ styleId });
                      }}
                    >
                      {brand.styles.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <ContentBrandCharacterField
                    tenantId={tenantId}
                    options={brandCharacterOptions}
                    value={composition.brandCharacterId ?? ""}
                    disabled={Boolean(busy)}
                    onChange={(characterId) => {
                      const brandCharacterId = characterId || null;
                      setComposition({ ...composition, brandCharacterId });
                      scheduleSave({ brandCharacterId });
                    }}
                  />
                </div>
              </section>

              <section className="rounded-xl border border-vice-border p-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-sm font-medium text-vice-text">
                    <Layers className="size-4" />
                    Lagen
                  </h2>
                  <div className="flex flex-wrap gap-1">
                    <Button type="button" variant="secondary" disabled={Boolean(busy)} onClick={() => addLayer("image")}>
                      <ImagePlus className="size-3.5" /> Beeld
                    </Button>
                    <Button type="button" variant="secondary" disabled={Boolean(busy) || !clientBrand?.logoUrl} onClick={() => addLayer("logo")}>
                      Logo
                    </Button>
                    <Button type="button" variant="secondary" disabled={Boolean(busy)} onClick={() => addLayer("text")}>
                      <Type className="size-3.5" /> Tekst
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={Boolean(busy) || composition.document.layers.some((l) => l.kind === "ai_label")}
                      title="Optioneel EU AI-transparantielabel"
                      onClick={() => addLayer("ai_label")}
                    >
                      AI-label
                    </Button>
                  </div>
                </div>
                <ul className="mt-3 space-y-1">
                  {[...composition.document.layers].reverse().map((layer, revIndex) => {
                    const index = composition.document.layers.length - 1 - revIndex;
                    return (
                      <li key={layer.id}>
                        <div
                          className={
                            layer.id === selectedLayerId
                              ? "flex items-center gap-1 rounded-md bg-vice-surface px-2 py-1.5"
                              : "flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-vice-surface/60"
                          }
                        >
                          <button type="button" className="min-w-0 flex-1 truncate text-left text-sm" onClick={() => setSelectedLayerId(layer.id)}>
                            {layer.name}
                          </button>
                          <button
                            type="button"
                            className="p-1 text-vice-text-muted"
                            aria-label={layer.visible ? "Verbergen" : "Tonen"}
                            onClick={() => {
                              updateDocument((doc) => ({
                                layers: doc.layers.map((l) =>
                                  l.id === layer.id ? { ...l, visible: !l.visible } : l,
                                ),
                              }));
                            }}
                          >
                            {layer.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                          </button>
                          <button type="button" disabled={index === 0 || Boolean(busy)} className="p-1" onClick={() => moveLayer(layer.id, -1)}>
                            <ChevronUp className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={index === composition.document.layers.length - 1 || Boolean(busy)}
                            className="p-1"
                            onClick={() => moveLayer(layer.id, 1)}
                          >
                            <ChevronDown className="size-3.5" />
                          </button>
                          <button type="button" className="p-1 text-red-600" onClick={() => removeLayer(layer.id)}>
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2 text-xs text-vice-text-muted">Bovenste laag in de lijst = voorgrond.</p>
              </section>

              {selectedLayer ? (
                <section className="rounded-xl border border-vice-border p-4">
                  <h2 className="text-sm font-medium text-vice-text">Laag: {selectedLayer.name}</h2>
                  {selectedLayer.kind === "image" ? (
                    <div className="mt-3 space-y-3">
                      <div>
                        <Label className="text-xs text-vice-text-muted">Prompt (AI)</Label>
                        <textarea
                          className={`${fieldClass} mt-1 min-h-20`}
                          value={layerPrompt}
                          disabled={Boolean(busy)}
                          onChange={(e) => setLayerPrompt(e.target.value)}
                          placeholder="Beschrijf wat deze laag toont…"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" disabled={Boolean(busy) || !brand.hasVisual} onClick={() => void generateActiveLayer()}>
                          {busy === "generate" ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                          Genereer laag
                        </Button>
                        <input
                          ref={uploadRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void uploadToActiveLayer(file);
                            e.target.value = "";
                          }}
                        />
                        <Button type="button" variant="secondary" disabled={Boolean(busy)} onClick={() => uploadRef.current?.click()}>
                          Upload template
                        </Button>
                        {beeldLayerIsFullBleedImage(selectedLayer) ? (
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={Boolean(busy)}
                            onClick={() => {
                              updateDocument((doc) => ({
                                layers: doc.layers.map((l) =>
                                  l.id === selectedLayer.id && l.kind === "image"
                                    ? detachImageLayerFromCanvas(l)
                                    : l,
                                ),
                              }));
                            }}
                          >
                            Vrij plaatsen
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  {selectedLayer.kind === "text" ? (
                    <div className="mt-3 space-y-3">
                      <div>
                        <Label className="text-xs text-vice-text-muted">Tekst</Label>
                        <textarea
                          className={`${fieldClass} mt-1 min-h-16`}
                          value={selectedLayer.text}
                          onChange={(e) => {
                            const text = e.target.value;
                            updateDocument((doc) => ({
                              layers: doc.layers.map((l) => (l.id === selectedLayer.id && l.kind === "text" ? { ...l, text } : l)),
                            }));
                          }}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-vice-text-muted">Merkfont</Label>
                        <select
                          className={`${fieldClass} mt-1`}
                          value={selectedLayer.typeRole}
                          onChange={(e) => {
                            const typeRole = e.target.value as TypeRole;
                            updateDocument((doc) => ({
                              layers: doc.layers.map((l) =>
                                l.id === selectedLayer.id && l.kind === "text" ? { ...l, typeRole } : l,
                              ),
                            }));
                          }}
                        >
                          {TYPE_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {role.toUpperCase()} — {clientBrand?.typography[role]?.family || "—"}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <Label className="text-xs text-vice-text-muted">
                          Lettergrootte ({selectedLayer.fontSizePx}px in export)
                        </Label>
                        <div className="mt-1 flex items-center gap-3">
                          <input
                            type="range"
                            min={14}
                            max={120}
                            step={1}
                            value={selectedLayer.fontSizePx}
                            disabled={Boolean(busy)}
                            className="min-w-0 flex-1 accent-vice-gold"
                            onChange={(e) => {
                              const fontSizePx = Number(e.target.value);
                              updateDocument((doc) => ({
                                layers: doc.layers.map((l) =>
                                  l.id === selectedLayer.id && l.kind === "text" ? { ...l, fontSizePx } : l,
                                ),
                              }));
                            }}
                          />
                          <Input
                            type="number"
                            min={14}
                            max={120}
                            step={1}
                            className="w-20"
                            value={selectedLayer.fontSizePx}
                            disabled={Boolean(busy)}
                            onChange={(e) => {
                              const fontSizePx = Math.min(
                                120,
                                Math.max(14, Number(e.target.value) || selectedLayer.fontSizePx),
                              );
                              updateDocument((doc) => ({
                                layers: doc.layers.map((l) =>
                                  l.id === selectedLayer.id && l.kind === "text" ? { ...l, fontSizePx } : l,
                                ),
                              }));
                            }}
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs text-vice-text-muted">Kleur</Label>
                        <Input
                          type="color"
                          value={selectedLayer.color}
                          onChange={(e) => {
                            updateDocument((doc) => ({
                              layers: doc.layers.map((l) =>
                                l.id === selectedLayer.id && l.kind === "text" ? { ...l, color: e.target.value } : l,
                              ),
                            }));
                          }}
                        />
                      </div>
                      <p className="text-xs text-vice-text-muted">
                        Sleep op het canvas; gouden hoek = schalen. Lettergrootte geldt in de export (14–120px).
                      </p>
                    </div>
                  ) : null}
                  {selectedLayer.kind === "logo" ? (
                    <p className="mt-3 text-xs text-vice-text-muted">
                      Merklogo uit Brand. Sleep op het canvas; gebruik de hoek om te schalen.
                    </p>
                  ) : null}
                  {selectedLayer.kind === "ai_label" ? (
                    <div className="mt-3 space-y-3">
                      <p className="text-xs text-vice-text-muted">
                        Optioneel label voor AI-gegenereerde content (EU). Niet verplicht op elk platform — plaats waar
                        nodig.
                      </p>
                      <div>
                        <Label className="text-xs text-vice-text-muted">
                          Dekking ({Math.round(selectedLayer.opacity * 100)}%)
                        </Label>
                        <input
                          type="range"
                          min={0.15}
                          max={1}
                          step={0.01}
                          value={selectedLayer.opacity}
                          disabled={Boolean(busy)}
                          className="mt-1 w-full accent-vice-gold"
                          onChange={(e) => {
                            const opacity = Number(e.target.value);
                            updateDocument((doc) => ({
                              layers: doc.layers.map((l) =>
                                l.id === selectedLayer.id ? { ...l, opacity } : l,
                              ),
                            }));
                          }}
                        />
                      </div>
                      <p className="text-xs text-vice-text-muted">Sleep en schaal op het canvas.</p>
                    </div>
                  ) : null}
                </section>
              ) : null}
            </div>
          </>
        )}
      </div>

      {error ? <p className="mt-4 text-sm text-red-700 dark:text-red-300">{error}</p> : null}
      {busy === "save" ? <p className="mt-2 text-xs text-vice-text-muted">Opslaan…</p> : null}
      {composition && busy !== "save" && savePending ? (
        <p className="mt-2 text-xs text-vice-text-muted">Wijzigingen worden over enkele seconden opgeslagen…</p>
      ) : null}
    </div>
  );
}

type LayerGeometryPatch = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fontSizePx?: number;
};

function BeeldLayerPreview({
  layer,
  zIndex,
  selected,
  logoUrl,
  typography,
  canvasRef,
  onSelect,
  onGeometryChange,
  onGeometryCommit,
}: {
  layer: BeeldLayer;
  zIndex: number;
  selected: boolean;
  logoUrl?: string | null;
  typography?: ClientBrand["typography"];
  canvasRef: React.RefObject<HTMLDivElement | null>;
  onSelect: () => void;
  onGeometryChange: (geometry: LayerGeometryPatch, persist?: boolean) => void;
  onGeometryCommit: () => void;
}) {
  const dragRef = useRef<{
    mode: "move" | "resize";
    startClientX: number;
    startClientY: number;
    orig: LayerGeometryPatch;
  } | null>(null);

  if (!layer.visible) return null;

  const fullBleed = beeldLayerIsFullBleedImage(layer);
  const draggable = beeldLayerIsCanvasDraggable(layer);

  const boxStyle = {
    left: `${fullBleed ? 0 : layer.x}%`,
    top: `${fullBleed ? 0 : layer.y}%`,
    width: `${fullBleed ? 100 : layer.width}%`,
    height: `${
      fullBleed
        ? 100
        : layer.kind === "text"
          ? Math.max(12, layer.fontSizePx * 0.35)
          : layer.kind === "logo" || layer.kind === "image" || layer.kind === "ai_label"
            ? layer.height
            : 20
    }%`,
    opacity: layer.opacity,
  };

  function beginPointer(mode: "move" | "resize", event: React.PointerEvent) {
    if (!draggable || layer.locked) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect();
    const orig: LayerGeometryPatch =
      layer.kind === "text"
        ? { x: layer.x, y: layer.y, width: layer.width, fontSizePx: layer.fontSizePx }
        : layer.kind === "logo" || layer.kind === "image" || layer.kind === "ai_label"
          ? { x: layer.x, y: layer.y, width: layer.width, height: layer.height }
          : {};
    dragRef.current = {
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      orig,
    };
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);

    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      const canvas = canvasRef.current;
      if (!drag || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const dx = ((e.clientX - drag.startClientX) / rect.width) * 100;
      const dy = ((e.clientY - drag.startClientY) / rect.height) * 100;

      if (drag.mode === "move") {
        onGeometryChange(
          {
            x: clampPercent((drag.orig.x ?? 0) + dx, 0, 100 - (drag.orig.width ?? 20)),
            y: clampPercent((drag.orig.y ?? 0) + dy, 0, 100 - (drag.orig.height ?? 10)),
          },
          false,
        );
        return;
      }

      if (layer.kind === "text") {
        const nextWidth = clampPercent((drag.orig.width ?? 40) + dx, 12, 100 - (drag.orig.x ?? 0));
        const scale = nextWidth / Math.max(12, drag.orig.width ?? 40);
        onGeometryChange(
          {
            width: nextWidth,
            fontSizePx: Math.round(Math.max(14, Math.min(120, (drag.orig.fontSizePx ?? 42) * scale))),
          },
          false,
        );
        return;
      }

      onGeometryChange(
        {
          width: clampPercent((drag.orig.width ?? 30) + dx, 8, 100 - (drag.orig.x ?? 0)),
          height: clampPercent((drag.orig.height ?? 20) + dy, 8, 100 - (drag.orig.y ?? 0)),
        },
        false,
      );
    };

    const onUp = (e: PointerEvent) => {
      dragRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      onGeometryCommit();
      try {
        (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const ringClass = selected ? "ring-2 ring-vice-gold ring-inset" : "";

  if (layer.kind === "image") {
    return (
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onSelect();
        }}
        onPointerDown={(e) => {
          if (fullBleed) {
            onSelect();
            return;
          }
          beginPointer("move", e);
        }}
        className={`absolute ${fullBleed ? "inset-0 cursor-pointer" : "cursor-move"} ${ringClass}`}
        style={fullBleed ? { opacity: layer.opacity, zIndex } : { ...boxStyle, zIndex }}
      >
        {layer.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={layer.url} alt="" className="pointer-events-none size-full object-cover" draggable={false} />
        ) : (
          <span className="flex size-full items-center justify-center bg-vice-surface/20 text-[10px] text-vice-text-muted">
            Geen beeld
          </span>
        )}
        {selected && draggable && !fullBleed ? (
          <span
            className="absolute bottom-0 right-0 size-3 cursor-se-resize rounded-sm bg-vice-gold"
            onPointerDown={(e) => beginPointer("resize", e)}
          />
        ) : null}
      </div>
    );
  }

  if (layer.kind === "logo" && logoUrl) {
    return (
      <div
        role="button"
        tabIndex={0}
        onPointerDown={(e) => beginPointer("move", e)}
        className={`absolute flex cursor-move items-center justify-center ${ringClass}`}
        style={{ ...boxStyle, zIndex }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt="" className="pointer-events-none max-h-full max-w-full object-contain" draggable={false} />
        {selected ? (
          <span
            className="absolute bottom-0 right-0 size-3 cursor-se-resize rounded-sm bg-vice-gold"
            onPointerDown={(e) => beginPointer("resize", e)}
          />
        ) : null}
      </div>
    );
  }

  if (layer.kind === "ai_label") {
    return (
      <div
        role="button"
        tabIndex={0}
        onPointerDown={(e) => beginPointer("move", e)}
        className={`absolute flex cursor-move items-center justify-center ${ringClass}`}
        style={{ ...boxStyle, zIndex }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={EU_AI_LABEL_PATH}
          alt="AI"
          className="pointer-events-none max-h-full max-w-full object-contain"
          draggable={false}
        />
        {selected ? (
          <span
            className="absolute bottom-0 right-0 size-3 cursor-se-resize rounded-sm bg-vice-gold"
            onPointerDown={(e) => beginPointer("resize", e)}
          />
        ) : null}
      </div>
    );
  }

  if (layer.kind === "text") {
    const style = typography?.[layer.typeRole];
    return (
      <div
        role="button"
        tabIndex={0}
        onPointerDown={(e) => beginPointer("move", e)}
        className={`absolute cursor-move px-1 text-left ${ringClass}`}
        style={{
          ...boxStyle,
          zIndex,
          color: layer.color,
          fontFamily: fontStack(style?.family || "Inter"),
          fontWeight: style?.weight || "600",
          fontSize: `${Math.max(10, layer.fontSizePx * 0.22)}px`,
          textAlign: layer.align,
        }}
      >
        <span className="pointer-events-none whitespace-pre-wrap">{layer.text}</span>
        {selected ? (
          <span
            className="absolute bottom-0 right-0 size-3 cursor-se-resize rounded-sm bg-vice-gold"
            onPointerDown={(e) => beginPointer("resize", e)}
          />
        ) : null}
      </div>
    );
  }

  return null;
}
