"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Copy, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BRAND_FONTS, FONT_WEIGHTS, fontStack, googleFontsCssHref } from "@/lib/brand/fonts";
import {
  COLOR_ROLES,
  TYPE_ROLES,
  TYPE_ROLE_LABELS,
  type BrandColor,
  type BrandPromptTemplate,
  type ClientBrand,
  type TypeRole,
  type TypeStyle,
} from "@/lib/brand/types";
import {
  approveClientBrandAction,
  reopenClientBrandAction,
  saveClientBrandAction,
  startClientBrandAction,
  uploadBrandLogoAction,
} from "@/modules/brand/actions";

type Tab = "overview" | "type" | "color" | "visual" | "prompts";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overzicht" },
  { id: "type", label: "Typografie" },
  { id: "color", label: "Kleuren" },
  { id: "visual", label: "Beeldstijl" },
  { id: "prompts", label: "Prompts" },
];

export function BrandWorkspace({
  tenantId,
  tenantName,
  initial,
}: {
  tenantId: string;
  tenantName: string;
  initial: ClientBrand | null;
}) {
  const [brand, setBrand] = useState<ClientBrand | null>(initial);
  const [tab, setTab] = useState<Tab>("overview");
  const [editing, setEditing] = useState(false);
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState("");

  const locked = !brand || brand.status !== "draft" || !editing;

  const fontHref = useMemo(() => {
    if (!brand) return null;
    const families = TYPE_ROLES.map((role) => brand.typography[role].family).filter(Boolean);
    return googleFontsCssHref(families);
  }, [brand]);

  useEffect(() => {
    if (!fontHref) return;
    const id = "vice-brand-fonts";
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    link.href = fontHref;
  }, [fontHref]);

  async function run(task: () => Promise<{ ok: boolean; error?: string; data?: ClientBrand }>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await task();
      if (!result.ok) {
        setError(result.error || "Mislukt");
        return;
      }
      if (result.data) setBrand(result.data);
      setMessage("Opgeslagen");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Mislukt");
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    await run(() => startClientBrandAction(tenantId));
    setEditing(true);
  }

  async function beginEdit() {
    if (!brand) return;
    if (brand.status === "approved") {
      await run(() => reopenClientBrandAction(tenantId));
    }
    setEditing(true);
  }

  async function savePatch(patch: Record<string, unknown>) {
    if (!brand) return;
    await run(() => saveClientBrandAction(tenantId, brand.updatedAt, patch));
  }

  if (!brand) {
    return (
      <Shell>
        <h1 className="font-display text-4xl text-vice-text">Het merk, helder vastgelegd.</h1>
        <p className="mt-2 max-w-xl text-sm text-vice-text-muted">
          Eén referentie voor tekst, design en visuals. Vul het merk manueel in. Later gebruikt VICE dit om content te genereren.
        </p>
        <Button type="button" className="mt-8" disabled={busy} onClick={() => void start()}>
          Merkdefinitie starten
        </Button>
        {error ? <Alert>{error}</Alert> : null}
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-vice-text-muted">
            {tenantName} / Brand
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Status brand={brand} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!editing ? (
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void beginEdit()}>
              <Pencil className="size-4" aria-hidden />
              Bewerken
            </Button>
          ) : (
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setEditing(false)}>
              Klaar
            </Button>
          )}
          <Button
            type="button"
            disabled={busy || !brand}
            onClick={() => {
              const blob = new Blob([JSON.stringify(exportKit(brand), null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${brand.brandName || "brand"}-kit.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Exporteer brand kit
          </Button>
        </div>
      </div>

      <h1 className="mt-6 font-display text-4xl tracking-tight text-vice-text">Het merk, helder vastgelegd.</h1>
      <p className="mt-2 text-sm text-vice-text-muted">Eén referentie voor tekst, design en visuals.</p>
      {brand.sourceNote ? (
        <p className="mt-2 text-sm text-vice-text-muted">Gebaseerd op {brand.sourceNote}</p>
      ) : null}

      <nav className="mt-8 flex gap-5 border-b border-vice-border text-sm" aria-label="Merksecties">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? "border-b-2 border-vice-gold pb-2 text-vice-text" : "pb-2 text-vice-text-muted"}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="mt-8">
        {tab === "overview" && (
          <Overview
            brand={brand}
            locked={locked}
            viewport={viewport}
            setViewport={setViewport}
            copied={copied}
            setCopied={setCopied}
            onOpen={(next) => setTab(next)}
          />
        )}
        {tab === "type" && (
          <TypeEditor
            brand={brand}
            locked={locked}
            busy={busy}
            viewport={viewport}
            setViewport={setViewport}
            onSave={(typography) => void savePatch({ typography })}
          />
        )}
        {tab === "color" && (
          <ColorEditor brand={brand} locked={locked} busy={busy} onSave={(colors) => void savePatch({ colors })} />
        )}
        {tab === "visual" && (
          <VisualEditor brand={brand} locked={locked} busy={busy} onSave={(visual) => void savePatch({ visual })} />
        )}
        {tab === "prompts" && (
          <PromptsEditor
            brand={brand}
            locked={locked}
            busy={busy}
            onSaveVisual={(visual) => void savePatch({ visual })}
            onSaveTemplates={(promptTemplates) => void savePatch({ promptTemplates })}
          />
        )}
      </div>

      {editing && brand.status === "draft" ? (
        <div className="mt-10 space-y-6 border-t border-vice-border pt-8">
          <BasicsEditor brand={brand} busy={busy} onSave={(patch) => void savePatch(patch)} />
          <LogoEditor
            tenantId={tenantId}
            brand={brand}
            busy={busy}
            onUploaded={(next) => setBrand(next)}
            onError={setError}
          />
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              type="button"
              disabled={busy}
              onClick={() => void run(() => approveClientBrandAction(tenantId, brand.updatedAt)).then(() => setEditing(false))}
            >
              Goedkeuren
            </Button>
          </div>
        </div>
      ) : null}

      {message ? <p className="mt-4 text-sm text-vice-text-muted">{message}</p> : null}
      {error ? <Alert>{error}</Alert> : null}
    </Shell>
  );
}

function Overview({
  brand,
  locked,
  viewport,
  setViewport,
  copied,
  setCopied,
  onOpen,
}: {
  brand: ClientBrand;
  locked: boolean;
  viewport: "desktop" | "mobile";
  setViewport: (value: "desktop" | "mobile") => void;
  copied: string;
  setCopied: (value: string) => void;
  onOpen: (tab: Tab) => void;
}) {
  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-2xl border border-vice-border bg-vice-surface">
        <div className="flex flex-wrap items-end justify-between gap-4 bg-gradient-to-br from-vice-surface-muted to-vice-surface px-6 py-10 md:px-10">
          <p className="max-w-2xl font-display text-3xl text-vice-text md:text-5xl">
            {brand.tagline || "Voeg een tagline toe via Bewerken."}
          </p>
          <button type="button" className="text-sm text-vice-gold" onClick={() => onOpen("visual")}>
            Positionering & tone of voice →
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-vice-border bg-vice-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium">Typografie</h2>
          <ViewportToggle value={viewport} onChange={setViewport} />
        </div>
        <div className="mt-6 space-y-6">
          {TYPE_ROLES.map((role) => (
            <TypePreview
              key={role}
              role={role}
              style={brand.typography[role]}
              viewport={viewport}
              copied={copied}
              setCopied={setCopied}
            />
          ))}
        </div>
        {!locked ? (
          <Button type="button" variant="secondary" className="mt-6" onClick={() => onOpen("type")}>
            Typografie bewerken
          </Button>
        ) : null}
      </section>

      <section className="rounded-2xl border border-vice-border bg-vice-surface p-6">
        <h2 className="text-lg font-medium">Merkkleuren</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {brand.colors.length === 0 ? (
            <p className="text-sm text-vice-text-muted">Nog geen kleuren vastgelegd.</p>
          ) : (
            brand.colors.map((color) => (
              <ColorSwatch key={color.id} color={color} copied={copied} setCopied={setCopied} />
            ))
          )}
        </div>
        {!locked ? (
          <Button type="button" variant="secondary" className="mt-6" onClick={() => onOpen("color")}>
            Kleuren bewerken
          </Button>
        ) : null}
      </section>

      <section className="rounded-2xl border border-vice-border bg-vice-surface p-6">
        <h2 className="text-lg font-medium">Logo & assets</h2>
        <div className="mt-5 flex flex-wrap items-center gap-6">
          <div className="flex min-h-28 min-w-48 items-center justify-center rounded-xl border border-vice-border bg-[#f6f3ee] px-6 py-4">
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logoUrl} alt={brand.logoName || brand.brandName || "Logo"} className="max-h-20 max-w-full" />
            ) : (
              <p className="font-display text-2xl text-[#1c1915]">{brand.brandName || "Logo ontbreekt"}</p>
            )}
          </div>
          {brand.logoUrl ? (
            <div className="flex flex-wrap gap-2">
              <a className="inline-flex h-10 items-center rounded-md border border-vice-border px-4 text-sm" href={brand.logoUrl} download>
                Download bestand
              </a>
            </div>
          ) : (
            <p className="text-sm text-vice-text-muted">Upload een logo via Bewerken.</p>
          )}
        </div>
      </section>

      {(brand.positioning || brand.voice) && (
        <section className="rounded-2xl border border-vice-border bg-vice-surface p-6">
          <h2 className="text-lg font-medium">Positionering & tone of voice</h2>
          {brand.positioning ? <p className="mt-3 whitespace-pre-wrap text-sm">{brand.positioning}</p> : null}
          {brand.voice ? <p className="mt-3 whitespace-pre-wrap text-sm text-vice-text-muted">{brand.voice}</p> : null}
        </section>
      )}
    </div>
  );
}

