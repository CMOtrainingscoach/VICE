"use client";

import { useMemo, useRef, useState } from "react";
import { ImagePlus, Plus, Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BRAND_CHARACTER_SLOTS,
  type BrandCharacter,
  type BrandCharacterAssetSlot,
} from "@/lib/brand/character-types";
import { buildBrandCharacterLockPrompt } from "@/lib/brand/character-prompt";
import {
  clearBrandCharacterAssetAction,
  deleteBrandCharacterAction,
  listBrandCharactersAction,
  saveBrandCharacterAction,
  uploadBrandCharacterAssetAction,
} from "@/modules/brand/character-actions";

function emptyDraft(): Omit<BrandCharacter, "id" | "tenantId" | "updatedAt" | "createdAt" | "sortOrder"> & {
  id: string | null;
} {
  return {
    id: null,
    name: "",
    description: "",
    visualPrompt: "",
    assets: { face: "", front: "", side: "", back: "", contingency: "" },
    assetUrls: {},
  };
}

function filledSlots(character: BrandCharacter | ReturnType<typeof emptyDraft>): number {
  return BRAND_CHARACTER_SLOTS.filter((s) => Boolean(character.assets[s.id]?.trim())).length;
}

export function BrandCharactersWorkspace({
  tenantId,
  initialCharacters,
}: {
  tenantId: string;
  initialCharacters: BrandCharacter[];
}) {
  const [characters, setCharacters] = useState(initialCharacters);
  const [selectedId, setSelectedId] = useState<string | "new">(initialCharacters[0]?.id ?? "new");
  const [draft, setDraft] = useState(() => {
    const first = initialCharacters[0];
    if (first) {
      return {
        id: first.id as string | null,
        name: first.name,
        description: first.description,
        visualPrompt: first.visualPrompt,
        assets: { ...first.assets },
        assetUrls: { ...first.assetUrls },
      };
    }
    return emptyDraft();
  });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selected = useMemo(
    () => (selectedId === "new" ? null : characters.find((c) => c.id === selectedId) ?? null),
    [characters, selectedId],
  );

  function selectCharacter(c: BrandCharacter) {
    setSelectedId(c.id);
    setDraft({
      id: c.id,
      name: c.name,
      description: c.description,
      visualPrompt: c.visualPrompt,
      assets: { ...c.assets },
      assetUrls: { ...c.assetUrls },
    });
    setError("");
    setNotice("");
  }

  function startNew() {
    setSelectedId("new");
    setDraft(emptyDraft());
    setError("");
    setNotice("");
  }

  async function reload() {
    const result = await listBrandCharactersAction(tenantId);
    if (result.ok && result.data) setCharacters(result.data);
  }

  async function saveMeta() {
    if (!draft.name.trim()) {
      setError("Geef een naam voor het personage.");
      return;
    }
    setBusy("save");
    setError("");
    const result = await saveBrandCharacterAction(tenantId, draft.id, {
      name: draft.name.trim(),
      description: draft.description.trim(),
      visualPrompt: draft.visualPrompt.trim(),
    });
    setBusy("");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (result.data) {
      await reload();
      setSelectedId(result.data.id);
      setDraft({
        id: result.data.id,
        name: result.data.name,
        description: result.data.description,
        visualPrompt: result.data.visualPrompt,
        assets: { ...result.data.assets },
        assetUrls: { ...result.data.assetUrls },
      });
      setNotice("Personage opgeslagen.");
    }
  }

  async function removeCharacter() {
    if (!draft.id) return;
    if (!window.confirm(`Personage "${draft.name}" definitief verwijderen?`)) return;
    setBusy("delete");
    setError("");
    const result = await deleteBrandCharacterAction(tenantId, draft.id);
    setBusy("");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await reload();
    const next = characters.filter((c) => c.id !== draft.id);
    if (next[0]) selectCharacter(next[0]);
    else startNew();
    setNotice("Personage verwijderd.");
  }

  async function uploadSlot(slot: BrandCharacterAssetSlot, file: File) {
    if (!draft.id) {
      setError("Sla het personage eerst op (naam) voordat je beelden uploadt.");
      return;
    }
    setBusy(`upload-${slot}`);
    setError("");
    const form = new FormData();
    form.set("file", file);
    const result = await uploadBrandCharacterAssetAction(tenantId, draft.id, slot, form);
    setBusy("");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (result.data) {
      setDraft({
        id: result.data.id,
        name: result.data.name,
        description: result.data.description,
        visualPrompt: result.data.visualPrompt,
        assets: { ...result.data.assets },
        assetUrls: { ...result.data.assetUrls },
      });
      await reload();
      setNotice(`${BRAND_CHARACTER_SLOTS.find((s) => s.id === slot)?.label ?? slot} geüpload.`);
    }
  }

  async function clearSlot(slot: BrandCharacterAssetSlot) {
    if (!draft.id || !draft.assets[slot]) return;
    setBusy(`clear-${slot}`);
    setError("");
    const result = await clearBrandCharacterAssetAction(tenantId, draft.id, slot);
    setBusy("");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (result.data) {
      setDraft({
        id: result.data.id,
        name: result.data.name,
        description: result.data.description,
        visualPrompt: result.data.visualPrompt,
        assets: { ...result.data.assets },
        assetUrls: { ...result.data.assetUrls },
      });
      await reload();
    }
  }

  const lockPreview = buildBrandCharacterLockPrompt({
    name: draft.name,
    description: draft.description,
    visualPrompt: draft.visualPrompt,
  });

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-vice-text-muted">Personages</p>
          <Button type="button" variant="secondary" disabled={Boolean(busy)} onClick={() => startNew()}>
            <Plus className="size-4" aria-hidden />
            Nieuw
          </Button>
        </div>
        <ul className="space-y-1">
          {characters.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={
                  selectedId === c.id
                    ? "flex w-full items-center gap-2 rounded-md bg-vice-surface px-3 py-2 text-left text-sm text-vice-text"
                    : "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-vice-text-muted hover:bg-vice-surface"
                }
                onClick={() => selectCharacter(c)}
              >
                <UserRound className="size-4 shrink-0 opacity-70" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{c.name || "Naamloos"}</span>
                <span className="text-xs text-vice-text-muted">{filledSlots(c)}/5</span>
              </button>
            </li>
          ))}
          {characters.length === 0 && selectedId === "new" ? (
            <li className="px-3 py-2 text-sm text-vice-text-muted">Nog geen personages.</li>
          ) : null}
        </ul>
      </aside>

      <div className="min-w-0 space-y-8">
        <div>
          <h2 className="font-display text-2xl text-vice-text">Characters</h2>
          <p className="mt-2 max-w-2xl text-sm text-vice-text-muted">
            Terugkerende personen voor beeld en (later) video. Upload referenties en een vaste prompt zodat AI hetzelfde
            gezicht kan reproduceren in content.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="char-name">Naam</Label>
            <Input
              id="char-name"
              className="mt-1"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="bv. Lisa — merkambassadeur"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="char-desc">Notities (intern)</Label>
            <textarea
              id="char-desc"
              className="mt-1 min-h-[72px] w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm text-vice-text"
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              placeholder="Rol in content, tone, do's/don'ts…"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="char-prompt">Visuele lock-prompt</Label>
            <textarea
              id="char-prompt"
              className="mt-1 min-h-[120px] w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 font-mono text-xs text-vice-text"
              value={draft.visualPrompt}
              onChange={(e) => setDraft((d) => ({ ...d, visualPrompt: e.target.value }))}
              placeholder="Leeftijd, haar, huid, kleding, accessoires, gezichtsvorm… Alles wat het model moet vasthouden."
            />
            <p className="mt-2 text-xs text-vice-text-muted">
              Deze tekst wordt later aan beeld- en videogeneratie meegegeven, samen met je referentiefoto&apos;s.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={Boolean(busy)} onClick={() => void saveMeta()}>
            {draft.id ? "Wijzigingen opslaan" : "Personage aanmaken"}
          </Button>
          {draft.id ? (
            <Button type="button" variant="secondary" disabled={Boolean(busy)} onClick={() => void removeCharacter()}>
              <Trash2 className="size-4" aria-hidden />
              Verwijderen
            </Button>
          ) : null}
        </div>

        <div>
          <h3 className="text-sm font-medium text-vice-text">Referentiebeelden</h3>
          <p className="mt-1 text-xs text-vice-text-muted">
            {draft.id
              ? `${filledSlots(draft)}/5 geüpload. PNG, JPEG of WebP, max. 12 MB.`
              : "Sla het personage eerst op om beelden te uploaden."}
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {BRAND_CHARACTER_SLOTS.map((slot) => (
              <AssetSlotCard
                key={slot.id}
                slot={slot}
                imageUrl={draft.assetUrls[slot.id]}
                disabled={!draft.id || Boolean(busy)}
                busy={busy === `upload-${slot.id}` || busy === `clear-${slot.id}`}
                onUpload={(file) => void uploadSlot(slot.id, file)}
                onClear={() => void clearSlot(slot.id)}
                hasAsset={Boolean(draft.assets[slot.id])}
              />
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-vice-border bg-vice-surface/40 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-vice-text-muted">Preview lock-prompt</p>
          <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-vice-text-muted">{lockPreview}</pre>
        </div>

        {error ? <p className="text-sm text-red-700 dark:text-red-300">{error}</p> : null}
        {notice ? <p className="text-sm text-vice-text-muted">{notice}</p> : null}
        {selected && selectedId !== "new" ? null : selectedId === "new" && characters.length > 0 ? (
          <p className="text-xs text-vice-text-muted">Nieuw personage — vul naam in en klik op aanmaken.</p>
        ) : null}
      </div>
    </div>
  );
}

function AssetSlotCard({
  slot,
  imageUrl,
  disabled,
  busy,
  hasAsset,
  onUpload,
  onClear,
}: {
  slot: (typeof BRAND_CHARACTER_SLOTS)[number];
  imageUrl?: string;
  disabled: boolean;
  busy: boolean;
  hasAsset: boolean;
  onUpload: (file: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col rounded-lg border border-vice-border bg-vice-bg p-3">
      <p className="text-sm font-medium text-vice-text">{slot.label}</p>
      <p className="mt-1 text-xs text-vice-text-muted">{slot.hint}</p>
      <div className="relative mt-3 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md border border-dashed border-vice-border bg-vice-surface/30">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="size-full object-cover" />
        ) : (
          <ImagePlus className="size-8 text-vice-text-muted/50" aria-hidden />
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        disabled={disabled || busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = "";
        }}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
        >
          {hasAsset ? "Vervangen" : "Uploaden"}
        </Button>
        {hasAsset ? (
          <Button type="button" variant="secondary" disabled={disabled || busy} onClick={onClear}>
            Verwijderen
          </Button>
        ) : null}
      </div>
    </div>
  );
}
