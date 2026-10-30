"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, LoaderCircle, Megaphone, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { ContentBeeldImportField } from "@/components/content/content-beeld-import-field";
import { ContentBrandCharacterField } from "@/components/content/content-brand-character-field";
import {
  ContentBuyerPersonaField,
  resolveDefaultContentBuyerPersonaId,
} from "@/components/content/content-buyer-persona-field";
import type { BrandCharacterContentOption } from "@/lib/brand/character-types";
import type { ClientBrand } from "@/lib/brand/types";
import type { BeeldCompositionSummary } from "@/lib/content/beeld-types";
import type { ContentBuyerPersonaOption } from "@/lib/content/blog-types";
import { AD_TEMPLATES } from "@/lib/content/ad-templates";
import {
  AD_STATUSES,
  META_LIMITS,
  META_PLACEMENTS,
  RSA_LIMITS,
  isGoogleRsa,
  isMetaCarousel,
  isMetaSingle,
  platformFormatLabel,
  type AdConcept,
  type AdConceptSummary,
  type AdCopyPayload,
  type AdFolder,
  type AdStatus,
  type GoogleRsaPayload,
  type MetaCarouselCard,
  type MetaCarouselPayload,
  type MetaPlacement,
  type MetaSinglePayload,
} from "@/lib/content/ad-types";
import {
  createAdConceptAction,
  deleteAdAssetAction,
  deleteAdConceptAction,
  saveAdConceptAction,
  selectAdAssetAction,
  uploadAdAssetAction,
  upsertAdFolderAction,
} from "@/modules/content/ad-actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const fieldClass =
  "w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm text-vice-text outline-none focus:border-vice-gold";

const LOCALE_OPTIONS = [
  { id: "nl", label: "NL" },
  { id: "en", label: "EN" },
  { id: "fr", label: "FR" },
  { id: "de", label: "DE" },
];

function charHint(current: number, max: number) {
  const over = current > max;
  return (
    <span className={`text-xs ${over ? "text-red-600" : "text-vice-text-muted"}`}>
      {current}/{max}
    </span>
  );
}