function TypeEditor({
  brand,
  locked,
  busy,
  viewport,
  setViewport,
  onSave,
}: {
  brand: ClientBrand;
  locked: boolean;
  busy: boolean;
  viewport: "desktop" | "mobile";
  setViewport: (value: "desktop" | "mobile") => void;
  onSave: (typography: ClientBrand["typography"]) => void;
}) {
  const [draft, setDraft] = useState(brand.typography);
  useEffect(() => setDraft(brand.typography), [brand.typography, brand.updatedAt]);

  function update(role: TypeRole, patch: Partial<TypeStyle>) {
    setDraft((current) => ({ ...current, [role]: { ...current[role], ...patch } }));
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-vice-text-muted">Kies fonts uit standaardfonts en Google Fonts. Voorbeelden laden meteen.</p>
        <ViewportToggle value={viewport} onChange={setViewport} />
      </div>
      {TYPE_ROLES.map((role) => {
        const style = draft[role];
        return (
          <article key={role} className="rounded-2xl border border-vice-border bg-vice-surface p-5">
            <p className="text-xs uppercase tracking-wide text-vice-text-muted">{TYPE_ROLE_LABELS[role]}</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <Field label="Font">
                <select
                  className={fieldClass}
                  disabled={locked || busy}
                  value={style.family}
                  onChange={(event) => update(role, { family: event.target.value })}
                >
                  <option value="">Kies een font</option>
                  <optgroup label="Standaard">
                    {BRAND_FONTS.filter((font) => font.source === "system").map((font) => (
                      <option key={font.family} value={font.family}>{font.family}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Google Fonts">
                    {BRAND_FONTS.filter((font) => font.source === "google").map((font) => (
                      <option key={font.family} value={font.family}>{font.family}</option>
                    ))}
                  </optgroup>
                </select>
              </Field>
              <Field label="Gewicht">
                <select className={fieldClass} disabled={locked || busy} value={style.weight} onChange={(event) => update(role, { weight: event.target.value })}>
                  {FONT_WEIGHTS.map((weight) => (
                    <option key={weight.value} value={weight.value}>{weight.label}</option>
                  ))}
                </select>
              </Field>
              <Field label={viewport === "desktop" ? "Grootte (px)" : "Mobiel grootte (px)"}>
                <Input
                  disabled={locked || busy}
                  value={viewport === "desktop" ? style.size : style.mobileSize}
                  onChange={(event) => update(role, viewport === "desktop" ? { size: event.target.value } : { mobileSize: event.target.value })}
                />
              </Field>
              <Field label={viewport === "desktop" ? "Regelafstand (px)" : "Mobiel regelafstand (px)"}>
                <Input
                  disabled={locked || busy}
                  value={viewport === "desktop" ? style.lineHeight : style.mobileLineHeight}
                  onChange={(event) => update(role, viewport === "desktop" ? { lineHeight: event.target.value } : { mobileLineHeight: event.target.value })}
                />
              </Field>
            </div>
            <Field label="Voorbeeldtekst" className="mt-3">
              <Input disabled={locked || busy} value={style.sample} onChange={(event) => update(role, { sample: event.target.value })} />
            </Field>
            <TypePreview role={role} style={style} viewport={viewport} copied="" setCopied={() => undefined} />
          </article>
        );
      })}
      {!locked ? (
        <Button type="button" disabled={busy} onClick={() => onSave(draft)}>Typografie opslaan</Button>
      ) : null}
    </section>
  );
}

function ColorEditor({
  brand,
  locked,
  busy,
  onSave,
}: {
  brand: ClientBrand;
  locked: boolean;
  busy: boolean;
  onSave: (colors: BrandColor[]) => void;
}) {
  const [draft, setDraft] = useState(brand.colors);
  useEffect(() => setDraft(brand.colors), [brand.colors, brand.updatedAt]);

  function update(id: string, patch: Partial<BrandColor>) {
    setDraft((current) => current.map((color) => (color.id === id ? { ...color, ...patch } : color)));
  }

  return (
    <section className="space-y-4">
      {draft.map((color) => (
        <div key={color.id} className="grid gap-3 rounded-2xl border border-vice-border bg-vice-surface p-4 md:grid-cols-[4rem_1fr_1fr_1fr_auto]">
          <span className="h-16 w-16 rounded-lg border border-vice-border" style={{ background: color.hex }} />
          <Field label="Naam">
            <Input disabled={locked || busy} value={color.name} onChange={(event) => update(color.id, { name: event.target.value })} />
          </Field>
          <Field label="HEX">
            <Input disabled={locked || busy} value={color.hex} onChange={(event) => update(color.id, { hex: event.target.value })} />
          </Field>
          <Field label="Rol">
            <select className={fieldClass} disabled={locked || busy} value={color.role} onChange={(event) => update(color.id, { role: event.target.value })}>
              {COLOR_ROLES.map((role) => (
                <option key={role.value} value={role.value}>{role.label}</option>
              ))}
            </select>
          </Field>
          {!locked ? (
            <button type="button" className="self-end pb-2 text-vice-text-muted hover:text-red-700" aria-label="Verwijder kleur" onClick={() => setDraft((current) => current.filter((item) => item.id !== color.id))}>
              <Trash2 className="size-4" />
            </button>
          ) : <span />}
        </div>
      ))}
      {!locked ? (
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => setDraft((current) => [...current, { id: crypto.randomUUID(), name: "", hex: "#000000", role: "primary" }])}
          >
            <Plus className="size-4" /> Kleur toevoegen
          </Button>
          <Button type="button" disabled={busy} onClick={() => onSave(draft)}>Kleuren opslaan</Button>
        </div>
      ) : null}
    </section>
  );
}

function VisualEditor({
  brand,
  locked,
  busy,
  onSave,
}: {
  brand: ClientBrand;
  locked: boolean;
  busy: boolean;
  onSave: (visual: ClientBrand["visual"]) => void;
}) {
  const [draft, setDraft] = useState(brand.visual);
  const [tagInput, setTagInput] = useState("");
  useEffect(() => setDraft(brand.visual), [brand.visual, brand.updatedAt]);

  return (
    <section className="space-y-6 rounded-2xl border border-vice-border bg-vice-surface p-6">
      <Field label="Tags (beeldstijl)">
        <div className="flex flex-wrap gap-2">
          {draft.tags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-2 rounded-full border border-vice-border px-3 py-1 text-sm">
              {tag}
              {!locked ? (
                <button type="button" aria-label={`Verwijder ${tag}`} onClick={() => setDraft((current) => ({ ...current, tags: current.tags.filter((item) => item !== tag) }))}>
                  <X className="size-3" />
                </button>
              ) : null}
            </span>
          ))}
        </div>
        {!locked ? (
          <div className="mt-3 flex gap-2">
            <Input value={tagInput} onChange={(event) => setTagInput(event.target.value)} placeholder="Natuurlijk licht" />
            <Button
              type="button"
              variant="secondary"
              disabled={busy || !tagInput.trim()}
              onClick={() => {
                const next = tagInput.trim();
                if (!next) return;
                setDraft((current) => ({ ...current, tags: [...current.tags, next] }));
                setTagInput("");
              }}
            >
              Toevoegen
            </Button>
          </div>
        ) : null}
      </Field>
      <Field label="Wel">
        <textarea className={`${fieldClass} min-h-24`} disabled={locked || busy} value={draft.do} onChange={(event) => setDraft((current) => ({ ...current, do: event.target.value }))} />
      </Field>
      <Field label="Vermijd">
        <textarea className={`${fieldClass} min-h-24`} disabled={locked || busy} value={draft.avoid} onChange={(event) => setDraft((current) => ({ ...current, avoid: event.target.value }))} />
      </Field>
      <Field label="Merkstijl voor prompts (vast onderdeel)">
        <textarea className={`${fieldClass} min-h-32`} disabled={locked || busy} value={draft.stylePrompt} onChange={(event) => setDraft((current) => ({ ...current, stylePrompt: event.target.value }))} />
      </Field>
      {!locked ? <Button type="button" disabled={busy} onClick={() => onSave(draft)}>Beeldstijl opslaan</Button> : null}
    </section>
  );
}

