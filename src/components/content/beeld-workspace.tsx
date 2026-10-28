"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
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
  createBeeldCompositionAction,
  deleteBeeldCompositionAction,
  generateBeeldLayerImageAction,
  saveBeeldCompositionAction,
  uploadBeeldLayerImageAction,
} from "@/modules/content/beeld-actions";

const fieldClass =
  "w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm text-vice-text outline-none focus:border-vice-gold";

const TYPE_ROLES: TypeRole[] = ["h1", "h2", "h3", "body"];

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

  async function persist(patch: Record<string, unknown>, nextDocument?: BeeldDocument) {
    if (!composition) return;
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

  function updateDocument(mutator: (doc: BeeldDocument) => BeeldDocument) {
    if (!composition) return;
    const next = mutator(composition.document);
    void persist({}, next);
    setComposition({ ...composition, document: next });
  }

  function addLayer(kind: "image" | "logo" | "text") {
    if (!composition) return;
    const imageCount = composition.document.layers.filter((l) => l.kind === "image").length;
    const layer =
      kind === "logo" ? logoLayer() : kind === "text" ? textLayer() : fullBleedImageLayer(defaultLayerName("image", imageCount + 1));
    const next: BeeldDocument = { layers: [...composition.document.layers, layer] };
    setSelectedLayerId(layer.id);
    void persist({}, next);
    setComposition({ ...composition, document: next });
  }

  function moveLayer(id: string, dir: -1 | 1) {
    if (!composition) return;
    const layers = [...composition.document.layers];
    const index = layers.findIndex((l) => l.id === id);
    const target = index + dir;
    if (index < 0 || target < 0 || target >= layers.length) return;
    const [item] = layers.splice(index, 1);
    layers.splice(target, 0, item);
    void persist({}, { layers });
    setComposition({ ...composition, document: { layers } });
  }

  function removeLayer(id: string) {
    if (!composition) return;
    const layers = composition.document.layers.filter((l) => l.id !== id);
    void persist({}, { layers });
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
                  onBlur={() => void persist({ title: composition.title })}
                  className="max-w-xs font-medium"
                />
                <Button type="button" variant="secondary" disabled={Boolean(busy)} onClick={() => void downloadFlat()}>
                  {busy === "download" ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
                  Download compositie
                </Button>
              </div>
              <div
                className={`relative mx-auto w-full max-w-lg overflow-hidden rounded-xl border border-vice-border bg-[#111] ${previewAspect}`}
              >
                {composition.document.layers.map((layer, index) => (
                  <BeeldLayerPreview
                    key={layer.id}
                    layer={layer}
                    zIndex={index + 1}
                    selected={layer.id === selectedLayerId}
                    logoUrl={clientBrand?.logoUrl}
                    typography={clientBrand?.typography}
                    onSelect={() => setSelectedLayerId(layer.id)}
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
                {beeldExportDimensions(composition.presetId, composition.imageQuality).height}px export
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
                        void persist({ presetId });
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
                        void persist({ imageQuality });
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
                        void persist({ styleId });
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
                      void persist({ brandCharacterId });
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
                    </div>
                  ) : null}
                  {selectedLayer.kind === "logo" ? (
                    <p className="mt-3 text-xs text-vice-text-muted">
                      Gebruikt het goedgekeurde merklogo uit Brand. Sleep-positionering volgt in een volgende versie; standaard rechtsboven.
                    </p>
                  ) : null}
                </section>
              ) : null}
            </div>
          </>
        )}
      </div>

      {error ? <p className="mt-4 text-sm text-red-700 dark:text-red-300">{error}</p> : null}
      {busy === "save" ? <p className="mt-2 text-xs text-vice-text-muted">Opslaan…</p> : null}
    </div>
  );
}

function BeeldLayerPreview({
  layer,
  zIndex,
  selected,
  logoUrl,
  typography,
  onSelect,
}: {
  layer: BeeldLayer;
  zIndex: number;
  selected: boolean;
  logoUrl?: string | null;
  typography?: ClientBrand["typography"];
  onSelect: () => void;
}) {
  if (!layer.visible) return null;

  const boxStyle = {
    left: `${layer.kind !== "image" || layer.width < 99 ? (layer as { x: number }).x : 0}%`,
    top: `${layer.kind !== "image" || layer.height < 99 ? (layer as { y: number }).y : 0}%`,
    width: `${layer.kind === "image" && layer.width >= 99 ? 100 : (layer as { width: number }).width}%`,
    height: `${layer.kind === "image" && layer.height >= 99 ? 100 : (layer as { height: number }).height}%`,
    opacity: layer.opacity,
  };

  if (layer.kind === "image") {
    const full = layer.width >= 99 && layer.height >= 99;
    return (
      <button
        type="button"
        onClick={onSelect}
        className={`absolute ${full ? "inset-0" : ""} ${selected ? "ring-2 ring-vice-gold ring-inset" : ""}`}
        style={full ? { opacity: layer.opacity, zIndex } : { ...boxStyle, zIndex }}
      >
        {layer.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={layer.url} alt="" className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center bg-vice-surface/20 text-[10px] text-vice-text-muted">
            Geen beeld
          </span>
        )}
      </button>
    );
  }

  if (layer.kind === "logo" && logoUrl) {
    return (
      <button
        type="button"
        onClick={onSelect}
        className={`absolute flex items-center justify-center ${selected ? "ring-2 ring-vice-gold" : ""}`}
        style={{ ...boxStyle, zIndex }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt="" className="max-h-full max-w-full object-contain" />
      </button>
    );
  }

  if (layer.kind === "text") {
    const style = typography?.[layer.typeRole];
    return (
      <button
        type="button"
        onClick={onSelect}
        className={`absolute px-1 text-left ${selected ? "ring-2 ring-vice-gold" : ""}`}
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
        {layer.text}
      </button>
    );
  }

  return null;
}