export function AdsWorkspace({
  tenantId,
  tenantName,
  brandHref,
  initial,
  concepts,
  folders,
  buyerPersonaOptions = [],
  brandCharacterOptions = [],
  beeldCompositions = [],
  clientBrand = null,
}: {
  tenantId: string;
  tenantName: string;
  brandHref: string;
  initial: AdConcept | null;
  concepts: AdConceptSummary[];
  folders: AdFolder[];
  buyerPersonaOptions?: ContentBuyerPersonaOption[];
  brandCharacterOptions?: BrandCharacterContentOption[];
  beeldCompositions?: BeeldCompositionSummary[];
  clientBrand?: ClientBrand | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [concept, setConcept] = useState<AdConcept | null>(initial);
  const [conceptList, setConceptList] = useState(concepts);
  const [folderList, setFolderList] = useState(folders);
  const [internalName, setInternalName] = useState(initial?.internalName ?? "");
  const [folderId, setFolderId] = useState(initial?.folderId ?? "");
  const [status, setStatus] = useState<AdStatus>(initial?.status ?? "draft");
  const [tagsText, setTagsText] = useState((initial?.tags ?? []).join(", "));
  const [metaPlacements, setMetaPlacements] = useState<MetaPlacement[]>(initial?.metaPlacements ?? ["facebook", "instagram"]);
  const [multiLanguageEnabled, setMultiLanguageEnabled] = useState(initial?.multiLanguageEnabled ?? false);
  const [primaryLanguage, setPrimaryLanguage] = useState(initial?.primaryLanguage ?? "nl");
  const [activeLocale, setActiveLocale] = useState(initial?.primaryLanguage ?? "nl");
  const [legalReviewRequired, setLegalReviewRequired] = useState(initial?.legalReviewRequired ?? false);
  const [legalReviewCleared, setLegalReviewCleared] = useState(initial?.legalReviewCleared ?? false);
  const [legalNote, setLegalNote] = useState(initial?.legalNote ?? "");
  const [payload, setPayload] = useState<AdCopyPayload>(initial?.payload ?? { finalUrl: "", headlines: [""], descriptions: [""], path1: "", path2: "" });
  const [localePayloads, setLocalePayloads] = useState<Record<string, AdCopyPayload>>(initial?.localePayloads ?? {});
  const [buyerPersonaId, setBuyerPersonaId] = useState(() =>
    resolveDefaultContentBuyerPersonaId(buyerPersonaOptions, initial?.buyerPersonaId ?? null),
  );
  const [brandCharacterId, setBrandCharacterId] = useState(initial?.brandCharacterId ?? "");
  const [newFolderName, setNewFolderName] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [deletingId, setDeletingId] = useState("");
  const [listFolderFilter, setListFolderFilter] = useState<string>("");

  const editingPayload = useMemo(() => {
    if (!multiLanguageEnabled || activeLocale === primaryLanguage) return payload;
    return localePayloads[activeLocale] ?? payload;
  }, [multiLanguageEnabled, activeLocale, primaryLanguage, payload, localePayloads]);

  function setEditingPayload(next: AdCopyPayload) {
    if (!multiLanguageEnabled || activeLocale === primaryLanguage) {
      setPayload(next);
      return;
    }
    setLocalePayloads((prev) => ({ ...prev, [activeLocale]: next }));
  }

  function parseTags(): string[] {
    return tagsText
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  async function saveCurrent(options?: { quiet?: boolean }) {
    if (!concept) return null;
    if (!options?.quiet) setSaveState("saving");
    const saved = await saveAdConceptAction(concept.id, concept.updatedAt, {
      internalName,
      folderId: folderId || null,
      status,
      tags: parseTags(),
      metaPlacements: concept.platform === "meta" ? metaPlacements : [],
      multiLanguageEnabled,
      primaryLanguage,
      legalReviewRequired,
      legalReviewCleared,
      legalNote,
      payload,
      localePayloads,
      buyerPersonaId: buyerPersonaId || null,
      brandCharacterId: brandCharacterId || null,
    });
    if (!saved.ok || !saved.data) {
      setError(saved.ok ? "Opslaan mislukt" : saved.error);
      setSaveState("failed");
      return null;
    }
    setConcept(saved.data);
    setSaveState("saved");
    setTimeout(() => setSaveState("idle"), 2000);
    return saved.data;
  }

  async function createFromTemplate(templateKey: string) {
    const template = AD_TEMPLATES.find((item) => item.key === templateKey);
    if (!template) return;
    setBusy("create");
    setError("");
    const created = await createAdConceptAction({
      tenantId,
      platform: template.platform,
      format: template.format,
      templateKey: template.key,
      folderId: listFolderFilter || null,
      metaPlacements: template.metaPlacements,
    });
    setBusy("");
    if (!created.ok || !created.data) {
      setError(created.ok ? "Aanmaken mislukt" : created.error);
      return;
    }
    router.replace(`/klanten/${tenantId}/content/ads/${created.data.id}`);
  }

  async function uploadAsset(files: FileList | null) {
    if (!files?.length || !concept) return;
    setBusy("upload");
    setError("");
    const form = new FormData();
    form.set("file", files[0]);
    const result = await uploadAdAssetAction(concept.id, form);
    setBusy("");
    if (!result.ok || !result.data) {
      setError(result.ok ? "Upload mislukt" : result.error);
      return;
    }
    setConcept(result.data);
  }

  async function deleteAsset(assetId: string) {
    if (!concept) return;
    setBusy("asset");
    const result = await deleteAdAssetAction(concept.id, assetId);
    setBusy("");
    if (!result.ok || !result.data) {
      setError(result.ok ? "Verwijderen mislukt" : result.error);
      return;
    }
    setConcept(result.data);
  }

  async function deleteConcept(id: string) {
    if (!window.confirm("Deze advertentie verwijderen?")) return;
    setDeletingId(id);
    const result = await deleteAdConceptAction(id);
    setDeletingId("");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setConceptList((prev) => prev.filter((item) => item.id !== id));
    if (concept?.id === id) {
      router.replace(`/klanten/${tenantId}/content/ads`);
    }
  }

  async function addFolder() {
    if (!newFolderName.trim()) return;
    setBusy("folder");
    const saved = await upsertAdFolderAction(tenantId, null, newFolderName);
    setBusy("");
    if (!saved.ok || !saved.data) {
      setError(saved.ok ? "Map opslaan mislukt" : saved.error);
      return;
    }
    setFolderList((prev) => [...prev, saved.data!].sort((a, b) => a.name.localeCompare(b.name)));
    setFolderId(saved.data.id);
    setNewFolderName("");
  }

  function exportPackage() {
    if (!concept) return;
    const pack = {
      exportedAt: new Date().toISOString(),
      concept: {
        internalName,
        platform: concept.platform,
        format: concept.format,
        metaPlacements,
        status,
        tags: parseTags(),
        multiLanguageEnabled,
        primaryLanguage,
        legalReviewRequired,
        legalReviewCleared,
        legalNote,
        payload,
        localePayloads,
        assets: concept.assets.map((a) => ({
          id: a.id,
          altText: a.altText,
          mimeType: a.mimeType,
          url: a.url,
          storagePath: a.storagePath,
        })),
      },
    };
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${(internalName || "advertentie").replace(/[^\w\-]+/g, "_")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const filteredList = listFolderFilter
    ? conceptList.filter((item) => item.folderId === listFolderFilter)
    : conceptList;

  const needsVisual = concept && (concept.format === "single_image" || concept.format === "carousel");
  const selected = concept?.selectedAsset ?? concept?.assets[0] ?? null;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 md:px-10">
      <p className="text-sm text-vice-text-muted">
        {tenantName} /{" "}
        <Link href={`/klanten/${tenantId}/content`} className="hover:text-vice-gold">
          Content
        </Link>{" "}
        / Advertenties
      </p>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-vice-gold">Fase 1</p>
          <h1 className="mt-2 font-display text-3xl tracking-tight text-vice-text md:text-4xl">
            Advertentie-creatives
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-vice-text-muted">
            Bereid Google Search (RSA) en Meta-beelden voor. Publiceren naar ad-platforms volgt in een latere fase.
          </p>
        </div>
        {concept ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-vice-text-muted">
              {saveState === "saving" ? "Opslaan…" : saveState === "saved" ? "Opgeslagen" : null}
            </span>
            <Button type="button" variant="secondary" disabled={busy !== ""} onClick={() => void exportPackage()}>
              <Download className="size-4" />
              Export JSON
            </Button>
            <Button type="button" disabled={busy !== ""} onClick={() => void saveCurrent()}>
              Opslaan
            </Button>
          </div>
        ) : null}
      </div>

      {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}

      {!concept ? (
        <section className="mt-10">
          <h2 className="text-sm font-medium text-vice-text">Nieuwe advertentie vanuit template</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {AD_TEMPLATES.map((template) => (
              <button
                key={template.key}
                type="button"
                disabled={busy === "create"}
                className="rounded-xl border border-vice-border bg-vice-surface p-4 text-left transition-colors hover:border-vice-gold disabled:opacity-60"
                onClick={() => void createFromTemplate(template.key)}
              >
                <span className="inline-flex items-center gap-2 text-sm font-medium text-vice-text">
                  <Megaphone className="size-4 text-vice-gold" aria-hidden />
                  {template.label}
                </span>
                <p className="mt-2 text-xs text-vice-text-muted">{template.description}</p>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <section className="space-y-6 rounded-2xl border border-vice-border bg-vice-surface p-5">
            <div>
              <Label className="text-xs text-vice-text-muted">Interne naam</Label>
              <input className={`${fieldClass} mt-1`} value={internalName} onChange={(e) => setInternalName(e.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-xs text-vice-text-muted">Platform · formaat</Label>
                <p className="mt-1 text-sm text-vice-text">{platformFormatLabel(concept.platform, concept.format)}</p>
              </div>
              <div>
                <Label className="text-xs text-vice-text-muted">Status</Label>
                <select className={`${fieldClass} mt-1`} value={status} onChange={(e) => setStatus(e.target.value as AdStatus)}>
                  {AD_STATUSES.filter((item) => item.id !== "archived").map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <Label className="text-xs text-vice-text-muted">Map (campagne-thema)</Label>
              <div className="mt-1 flex flex-wrap gap-2">
                <select className={`${fieldClass} min-w-[10rem] flex-1`} value={folderId} onChange={(e) => setFolderId(e.target.value)}>
                  <option value="">Geen map</option>
                  {folderList.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
                <input
                  className={`${fieldClass} min-w-[8rem] flex-1`}
                  placeholder="Nieuwe map…"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                />
                <Button type="button" variant="secondary" disabled={busy === "folder"} onClick={() => void addFolder()}>
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>

            <div>
              <Label className="text-xs text-vice-text-muted">Tags (komma-gescheiden)</Label>
              <input className={`${fieldClass} mt-1`} value={tagsText} onChange={(e) => setTagsText(e.target.value)} />
            </div>

            {concept.platform === "meta" ? (
              <div>
                <Label className="text-xs text-vice-text-muted">Plaatsing</Label>
                <div className="mt-2 flex flex-wrap gap-3">
                  {META_PLACEMENTS.map((item) => (
                    <label key={item.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={metaPlacements.includes(item.id)}
                        onChange={() =>
                          setMetaPlacements((prev) =>
                            prev.includes(item.id) ? prev.filter((p) => p !== item.id) : [...prev, item.id],
                          )
                        }
                      />
                      {item.label}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            <ContentBuyerPersonaField
              brandHref={brandHref}
              options={buyerPersonaOptions}
              value={buyerPersonaId}
              onChange={setBuyerPersonaId}
              fieldClass={fieldClass}
            />
            <ContentBrandCharacterField
              tenantId={tenantId}
              options={brandCharacterOptions}
              value={brandCharacterId}
              onChange={setBrandCharacterId}
            />

            <div className="rounded-lg border border-vice-border bg-vice-bg/40 p-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={legalReviewRequired}
                  onChange={(e) => setLegalReviewRequired(e.target.checked)}
                />
                Juridische review vereist
              </label>
              {legalReviewRequired ? (
                <div className="mt-3 space-y-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={legalReviewCleared}
                      onChange={(e) => setLegalReviewCleared(e.target.checked)}
                    />
                    Review afgerond
                  </label>
                  <textarea
                    className={`${fieldClass} min-h-[4rem]`}
                    placeholder="Notitie voor legal…"
                    value={legalNote}
                    onChange={(e) => setLegalNote(e.target.value)}
                  />
                </div>
              ) : null}
            </div>

            <div className="rounded-lg border border-vice-border bg-vice-bg/40 p-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={multiLanguageEnabled}
                  onChange={(e) => setMultiLanguageEnabled(e.target.checked)}
                />
                Meertalige varianten
              </label>
              {multiLanguageEnabled ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Label className="text-xs text-vice-text-muted">Primaire taal</Label>
                  <select
                    className={fieldClass}
                    value={primaryLanguage}
                    onChange={(e) => {
                      setPrimaryLanguage(e.target.value);
                      setActiveLocale(e.target.value);
                    }}
                  >
                    {LOCALE_OPTIONS.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <div className="flex flex-wrap gap-1">
                    {LOCALE_OPTIONS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`rounded-md px-2 py-1 text-xs ${activeLocale === item.id ? "bg-vice-gold/20 text-vice-gold" : "bg-vice-surface-muted text-vice-text-muted"}`}
                        onClick={() => setActiveLocale(item.id)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          <section className="space-y-6 rounded-2xl border border-vice-border bg-vice-surface p-5">
            <h2 className="text-sm font-medium text-vice-text">Copy &amp; creative</h2>
            {isGoogleRsa(editingPayload) ? (
              <GoogleRsaEditor payload={editingPayload} onChange={setEditingPayload} />
            ) : isMetaSingle(editingPayload) ? (
              <MetaSingleEditor payload={editingPayload} onChange={setEditingPayload} />
            ) : isMetaCarousel(editingPayload) ? (
              <MetaCarouselEditor payload={editingPayload} onChange={setEditingPayload} />
            ) : null}

            {needsVisual ? (
              <div className="border-t border-vice-border pt-5">
                <Label className="text-xs text-vice-text-muted">Beelden</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => void uploadAsset(e.target.files)}
                  />
                  <Button type="button" variant="secondary" disabled={busy !== ""} onClick={() => fileRef.current?.click()}>
                    {busy === "upload" ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />}
                    Upload
                  </Button>
                </div>
                <div className="mt-3">
                  <ContentBeeldImportField
                    tenantId={tenantId}
                    conceptId={concept.id}
                    compositions={beeldCompositions}
                    clientBrand={clientBrand}
                    target="ads"
                    disabled={busy !== ""}
                    onAdsImported={(next) => setConcept(next)}
                  />
                </div>
                {concept.assets.length > 0 ? (
                  <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                    {concept.assets.map((asset) => (
                      <li
                        key={asset.id}
                        className={`rounded-lg border p-2 ${concept.selectedAssetId === asset.id ? "border-vice-gold" : "border-vice-border"}`}
                      >
                        {asset.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={asset.url} alt={asset.altText || ""} className="aspect-video w-full rounded object-cover" />
                        ) : (
                          <div className="flex aspect-video items-center justify-center rounded bg-vice-bg text-xs text-vice-text-muted">
                            Geen preview
                          </div>
                        )}
                        <div className="mt-2 flex gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-8 flex-1 text-xs"
                            disabled={busy !== ""}
                            onClick={() =>
                              void selectAdAssetAction(concept.id, asset.id).then((r) => {
                                if (r.ok && r.data) setConcept(r.data);
                              })
                            }
                          >
                            Selecteer
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            className="size-8 p-0"
                            disabled={busy !== ""}
                            onClick={() => void deleteAsset(asset.id)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-vice-text-muted">Voeg minstens één beeld toe voor Meta-export.</p>
                )}
                {selected?.url && concept.format === "single_image" ? (
                  <p className="mt-2 text-xs text-vice-text-muted">Geselecteerd beeld wordt meegenomen in de JSON-export.</p>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>
      )}

      <section className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-vice-text">Opgeslagen creatives</h2>
          <select
            className={`${fieldClass} w-auto min-w-[10rem]`}
            value={listFolderFilter}
            onChange={(e) => setListFolderFilter(e.target.value)}
          >
            <option value="">Alle mappen</option>
            {folderList.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
        </div>
        {filteredList.length > 0 ? (
          <ul className="mt-3 divide-y divide-vice-border rounded-xl border border-vice-border bg-vice-surface">
            {filteredList.map((item) => (
              <li key={item.id} className="flex items-center gap-2 px-3 py-2 sm:px-4">
                <Link
                  href={`/klanten/${tenantId}/content/ads/${item.id}`}
                  className="min-w-0 flex-1 rounded-md px-1 py-2 text-sm hover:bg-vice-surface-muted/60"
                >
                  <span className="block truncate">{item.internalName || "Naamloze advertentie"}</span>
                  <span className="mt-0.5 block text-xs text-vice-text-muted">
                    {platformFormatLabel(item.platform, item.format)}
                    {item.legalReviewRequired && !item.legalReviewCleared ? " · legal open" : ""}
                    {" · "}
                    {new Date(item.updatedAt).toLocaleString("nl-BE", { timeZone: "Europe/Brussels" })}
                  </span>
                </Link>
                <Link
                  href={`/klanten/${tenantId}/content/ads/${item.id}`}
                  className="inline-flex size-8 items-center justify-center rounded-md text-vice-text-muted hover:bg-vice-surface-muted"
                  aria-label="Bewerken"
                >
                  <Pencil className="size-4" />
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  className="size-8 p-0 text-vice-text-muted hover:text-vice-danger"
                  disabled={deletingId === item.id || busy !== ""}
                  onClick={() => void deleteConcept(item.id)}
                >
                  {deletingId === item.id ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-vice-text-muted">Nog geen advertenties. Kies een template hierboven.</p>
        )}
      </section>
    </div>
  );
}

function GoogleRsaEditor({
  payload,
  onChange,
}: {
  payload: GoogleRsaPayload;
  onChange: (next: GoogleRsaPayload) => void;
}) {
  function updateHeadline(index: number, value: string) {
    const headlines = [...payload.headlines];
    headlines[index] = value;
    onChange({ ...payload, headlines });
  }
  function updateDescription(index: number, value: string) {
    const descriptions = [...payload.descriptions];
    descriptions[index] = value;
    onChange({ ...payload, descriptions });
  }
  return (
    <div className="space-y-4">
      <div>
        <div className="flex justify-between">
          <Label className="text-xs text-vice-text-muted">Finale URL (optioneel, voor later)</Label>
        </div>
        <input
          className={`${fieldClass} mt-1`}
          value={payload.finalUrl}
          onChange={(e) => onChange({ ...payload, finalUrl: e.target.value })}
          placeholder="https://…"
        />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <Label className="text-xs text-vice-text-muted">Koppen</Label>
          {payload.headlines.length < RSA_LIMITS.headlineMaxCount ? (
            <button
              type="button"
              className="text-xs text-vice-gold"
              onClick={() => onChange({ ...payload, headlines: [...payload.headlines, ""] })}
            >
              + Kop
            </button>
          ) : null}
        </div>
        <div className="mt-2 space-y-2">
          {payload.headlines.map((line, index) => (
            <div key={index}>
              <div className="flex justify-end">{charHint(line.length, RSA_LIMITS.headlineMax)}</div>
              <input
                className={fieldClass}
                value={line}
                onChange={(e) => updateHeadline(index, e.target.value)}
                placeholder={`Kop ${index + 1}`}
              />
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between">
          <Label className="text-xs text-vice-text-muted">Beschrijvingen</Label>
          {payload.descriptions.length < RSA_LIMITS.descriptionMaxCount ? (
            <button
              type="button"
              className="text-xs text-vice-gold"
              onClick={() => onChange({ ...payload, descriptions: [...payload.descriptions, ""] })}
            >
              + Beschrijving
            </button>
          ) : null}
        </div>
        <div className="mt-2 space-y-2">
          {payload.descriptions.map((line, index) => (
            <div key={index}>
              <div className="flex justify-end">{charHint(line.length, RSA_LIMITS.descriptionMax)}</div>
              <textarea
                className={`${fieldClass} min-h-[3rem]`}
                value={line}
                onChange={(e) => updateDescription(index, e.target.value)}
                placeholder={`Beschrijving ${index + 1}`}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="flex justify-end">{charHint(payload.path1.length, RSA_LIMITS.pathMax)}</div>
          <Label className="text-xs text-vice-text-muted">Pad 1</Label>
          <input className={`${fieldClass} mt-1`} value={payload.path1} onChange={(e) => onChange({ ...payload, path1: e.target.value })} />
        </div>
        <div>
          <div className="flex justify-end">{charHint(payload.path2.length, RSA_LIMITS.pathMax)}</div>
          <Label className="text-xs text-vice-text-muted">Pad 2</Label>
          <input className={`${fieldClass} mt-1`} value={payload.path2} onChange={(e) => onChange({ ...payload, path2: e.target.value })} />
        </div>
      </div>
    </div>
  );
}

function MetaSingleEditor({
  payload,
  onChange,
}: {
  payload: MetaSinglePayload;
  onChange: (next: MetaSinglePayload) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <div className="flex justify-end">{charHint(payload.primaryText.length, META_LIMITS.primaryTextMax)}</div>
        <Label className="text-xs text-vice-text-muted">Primaire tekst</Label>
        <textarea
          className={`${fieldClass} mt-1 min-h-[5rem]`}
          value={payload.primaryText}
          onChange={(e) => onChange({ ...payload, primaryText: e.target.value })}
        />
      </div>
      <div>
        <div className="flex justify-end">{charHint(payload.headline.length, META_LIMITS.headlineMax)}</div>
        <Label className="text-xs text-vice-text-muted">Kop</Label>
        <input className={`${fieldClass} mt-1`} value={payload.headline} onChange={(e) => onChange({ ...payload, headline: e.target.value })} />
      </div>
      <div>
        <div className="flex justify-end">{charHint(payload.description.length, META_LIMITS.descriptionMax)}</div>
        <Label className="text-xs text-vice-text-muted">Beschrijving (link)</Label>
        <input
          className={`${fieldClass} mt-1`}
          value={payload.description}
          onChange={(e) => onChange({ ...payload, description: e.target.value })}
        />
      </div>
      <div>
        <Label className="text-xs text-vice-text-muted">Link-URL (optioneel)</Label>
        <input className={`${fieldClass} mt-1`} value={payload.linkUrl} onChange={(e) => onChange({ ...payload, linkUrl: e.target.value })} />
      </div>
      <div>
        <Label className="text-xs text-vice-text-muted">CTA-label (vrij tekstveld)</Label>
        <input className={`${fieldClass} mt-1`} value={payload.cta} onChange={(e) => onChange({ ...payload, cta: e.target.value })} />
      </div>
    </div>
  );
}

function MetaCarouselEditor({
  payload,
  onChange,
}: {
  payload: MetaCarouselPayload;
  onChange: (next: MetaCarouselPayload) => void;
}) {
  function updateCard(index: number, patch: Partial<MetaCarouselCard>) {
    const cards = payload.cards.map((card, i) => (i === index ? { ...card, ...patch } : card));
    onChange({ ...payload, cards });
  }
  return (
    <div className="space-y-4">
      <div>
        <div className="flex justify-end">{charHint(payload.primaryText.length, META_LIMITS.primaryTextMax)}</div>
        <Label className="text-xs text-vice-text-muted">Primaire tekst</Label>
        <textarea
          className={`${fieldClass} mt-1 min-h-[4rem]`}
          value={payload.primaryText}
          onChange={(e) => onChange({ ...payload, primaryText: e.target.value })}
        />
      </div>
      <div>
        <Label className="text-xs text-vice-text-muted">Standaard link-URL</Label>
        <input className={`${fieldClass} mt-1`} value={payload.linkUrl} onChange={(e) => onChange({ ...payload, linkUrl: e.target.value })} />
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-xs text-vice-text-muted">Kaarten</Label>
        {payload.cards.length < META_LIMITS.carouselCardsMax ? (
          <button
            type="button"
            className="text-xs text-vice-gold"
            onClick={() =>
              onChange({
                ...payload,
                cards: [...payload.cards, { id: crypto.randomUUID(), headline: "", description: "", linkUrl: "" }],
              })
            }
          >
            + Kaart
          </button>
        ) : null}
      </div>
      <div className="space-y-3">
        {payload.cards.map((card, index) => (
          <div key={card.id} className="rounded-lg border border-vice-border p-3">
            <p className="text-xs font-medium text-vice-text-muted">Kaart {index + 1}</p>
            <div className="mt-2 space-y-2">
              <div>
                <div className="flex justify-end">{charHint(card.headline.length, META_LIMITS.headlineMax)}</div>
                <input
                  className={fieldClass}
                  value={card.headline}
                  onChange={(e) => updateCard(index, { headline: e.target.value })}
                  placeholder="Kop"
                />
              </div>
              <div>
                <div className="flex justify-end">{charHint(card.description.length, META_LIMITS.cardDescriptionMax)}</div>
                <input
                  className={fieldClass}
                  value={card.description}
                  onChange={(e) => updateCard(index, { description: e.target.value })}
                  placeholder="Beschrijving"
                />
              </div>
              <input
                className={fieldClass}
                value={card.linkUrl}
                onChange={(e) => updateCard(index, { linkUrl: e.target.value })}
                placeholder="Link (optioneel)"
              />
            </div>
            {payload.cards.length > 2 ? (
              <Button
                type="button"
                variant="ghost"
                className="mt-2 h-8 text-xs"
                onClick={() => onChange({ ...payload, cards: payload.cards.filter((_, i) => i !== index) })}
              >
                Verwijder kaart
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