function PromptsEditor({
  brand,
  locked,
  busy,
  onSaveVisual,
  onSaveTemplates,
}: {
  brand: ClientBrand;
  locked: boolean;
  busy: boolean;
  onSaveVisual: (visual: ClientBrand["visual"]) => void;
  onSaveTemplates: (templates: BrandPromptTemplate[]) => void;
}) {
  const [subject, setSubject] = useState("");
  const [use, setUse] = useState("LinkedIn");
  const [format, setFormat] = useState("4:5");
  const [camera, setCamera] = useState("");
  const [light, setLight] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [stylePrompt, setStylePrompt] = useState(brand.visual.stylePrompt);
  const [copied, setCopied] = useState(false);

  useEffect(() => setStylePrompt(brand.visual.stylePrompt), [brand.visual.stylePrompt, brand.updatedAt]);

  const composed = [
    subject && `Onderwerp: ${subject}.`,
    use && `Gebruik: ${use}.`,
    format && `Formaat: ${format}.`,
    stylePrompt,
    camera && `Camera: ${camera}.`,
    light && `Licht: ${light}.`,
  ].filter(Boolean).join(" ");

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
      <section className="rounded-2xl border border-vice-border bg-vice-surface p-6">
        <h2 className="text-lg font-medium">Zo ziet het merk eruit</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {brand.visual.tags.length === 0 ? (
            <p className="text-sm text-vice-text-muted">Voeg tags toe bij Beeldstijl.</p>
          ) : (
            brand.visual.tags.map((tag) => (
              <span key={tag} className="rounded-full border border-vice-border px-3 py-1 text-xs">{tag}</span>
            ))
          )}
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
            <p className="inline-flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-300"><Check className="size-4" /> Wel</p>
            <p className="mt-2 whitespace-pre-wrap text-vice-text-muted">{brand.visual.do || "Nog niet vastgelegd."}</p>
          </div>
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm">
            <p className="inline-flex items-center gap-2 font-medium text-red-700 dark:text-red-300"><X className="size-4" /> Vermijd</p>
            <p className="mt-2 whitespace-pre-wrap text-vice-text-muted">{brand.visual.avoid || "Nog niet vastgelegd."}</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-vice-border bg-vice-surface p-6">
        <h2 className="text-lg font-medium">Visual prompt</h2>
        <div className="mt-4 grid gap-3">
          <Field label="Onderwerp">
            <Input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Strategische werksessie" />
          </Field>
          <Field label="Gebruik">
            <Input value={use} onChange={(event) => setUse(event.target.value)} />
          </Field>
          <Field label="Formaat">
            <Input value={format} onChange={(event) => setFormat(event.target.value)} />
          </Field>
          <Field label="Merkstijl — vast onderdeel">
            <textarea
              className={`${fieldClass} min-h-28`}
              disabled={locked || busy}
              value={stylePrompt}
              onChange={(event) => setStylePrompt(event.target.value)}
            />
            {!locked ? (
              <Button type="button" variant="secondary" className="mt-2" disabled={busy} onClick={() => onSaveVisual({ ...brand.visual, stylePrompt })}>
                Merkstijl opslaan
              </Button>
            ) : null}
          </Field>
          <Field label="Samengestelde prompt">
            <textarea className={`${fieldClass} min-h-36`} readOnly value={composed} />
          </Field>
          <button type="button" className="text-left text-sm text-vice-text-muted" onClick={() => setAdvanced((value) => !value)}>
            Geavanceerd: camera, uitlichting en referentiebeelden {advanced ? "▴" : "▾"}
          </button>
          {advanced ? (
            <div className="grid gap-3">
              <Field label="Camera"><Input value={camera} onChange={(event) => setCamera(event.target.value)} /></Field>
              <Field label="Licht"><Input value={light} onChange={(event) => setLight(event.target.value)} /></Field>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(composed);
                setCopied(true);
              }}
            >
              <Copy className="size-4" /> {copied ? "Gekopieerd" : "Kopieer volledige prompt"}
            </Button>
            {!locked ? (
              <Button
                type="button"
                disabled={busy || !composed.trim()}
                onClick={() => {
                  const template: BrandPromptTemplate = {
                    id: crypto.randomUUID(),
                    name: "Campagnevisual",
                    subject,
                    use,
                    format,
                    camera,
                    light,
                    body: composed,
                  };
                  onSaveTemplates([template, ...brand.promptTemplates]);
                }}
              >
                Bewaar template
              </Button>
            ) : null}
          </div>
          {brand.promptTemplates.length > 0 ? (
            <div className="space-y-2 border-t border-vice-border pt-4">
              <p className="text-sm font-medium">Bewaarde templates</p>
              {brand.promptTemplates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className="block w-full rounded-lg border border-vice-border px-3 py-2 text-left text-sm hover:border-vice-gold"
                  onClick={() => {
                    setSubject(template.subject);
                    setUse(template.use);
                    setFormat(template.format);
                    setCamera(template.camera);
                    setLight(template.light);
                  }}
                >
                  {template.name}: {template.subject || template.body.slice(0, 60)}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function BasicsEditor({
  brand,
  busy,
  onSave,
}: {
  brand: ClientBrand;
  busy: boolean;
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const [brandName, setBrandName] = useState(brand.brandName);
  const [tagline, setTagline] = useState(brand.tagline);
  const [positioning, setPositioning] = useState(brand.positioning);
  const [voice, setVoice] = useState(brand.voice);
  const [sourceNote, setSourceNote] = useState(brand.sourceNote);
  useEffect(() => {
    setBrandName(brand.brandName);
    setTagline(brand.tagline);
    setPositioning(brand.positioning);
    setVoice(brand.voice);
    setSourceNote(brand.sourceNote);
  }, [brand]);

  return (
    <section className="grid gap-4 rounded-2xl border border-vice-border bg-vice-surface p-6 md:grid-cols-2">
      <Field label="Merknaam"><Input disabled={busy} value={brandName} onChange={(event) => setBrandName(event.target.value)} /></Field>
      <Field label="Bron / brandbook"><Input disabled={busy} value={sourceNote} onChange={(event) => setSourceNote(event.target.value)} placeholder="brandbook" /></Field>
      <Field label="Tagline" className="md:col-span-2"><Input disabled={busy} value={tagline} onChange={(event) => setTagline(event.target.value)} /></Field>
      <Field label="Positionering" className="md:col-span-2">
        <textarea className={`${fieldClass} min-h-24`} disabled={busy} value={positioning} onChange={(event) => setPositioning(event.target.value)} />
      </Field>
      <Field label="Tone of voice" className="md:col-span-2">
        <textarea className={`${fieldClass} min-h-24`} disabled={busy} value={voice} onChange={(event) => setVoice(event.target.value)} />
      </Field>
      <div className="md:col-span-2">
        <Button type="button" disabled={busy} onClick={() => onSave({ brandName, tagline, positioning, voice, sourceNote })}>
          Basisgegevens opslaan
        </Button>
      </div>
    </section>
  );
}

function LogoEditor({
  tenantId,
  brand,
  busy,
  onUploaded,
  onError,
}: {
  tenantId: string;
  brand: ClientBrand;
  busy: boolean;
  onUploaded: (brand: ClientBrand) => void;
  onError: (message: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-vice-border bg-vice-surface p-6">
      <h2 className="text-lg font-medium">Logo</h2>
      <p className="mt-1 text-sm text-vice-text-muted">SVG, PNG, JPEG of WebP tot 8 MB.</p>
      <form
        className="mt-4 flex flex-wrap items-center gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          data.set("expectedUpdatedAt", brand.updatedAt);
          void uploadBrandLogoAction(tenantId, data).then((result) => {
            if (!result.ok || !result.data) onError(result.ok ? "Logo upload mislukt" : result.error);
            else onUploaded(result.data);
          });
        }}
      >
        <input type="file" name="file" accept=".svg,.png,.jpg,.jpeg,.webp,image/*" required disabled={busy} />
        <Button type="submit" variant="secondary" disabled={busy}>Logo uploaden</Button>
      </form>
    </section>
  );
}

function TypePreview({
  role,
  style,
  viewport,
  copied,
  setCopied,
}: {
  role: TypeRole;
  style: TypeStyle;
  viewport: "desktop" | "mobile";
  copied: string;
  setCopied: (value: string) => void;
}) {
  const size = viewport === "desktop" ? style.size : style.mobileSize || style.size;
  const lineHeight = viewport === "desktop" ? style.lineHeight : style.mobileLineHeight || style.lineHeight;
  const weightLabel = FONT_WEIGHTS.find((item) => item.value === style.weight)?.label ?? style.weight;
  const css = `font-family: ${style.family || "inherit"}; font-weight: ${style.weight}; font-size: ${size}px; line-height: ${lineHeight}px;`;
  return (
    <div className="grid gap-3 border-t border-vice-border pt-5 md:grid-cols-[1fr_12rem]">
      <div>
        <p className="text-xs text-vice-text-muted">
          {TYPE_ROLE_LABELS[role]} · {style.family || "Font niet gekozen"} · {weightLabel}
          {size ? ` · ${size} / ${lineHeight || "—"} px` : ""}
        </p>
        <p
          className="mt-2 text-vice-text"
          style={{
            fontFamily: fontStack(style.family),
            fontWeight: Number(style.weight) || 400,
            fontSize: size ? `${size}px` : undefined,
            lineHeight: lineHeight ? `${lineHeight}px` : undefined,
          }}
        >
          {style.sample || "Voorbeeldzin nog niet vastgelegd."}
        </p>
      </div>
      <div className="text-sm text-vice-text-muted">
        <p style={{ fontFamily: fontStack(style.family) }}>Aa {style.family || "—"}</p>
        <button
          type="button"
          className="mt-2 inline-flex items-center gap-1 text-xs text-vice-gold"
          onClick={async () => {
            await navigator.clipboard.writeText(css);
            setCopied(role);
          }}
        >
          <Copy className="size-3" /> {copied === role ? "Gekopieerd" : "Kopieer CSS"}
        </button>
      </div>
    </div>
  );
}

function ColorSwatch({
  color,
  copied,
  setCopied,
}: {
  color: BrandColor;
  copied: string;
  setCopied: (value: string) => void;
}) {
  const roleLabel = COLOR_ROLES.find((item) => item.value === color.role)?.label ?? color.role;
  return (
    <div className="rounded-xl border border-vice-border p-3">
      <div className="h-16 rounded-lg border border-vice-border" style={{ background: color.hex }} />
      <div className="mt-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{color.name || "Naamloos"}</p>
          <p className="text-xs text-vice-text-muted">{color.hex}</p>
          <p className="text-xs text-vice-text-muted">{roleLabel}</p>
        </div>
        <button
          type="button"
          aria-label="Kopieer hex"
          onClick={async () => {
            await navigator.clipboard.writeText(color.hex);
            setCopied(color.id);
          }}
        >
          {copied === color.id ? <Check className="size-4 text-vice-gold" /> : <Copy className="size-4 text-vice-text-muted" />}
        </button>
      </div>
    </div>
  );
}

function Status({ brand }: { brand: ClientBrand }) {
  const approved = brand.status === "approved";
  return (
    <span className="inline-flex items-center gap-2 text-sm text-vice-text-muted">
      <span className={`size-2 rounded-full ${approved ? "bg-emerald-500" : "bg-vice-gold"}`} />
      {approved ? "Goedgekeurd" : "Concept"} · v{brand.versionNumber}
    </span>
  );
}

function ViewportToggle({ value, onChange }: { value: "desktop" | "mobile"; onChange: (value: "desktop" | "mobile") => void }) {
  return (
    <div className="inline-flex rounded-full border border-vice-border p-1 text-xs">
      <button type="button" className={`rounded-full px-3 py-1 ${value === "desktop" ? "bg-vice-surface-muted text-vice-text" : "text-vice-text-muted"}`} onClick={() => onChange("desktop")}>Desktop</button>
      <button type="button" className={`rounded-full px-3 py-1 ${value === "mobile" ? "bg-vice-surface-muted text-vice-text" : "text-vice-text-muted"}`} onClick={() => onChange("mobile")}>Mobiel</button>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-6xl px-6 py-8 md:px-10">{children}</div>;
}

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block text-xs text-vice-text-muted">{label}</Label>
      {children}
    </div>
  );
}

function Alert({ children }: { children: ReactNode }) {
  return <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300" role="alert">{children}</p>;
}

function exportKit(brand: ClientBrand) {
  return {
    brandName: brand.brandName,
    version: brand.versionNumber,
    status: brand.status,
    tagline: brand.tagline,
    positioning: brand.positioning,
    voice: brand.voice,
    typography: brand.typography,
    colors: brand.colors,
    visual: brand.visual,
    promptTemplates: brand.promptTemplates,
    logoName: brand.logoName,
  };
}

const fieldClass =
  "w-full rounded-md border border-vice-border bg-vice-surface px-3 py-2 text-sm text-vice-text disabled:opacity-60";
