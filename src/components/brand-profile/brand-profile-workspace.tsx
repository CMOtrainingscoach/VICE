"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { contrastRatio } from "@/lib/brand-profile/color";
import { composeBrandPrompt, type PromptDraft } from "@/lib/brand-profile/prompt";
import {
  BRAND_SECTION_LABELS,
  BRAND_SECTIONS,
  COLOR_ROLE_LABELS,
  COLOR_ROLES,
  LOGO_KIND_LABELS,
  LOGO_KINDS,
  ORIGIN_LABELS,
  REFERENCE_STATUS_LABELS,
  REFERENCE_STATUSES,
  type BrandProfileView,
  type BrandSection,
  type BrandVersion,
  type ColorRole,
} from "@/lib/brand-profile/types";
import { goldButtonClass } from "@/components/stp/stp-ui";
import {
  approveBrandProfileAction,
  archiveBrandItemAction,
  compareBrandSourceAction,
  forkBrandProfileAction,
  loadBrandSourceAction,
  publishBrandProfileAction,
  resolveBrandReviewAction,
  saveBrandColorAction,
  saveBrandProfileAction,
  saveBrandPromptAction,
  saveBrandStyleAction,
  startBrandProfileAction,
  uploadBrandFileAction,
} from "@/modules/brand-profile/actions";

const emptyDraft: PromptDraft = { subject: "", use: "", format: "", message: "", composition: "", camera: "", light: "", textSpace: false, exclusions: "" };

export function BrandProfileWorkspace({ tenantId, data }: { tenantId: string; data: BrandProfileView }) {
  const router = useRouter();
  const [section, setSection] = useState<BrandSection>("overview");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [sourceText, setSourceText] = useState<string | null>(null);
  const [copied, setCopied] = useState("");

  async function run(task: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError("");
    setMessage("");
    const result = await task();
    setBusy(false);
    if (!result.ok) setError(result.error ?? "Mislukt");
    else {
      setMessage("Opgeslagen");
      router.refresh();
    }
  }

  if (data.access === "published" && data.empty) {
    return <Shell><p className="text-sm text-vice-text-muted">Er is nog geen gepubliceerde merkdefinitie.</p></Shell>;
  }
  if (data.access === "published") {
    return <ProfileBody tenantId={tenantId} data={data} readOnly section={section} setSection={setSection} editing={false} setEditing={() => undefined} message="" error="" busy={false} sourceText={null} setSourceText={() => undefined} copied={copied} setCopied={setCopied} run={run} />;
  }
  if (!data.version) {
    return (
      <Shell>
        <h1 className="font-display text-4xl text-vice-text">Het merk, helder vastgelegd.</h1>
        <p className="mt-2 max-w-xl text-sm text-vice-text-muted">Een referentie voor tekst, design en visuals. Er is nog geen merkdefinitie.</p>
        {data.mode === "choose" ? (
          <div className="mt-8 space-y-3">
            <p className="text-sm">Meerdere auditdocumenten komen in aanmerking. Kies er één. Die koppeling blijft bewaard.</p>
            {data.documents.map((document) => (
              <button key={document.id} type="button" className="block w-full rounded-xl border border-vice-border px-4 py-3 text-left text-sm hover:border-vice-gold" disabled={busy} onClick={() => run(() => startBrandProfileAction(tenantId, document.id))}>
                {document.status === "final" ? "Goedgekeurde audit" : "Conceptaudit"} · {new Date(document.savedAt).toLocaleString("nl-BE")}
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-6 text-sm text-vice-text-muted">Er is nog geen contextbestand van deze audit. Er wordt niets buiten VICE opgezocht.</p>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <Button type="button" className={goldButtonClass} disabled={busy} onClick={() => run(() => startBrandProfileAction(tenantId))}>Manueel beginnen</Button>
        </div>
        {error && <p className="mt-4 text-sm text-red-700 dark:text-red-300">{error}</p>}
      </Shell>
    );
  }

  return <ProfileBody tenantId={tenantId} data={data} readOnly={false} section={section} setSection={setSection} editing={editing} setEditing={setEditing} message={message} error={error} busy={busy} sourceText={sourceText} setSourceText={setSourceText} copied={copied} setCopied={setCopied} run={run} />;
}

function ProfileBody({
  tenantId, data, readOnly, section, setSection, editing, setEditing, message, error, busy, sourceText, setSourceText, copied, setCopied, run,
}: {
  tenantId: string;
  data: Exclude<BrandProfileView, { empty: true }>;
  readOnly: boolean;
  section: BrandSection;
  setSection: (section: BrandSection) => void;
  editing: boolean;
  setEditing: (value: boolean) => void;
  message: string;
  error: string;
  busy: boolean;
  sourceText: string | null;
  setSourceText: (value: string | null) => void;
  copied: string;
  setCopied: (value: string) => void;
  run: (task: () => Promise<{ ok: boolean; error?: string }>) => Promise<void>;
}) {
  const version = data.version;
  if (!version) return null;
  const locked = readOnly || version.status !== "draft";
  const missing = version.sourceDocumentId ? "Niet vastgelegd in de audit" : "Nog niet vastgelegd";
  const fontFaces = data.fonts.filter((font) => font.url).map((font) => `@font-face{font-family:"ViceBrand-${font.id}";src:url("${font.url}") format("${font.path.endsWith(".woff2") ? "woff2" : "woff"}");font-display:swap;}`).join("");

  async function copy(value: string, key: string) {
    await navigator.clipboard.writeText(value);
    setCopied(key);
  }

  return (
    <Shell>
      <style>{fontFaces}</style>
      <p className="text-sm text-vice-text-muted">{data.tenantName} / Brand</p>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl tracking-tight text-vice-text">Het merk, helder vastgelegd.</h1>
          <p className="mt-2 text-sm text-vice-text-muted">Een referentie voor tekst, design en visuals.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Status version={version} />
          {!readOnly && <Button type="button" variant="secondary" onClick={() => setEditing(!editing)}>{editing ? "Klaar" : "Bewerken"}</Button>}
          <a className={`${goldButtonClass} inline-flex h-10 items-center rounded-md px-4 text-sm font-medium`} href={`/api/brand-profile/${tenantId}/export`}>Exporteer brand kit</a>
        </div>
      </div>
      <p className="mt-4 text-xs text-vice-text-muted">
        Versie {version.versionNumber}
        {version.updatedAt ? ` · laatst ${new Date(version.updatedAt).toLocaleString("nl-BE")}` : ""}
        {version.updatedByName ? ` · ${version.updatedByName}` : ""}
        {message ? ` · ${message}` : ""}
      </p>
      {version.sourceDocumentId && (
        <p className="mt-2 text-sm">
          {version.sourceStatus === "draft" ? "Gebaseerd op conceptaudit. " : "Vooringevuld vanuit strategische audit. "}
          <button type="button" className="text-vice-gold" onClick={async () => {
            const result = await loadBrandSourceAction(tenantId, version.sourceDocumentId ?? "");
            if (result.ok && result.data) setSourceText(result.data.markdown);
            else setSourceText(result.ok ? "" : result.error);
          }}>Bekijk brondocument</button>
        </p>
      )}
      {"newerSource" in data && data.newerSource && !readOnly && (
        <div className="mt-4 rounded-xl border border-vice-border bg-vice-surface p-4 text-sm">
          <p>Nieuwe auditversie beschikbaar. Handmatige wijzigingen blijven staan tot je een bronwaarde expliciet overneemt.</p>
          <Button type="button" variant="secondary" className="mt-3" disabled={busy} onClick={() => run(() => compareBrandSourceAction(tenantId, version.id, version.updatedAt, data.newerSource?.id ?? ""))}>Vergelijk wijzigingen</Button>
        </div>
      )}
      {sourceText !== null && (
        <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-vice-border bg-vice-surface p-4 text-xs">{sourceText}</pre>
      )}
      <nav className="mt-8 flex gap-5 border-b border-vice-border text-sm" aria-label="Merksecties">
        {BRAND_SECTIONS.map((item) => (
          <button key={item} type="button" className={section === item ? "border-b-2 border-vice-gold pb-2 text-vice-text" : "pb-2 text-vice-text-muted"} onClick={() => setSection(item)}>{BRAND_SECTION_LABELS[item]}</button>
        ))}
      </nav>
      <div className="mt-8">
        {section === "overview" && <Overview data={data} missing={missing} />}
        {section === "type" && <TypeSection tenantId={tenantId} data={data} missing={missing} copied={copied} copy={copy} locked={locked} busy={busy} run={run} />}
        {section === "color" && <ColorSection tenantId={tenantId} data={data} copied={copied} copy={copy} locked={locked} busy={busy} run={run} />}
        {section === "logo" && <LogoSection tenantId={tenantId} data={data} locked={locked} busy={busy} run={run} />}
        {section === "voice" && <VoiceSection data={data} missing={missing} />}
        {section === "visual" && <VisualSection data={data} missing={missing} />}
        {section === "prompts" && <PromptSection tenantId={tenantId} data={data} copied={copied} copy={copy} locked={locked} busy={busy} run={run} />}
      </div>
      {"reviews" in data && data.reviews.length > 0 && !readOnly && (
        <section className="mt-10">
          <h2 className="text-lg font-medium">Ter beoordeling</h2>
          <p className="mt-1 text-sm text-vice-text-muted">Observaties en aanbevelingen zijn geen merkrichtlijn tot je ze overneemt.</p>
          <div className="mt-4 space-y-3">
            {data.reviews.map((item) => (
              <article key={item.id} className="rounded-xl border border-vice-border p-4">
                <p className="text-xs text-vice-text-muted">{ORIGIN_LABELS[item.origin]} · {item.sectionPath}</p>
                <h3 className="mt-1 text-sm font-medium">{item.label}</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm">{item.passage}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.proposal && <Button type="button" className={goldButtonClass} disabled={busy || locked} onClick={() => run(() => resolveBrandReviewAction(tenantId, version.id, version.updatedAt, item.id, "accept", ""))}>Neem over als richtlijn</Button>}
                  <Button type="button" variant="secondary" disabled={busy || locked} onClick={() => run(() => resolveBrandReviewAction(tenantId, version.id, version.updatedAt, item.id, "keep", ""))}>Huidige waarde behouden</Button>
                  <Button type="button" variant="ghost" disabled={busy || locked} onClick={() => run(() => resolveBrandReviewAction(tenantId, version.id, version.updatedAt, item.id, "dismiss", ""))}>Niet overnemen</Button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      {editing && !readOnly && <Editor tenantId={tenantId} version={version} locked={locked} busy={busy} run={run} />}
      {!readOnly && (
        <div className="mt-10 flex flex-wrap justify-end gap-3">
          {version.status !== "draft" && <Button type="button" variant="secondary" disabled={busy} onClick={() => run(() => forkBrandProfileAction(tenantId, version.id))}>Nieuwe conceptversie</Button>}
          {version.status === "draft" && <Button type="button" variant="secondary" disabled={busy} onClick={() => run(() => approveBrandProfileAction(tenantId, version.id, version.updatedAt))}>Goedkeuren</Button>}
          {version.status === "approved" && <Button type="button" className={goldButtonClass} disabled={busy} onClick={() => run(() => publishBrandProfileAction(tenantId, version.id))}>Publiceren</Button>}
        </div>
      )}
      {error && <p className="mt-4 text-sm text-red-700 dark:text-red-300" role="alert">{error}</p>}
    </Shell>
  );
}

function Overview({ data, missing }: { data: Exclude<BrandProfileView, { empty: true }>; missing: string }) {
  if (!data.version) return null;
  const version = data.version;
  const logo = data.assets.find((asset) => asset.url && asset.kind !== "reference");
  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div>
        <p className="font-display text-3xl text-vice-text">{version.brandName || missing}</p>
        <p className="mt-4 max-w-xl text-lg text-vice-text">{version.essence || missing}</p>
        <dl className="mt-8 grid gap-4 text-sm sm:grid-cols-2">
          <Fact label="Positionering" value={version.positioning} missing={missing} />
          <Fact label="Kernbelofte" value={version.promise} missing={missing} />
          <Fact label="Doelgroep" value={version.audience} missing={missing} />
          <Fact label="Merkwaarden" value={version.valuesText} missing={missing} />
          <Fact label="Tone of voice" value={version.voice.summary} missing={missing} />
          <Fact label="Beeldstijl" value={version.visual.summary || version.visual.mood} missing={missing} />
        </dl>
      </div>
      <div className="space-y-4">
        <div className="rounded-2xl border border-vice-border p-4" style={{ background: "#f6f3ee" }}>
          <p className="text-xs text-vice-text-muted">Logo</p>
          {logo?.url ? <img src={logo.url} alt={logo.name || "Logo"} className="mt-3 max-h-24" /> : <p className="mt-3 text-sm" style={{ color: "#5c564c" }}>{logo?.missingNote || missing}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {data.colors.length === 0 && <p className="text-sm text-vice-text-muted">{missing}</p>}
          {data.colors.map((color) => <span key={color.id} className="h-10 w-10 rounded-md border border-vice-border" style={{ background: color.hex }} title={`${color.name} ${color.hex}`} />)}
        </div>
      </div>
    </div>
  );
}

function TypeSection({ tenantId, data, missing, copied, copy, locked, busy, run }: SectionProps) {
  if (!data.version) return null;
  const version = data.version;
  return (
    <div className="space-y-6">
      <p className="text-sm text-vice-text-muted">VICE licht of donker verandert deze maten en fonts niet. Een kop in het auditdocument is geen lettertype.</p>
      {data.styles.length === 0 && <p className="text-sm text-vice-text-muted">{missing}</p>}
      {data.styles.map((style) => {
        const font = data.fonts.find((item) => item.name && style.family && item.name.toLowerCase() === style.family.toLowerCase() && item.url);
        const family = font ? `"ViceBrand-${font.id}", ${style.fallback || "serif"}` : (style.fallback || "serif");
        const css = [`font-family: ${style.family || "inherit"};`, style.weight ? `font-weight: ${style.weight};` : "", style.size && style.unit ? `font-size: ${style.size}${style.unit};` : ""].filter(Boolean).join(" ");
        return (
          <article key={style.id} className="rounded-2xl border border-vice-border p-5" style={{ background: "#f6f3ee", color: "#1c1915" }}>
            <p className="text-xs uppercase tracking-wide" style={{ color: "#6d675c" }}>{style.role || "Tekststijl"} · {style.family || "Font niet vastgelegd"}</p>
            {!font && style.family && <p className="mt-1 text-xs" style={{ color: "#8a5a12" }}>Merkfont niet geladen. De fallback is niet het merkfont.</p>}
            <p className="mt-3" style={{ fontFamily: family, fontWeight: style.weight || undefined, fontStyle: style.italic ? "italic" : undefined, fontSize: style.size && style.unit ? `${style.size}${style.unit}` : undefined, lineHeight: style.lineHeight || undefined, letterSpacing: style.letterSpacing || undefined }}>{style.sample || "Voorbeeldzin nog niet vastgelegd."}</p>
            <p className="mt-3 text-xs" style={{ color: "#6d675c" }}>{style.mobileSize ? `Mobiel ${style.mobileSize}${style.mobileUnit}` : "Mobiel gebruikt de basiswaarde."}</p>
            <div className="mt-3 flex gap-3 text-xs">
              <button type="button" onClick={() => copy(style.family, style.id)}>{copied === style.id ? "Gekopieerd" : "Kopieer fontnaam"}</button>
              <button type="button" onClick={() => copy(css, `${style.id}-css`)}>{copied === `${style.id}-css` ? "Gekopieerd" : "Kopieer CSS"}</button>
              {!locked && <button type="button" disabled={busy} onClick={() => run(() => archiveBrandItemAction(tenantId, version.id, version.updatedAt, "style", style.id))}>Archiveer</button>}
            </div>
          </article>
        );
      })}
      {!locked && <StyleForm versionId={version.id} expected={version.updatedAt} tenantId={tenantId} busy={busy} run={run} />}
      <FontForm tenantId={tenantId} versionId={version.id} expected={version.updatedAt} locked={locked} />
    </div>
  );
}

function ColorSection({ tenantId, data, copied, copy, locked, busy, run }: SectionProps) {
  const [foreground, setForeground] = useState(data.colors[0]?.hex ?? "");
  const [background, setBackground] = useState(data.colors[1]?.hex ?? "");
  const ratio = contrastRatio(foreground, background);
  if (!data.version) return null;
  const version = data.version;
  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {data.colors.map((color) => (
          <article key={color.id} className="overflow-hidden rounded-2xl border border-vice-border">
            <div className="h-28" style={{ background: color.hex }} />
            <div className="p-3 text-sm">
              <p className="font-medium">{color.name || "Kleur"}</p>
              <p>{COLOR_ROLE_LABELS[color.role]}</p>
              <p>{color.hex}</p>
              <p>{color.rgb}</p>
              {color.cmyk && <p>CMYK {color.cmyk}</p>}
              {color.pantone && <p>Pantone {color.pantone}</p>}
              {color.note && <p className="text-vice-text-muted">{color.note}</p>}
              <button type="button" className="mt-2 text-xs text-vice-gold" onClick={() => copy(color.hex, color.id)}>{copied === color.id ? "Gekopieerd" : "Kopieer kleurcode"}</button>
              {!locked && <button type="button" className="mt-2 block text-xs" disabled={busy} onClick={() => run(() => archiveBrandItemAction(tenantId, version.id, version.updatedAt, "color", color.id))}>Archiveer</button>}
            </div>
          </article>
        ))}
      </div>
      {data.colors.length > 1 && (
        <div className="mt-6 text-sm">
          <p>Contrast van een gekozen paar. Dit zegt niets over het hele palet.</p>
          <div className="mt-2 flex flex-wrap gap-3">
            <select className="rounded-md border border-vice-border bg-vice-bg px-2 py-1" value={foreground} onChange={(event) => setForeground(event.target.value)}>{data.colors.map((color) => <option key={color.id} value={color.hex}>{color.name} {color.hex}</option>)}</select>
            <select className="rounded-md border border-vice-border bg-vice-bg px-2 py-1" value={background} onChange={(event) => setBackground(event.target.value)}>{data.colors.map((color) => <option key={color.id} value={color.hex}>{color.name} {color.hex}</option>)}</select>
            <span>{ratio ? `${ratio.toFixed(2)}:1` : "Kies twee geldige kleuren."}</span>
          </div>
        </div>
      )}
      {!locked && <ColorForm tenantId={tenantId} versionId={version.id} expected={version.updatedAt} busy={busy} run={run} />}
    </div>
  );
}

function LogoSection({ tenantId, data, locked, busy, run }: { tenantId: string; data: Exclude<BrandProfileView, { empty: true }>; locked: boolean; busy: boolean; run: SectionProps["run"] }) {
  if (!data.version) return null;
  const version = data.version;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {data.assets.map((asset) => (
        <article key={asset.id} className="rounded-2xl border border-vice-border p-4" style={{ background: asset.kind === "light" ? "#f6f3ee" : asset.kind === "dark" ? "#1c1915" : undefined, color: asset.kind === "dark" ? "#f6f3ee" : undefined }}>
          <p className="text-xs">{LOGO_KIND_LABELS[asset.kind]} · {REFERENCE_STATUS_LABELS[asset.referenceStatus]}</p>
          {asset.url && asset.format !== "svg" && <img src={asset.url} alt={asset.name || "Merkasset"} className="mt-3 max-h-28" />}
          {asset.url && asset.format === "svg" && <img src={asset.url} alt={asset.name || "Merkasset"} className="mt-3 max-h-28" />}
          {!asset.url && <p className="mt-3 text-sm">{asset.missingNote || "Bestand ontbreekt. Upload of koppel het."}</p>}
          <p className="mt-2 text-sm">{asset.name} {asset.format}</p>
          {asset.usage && <p className="text-xs">{asset.usage}</p>}
          {asset.url && <a className="mt-2 inline-block text-xs text-vice-gold" href={asset.url}>Download</a>}
          {!locked && <button type="button" className="mt-2 block text-xs" disabled={busy} onClick={() => run(() => archiveBrandItemAction(tenantId, version.id, version.updatedAt, "asset", asset.id))}>Archiveer</button>}
        </article>
      ))}
      {!locked && <FileForm tenantId={tenantId} versionId={version.id} expected={version.updatedAt} kind="asset" />}
    </div>
  );
}

function VoiceSection({ data, missing }: { data: Exclude<BrandProfileView, { empty: true }>; missing: string }) {
  if (!data.version) return null;
  const voice = data.version.voice;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Fact label="Merkstem" value={voice.summary} missing={missing} />
      <Fact label="Principes" value={voice.principles} missing={missing} />
      <Fact label="Aanspreekvorm" value={voice.address} missing={missing} />
      <Fact label="Taal" value={voice.language} missing={missing} />
      <div className="rounded-2xl border border-emerald-900/20 p-4">
        <p className="text-xs">Wel</p>
        {voice.preferred.length === 0 ? <p className="mt-2 text-sm text-vice-text-muted">{missing}</p> : voice.preferred.map((word) => <p key={word} className="mt-1 text-sm">{word}</p>)}
      </div>
      <div className="rounded-2xl border border-red-900/20 p-4">
        <p className="text-xs">Vermijd</p>
        {voice.avoid.length === 0 ? <p className="mt-2 text-sm text-vice-text-muted">{missing}</p> : voice.avoid.map((word) => <p key={word} className="mt-1 text-sm">{word}</p>)}
      </div>
    </div>
  );
}

function VisualSection({ data, missing }: { data: Exclude<BrandProfileView, { empty: true }>; missing: string }) {
  if (!data.version) return null;
  const visual = data.version.visual;
  const fields: [string, string][] = [
    ["Medium", visual.medium], ["Onderwerpen", visual.subjects], ["Compositie", visual.composition], ["Licht", visual.light],
    ["Kleurgebruik", visual.colorUse], ["Materialen", visual.materials], ["Texturen", visual.textures], ["Sfeer", visual.mood],
    ["Achtergrond", visual.backgrounds], ["Camera", visual.camera], ["Ruimte voor tekst", visual.textSpace], ["Samenvatting", visual.summary],
  ];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {fields.map(([label, value]) => <Fact key={label} label={label} value={value} missing={missing} />)}
      <div className="md:col-span-2 grid gap-3 sm:grid-cols-2">
        {data.assets.filter((asset) => asset.kind === "reference").map((asset) => (
          <article key={asset.id} className="rounded-2xl border border-vice-border p-3">
            {asset.url && <img src={asset.url} alt={asset.name || "Referentie"} className="max-h-48 w-full object-cover" />}
            <p className="mt-2 text-sm">{asset.name || missing}</p>
            <p className="text-xs text-vice-text-muted">{REFERENCE_STATUS_LABELS[asset.referenceStatus]}. Een inspiratiebeeld is geen vrij merkasset.</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function PromptSection({ tenantId, data, copied, copy, locked, busy, run }: SectionProps) {
  const [draft, setDraft] = useState<PromptDraft>(emptyDraft);
  const [advanced, setAdvanced] = useState(false);
  if (!data.version) return null;
  const version = data.version;
  const composed = composeBrandPrompt(draft, version.visual, version.voice, data.colors);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <div>
        <h2 className="text-lg font-medium">Templates</h2>
        {data.prompts.length === 0 && <p className="mt-2 text-sm text-vice-text-muted">Er is nog geen prompt uit de audit of uit de merkrichtlijnen.</p>}
        {data.prompts.map((prompt) => (
          <article key={prompt.id} className="mt-3 rounded-xl border border-vice-border p-4 text-sm">
            <p className="font-medium">{prompt.name}</p>
            <p className="text-xs text-vice-text-muted">{prompt.composed ? "Samengesteld uit merkrichtlijnen" : "Overgenomen uit de audit"} · versie {version.versionNumber}</p>
            <p className="mt-2 whitespace-pre-wrap">{prompt.body}</p>
            <button type="button" className="mt-2 text-xs text-vice-gold" onClick={() => copy(prompt.body, prompt.id)}>{copied === prompt.id ? "Gekopieerd" : "Kopieer volledige prompt"}</button>
          </article>
        ))}
      </div>
      <div className="rounded-2xl border border-vice-border p-4">
        <h2 className="text-lg font-medium">Promptbouwer</h2>
        <p className="mt-1 text-xs text-vice-text-muted">{composed.label}. Een opdracht wijzigt de merkstijl niet. Tekst kopiëren stuurt geen beelden mee.</p>
        <div className="mt-3 grid gap-3">
          <Field label="Onderwerp" value={draft.subject} onChange={(value) => setDraft({ ...draft, subject: value })} />
          <Field label="Toepassing" value={draft.use} onChange={(value) => setDraft({ ...draft, use: value })} />
          <Field label="Formaat" value={draft.format} onChange={(value) => setDraft({ ...draft, format: value })} />
          <Field label="Boodschap" value={draft.message} onChange={(value) => setDraft({ ...draft, message: value })} />
          <button type="button" className="text-left text-xs text-vice-gold" onClick={() => setAdvanced(!advanced)}>{advanced ? "Verberg geavanceerd" : "Compositie, camera, licht"}</button>
          {advanced && (
            <>
              <Field label="Compositie" value={draft.composition} onChange={(value) => setDraft({ ...draft, composition: value })} />
              <Field label="Camera" value={draft.camera} onChange={(value) => setDraft({ ...draft, camera: value })} />
              <Field label="Licht" value={draft.light} onChange={(value) => setDraft({ ...draft, light: value })} />
              <label className="text-sm"><input type="checkbox" checked={draft.textSpace} onChange={(event) => setDraft({ ...draft, textSpace: event.target.checked })} /> Vrije ruimte voor tekst</label>
            </>
          )}
        </div>
        {composed.missing.length > 0 && <p className="mt-3 text-xs text-vice-text-muted">Nog nodig: {composed.missing.join(", ")}. Ontbrekende stijl wordt niet verzonnen.</p>}
        <h3 className="mt-4 text-sm font-medium">Jouw opdracht</h3>
        <p className="mt-1 whitespace-pre-wrap text-sm">{composed.assignment || "Nog geen opdracht."}</p>
        <h3 className="mt-4 text-sm font-medium">Vaste merkstijl</h3>
        <p className="mt-1 whitespace-pre-wrap text-sm">{composed.style || "Geen vastgelegde beeldstijl."}</p>
        <h3 className="mt-4 text-sm font-medium">Volledige prompt</h3>
        <p className="mt-1 whitespace-pre-wrap text-sm">{composed.full}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" className={goldButtonClass} onClick={() => copy(composed.full, "builder")}>{copied === "builder" ? "Gekopieerd" : "Kopieer volledige prompt"}</Button>
          {!locked && <Button type="button" variant="secondary" disabled={busy || !composed.full} onClick={() => run(() => saveBrandPromptAction(tenantId, version.id, version.updatedAt, { name: draft.use || "Template", purpose: draft.use, situation: draft.subject, body: composed.full, exclusions: draft.exclusions, composed: true }))}>Bewaar als template</Button>}
        </div>
      </div>
    </div>
  );
}

function Editor({ tenantId, version, locked, busy, run }: { tenantId: string; version: BrandVersion; locked: boolean; busy: boolean; run: SectionProps["run"] }) {
  const [form, setForm] = useState({
    brandName: version.brandName,
    essence: version.essence,
    positioning: version.positioning,
    promise: version.promise,
    audience: version.audience,
    valuesText: version.valuesText,
    voiceSummary: version.voice.summary,
    principles: version.voice.principles,
    address: version.voice.address,
    language: version.voice.language,
    formality: version.voice.formality,
    preferred: version.voice.preferred.join(", "),
    avoid: version.voice.avoid.join(", "),
    visualSummary: version.visual.summary,
    medium: version.visual.medium,
    subjects: version.visual.subjects,
    composition: version.visual.composition,
    light: version.visual.light,
    colorUse: version.visual.colorUse,
    materials: version.visual.materials,
    textures: version.visual.textures,
    mood: version.visual.mood,
    backgrounds: version.visual.backgrounds,
    camera: version.visual.camera,
    textSpace: version.visual.textSpace,
    website: version.voice.channels.website,
    social: version.voice.channels.social,
    email: version.voice.channels.email,
    sales: version.voice.channels.sales,
    service: version.voice.channels.service,
  });
  const fields = [
    ["brandName", "Merknaam"],
    ["essence", "Essentie"],
    ["positioning", "Positionering"],
    ["promise", "Kernbelofte"],
    ["audience", "Doelgroep"],
    ["valuesText", "Merkwaarden"],
    ["voiceSummary", "Merkstem"],
    ["principles", "Schrijfprincipes"],
    ["address", "Aanspreekvorm"],
    ["language", "Taal"],
    ["formality", "Formaliteit"],
    ["preferred", "Gewenste woorden, gescheiden door komma's"],
    ["avoid", "Te vermijden woorden, gescheiden door komma's"],
    ["visualSummary", "Beeldstijl"],
    ["medium", "Fotografie of illustratie"],
    ["subjects", "Onderwerpen"],
    ["composition", "Compositie"],
    ["light", "Licht"],
    ["colorUse", "Kleurgebruik"],
    ["materials", "Materialen"],
    ["textures", "Texturen"],
    ["mood", "Sfeer"],
    ["backgrounds", "Achtergronden"],
    ["camera", "Camera"],
    ["textSpace", "Ruimte voor tekst"],
    ["website", "Stem op de website"],
    ["social", "Stem op social"],
    ["email", "Stem in e-mail"],
    ["sales", "Stem in sales"],
    ["service", "Stem in klantenservice"],
  ] as const;
  return (
    <form className="mt-8 grid gap-3 rounded-2xl border border-vice-border p-4 md:grid-cols-2" onSubmit={(event) => {
      event.preventDefault();
      const list = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);
      void run(() => saveBrandProfileAction(tenantId, version.id, version.updatedAt, {
        brandName: form.brandName,
        essence: form.essence,
        positioning: form.positioning,
        promise: form.promise,
        audience: form.audience,
        valuesText: form.valuesText,
        voice: {
          ...version.voice,
          summary: form.voiceSummary,
          principles: form.principles,
          address: form.address,
          language: form.language,
          formality: form.formality,
          preferred: list(form.preferred),
          avoid: list(form.avoid),
          channels: { website: form.website, social: form.social, email: form.email, sales: form.sales, service: form.service },
        },
        visual: {
          ...version.visual,
          summary: form.visualSummary,
          medium: form.medium,
          subjects: form.subjects,
          composition: form.composition,
          light: form.light,
          colorUse: form.colorUse,
          materials: form.materials,
          textures: form.textures,
          mood: form.mood,
          backgrounds: form.backgrounds,
          camera: form.camera,
          textSpace: form.textSpace,
        },
      }));
    }}>
      <h2 className="md:col-span-2 text-sm font-medium">Aanvullen</h2>
      {fields.map(([key, label]) => (
        <Label key={key} className="text-xs">{label}<Input className="mt-1" value={form[key]} disabled={locked || busy} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></Label>
      ))}
      <div className="md:col-span-2"><Button type="submit" className={goldButtonClass} disabled={locked || busy}>Bewaar</Button></div>
    </form>
  );
}

function StyleForm({ tenantId, versionId, expected, busy, run }: { tenantId: string; versionId: string; expected: string; busy: boolean; run: SectionProps["run"] }) {
  const [role, setRole] = useState("Body");
  const [family, setFamily] = useState("");
  return (
    <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); void run(() => saveBrandStyleAction(tenantId, versionId, expected, { role, family })); }}>
      <Input value={role} onChange={(event) => setRole(event.target.value)} placeholder="Rol, bijvoorbeeld H1" />
      <Input value={family} onChange={(event) => setFamily(event.target.value)} placeholder="Fontfamilie" />
      <Button type="submit" variant="secondary" disabled={busy || !family}>Stijl toevoegen</Button>
    </form>
  );
}

function ColorForm({ tenantId, versionId, expected, busy, run }: { tenantId: string; versionId: string; expected: string; busy: boolean; run: SectionProps["run"] }) {
  const [name, setName] = useState("");
  const [hex, setHex] = useState("");
  const [role, setRole] = useState<ColorRole>("unknown");
  const [cmyk, setCmyk] = useState("");
  const [pantone, setPantone] = useState("");
  return (
    <form className="mt-4 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); void run(() => saveBrandColorAction(tenantId, versionId, expected, { name, hex, role, cmyk, pantone })); }}>
      <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Naam" />
      <Input value={hex} onChange={(event) => setHex(event.target.value)} placeholder="#112233" />
      <select className="rounded-md border border-vice-border bg-vice-bg px-2" value={role} onChange={(event) => setRole(event.target.value as ColorRole)}>{COLOR_ROLES.map((item) => <option key={item} value={item}>{COLOR_ROLE_LABELS[item]}</option>)}</select>
      <Input value={cmyk} onChange={(event) => setCmyk(event.target.value)} placeholder="CMYK, alleen als aangeleverd" />
      <Input value={pantone} onChange={(event) => setPantone(event.target.value)} placeholder="Pantone, alleen als aangeleverd" />
      <Button type="submit" variant="secondary" disabled={busy}>Kleur toevoegen</Button>
    </form>
  );
}

function FontForm({ tenantId, versionId, expected, locked }: { tenantId: string; versionId: string; expected: string; locked: boolean }) {
  if (locked) return null;
  return <FileForm tenantId={tenantId} versionId={versionId} expected={expected} kind="font" />;
}

function FileForm({ tenantId, versionId, expected, kind }: { tenantId: string; versionId: string; expected: string; kind: "font" | "asset" }) {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <form className="mt-4 grid gap-2 rounded-xl border border-vice-border p-4 text-sm" action={async (formData) => {
      formData.set("versionId", versionId);
      formData.set("expectedUpdatedAt", expected);
      formData.set("kind", kind);
      const result = await uploadBrandFileAction(tenantId, formData);
      if (!result.ok) setError(result.error);
      else router.refresh();
    }}>
      <p>{kind === "font" ? "Font uploaden" : "Logo of beeld uploaden"}</p>
      <Input name="name" placeholder="Naam" />
      <input name="file" type="file" required />
      {kind === "font" ? (
        <>
          <Input name="weights" placeholder="Gewichten, bijvoorbeeld 400 700" />
          <Input name="licenseNote" placeholder="Licentienotitie" />
          <label><input name="useConfirmed" type="checkbox" value="true" /> Ik bevestig dat dit font voor deze klant gebruikt mag worden.</label>
          <label><input name="exportAllowed" type="checkbox" value="true" /> Rechten laten export toe.</label>
        </>
      ) : (
        <>
          <select name="assetKind" className="rounded-md border border-vice-border bg-vice-bg px-2 py-1">{LOGO_KINDS.map((item) => <option key={item} value={item}>{LOGO_KIND_LABELS[item]}</option>)}</select>
          <select name="referenceStatus" className="rounded-md border border-vice-border bg-vice-bg px-2 py-1">{REFERENCE_STATUSES.map((item) => <option key={item} value={item}>{REFERENCE_STATUS_LABELS[item]}</option>)}</select>
          <label><input name="exportAllowed" type="checkbox" value="true" /> Opnemen in de brand kit.</label>
        </>
      )}
      <Button type="submit" variant="secondary">Uploaden</Button>
      {error && <p className="text-red-700 dark:text-red-300">{error}</p>}
    </form>
  );
}

function Fact({ label, value, missing }: { label: string; value: string; missing: string }) {
  return <div><dt className="text-xs text-vice-text-muted">{label}</dt><dd className="mt-1 whitespace-pre-wrap">{value.trim() || missing}</dd></div>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <Label className="text-xs">{label}<Input className="mt-1" value={value} onChange={(event) => onChange(event.target.value)} /></Label>;
}

function Status({ version }: { version: BrandVersion }) {
  const label = version.status === "published" ? "Gepubliceerd" : version.status === "approved" ? "Goedgekeurd" : "Concept";
  return <span className="rounded-full bg-vice-gold/15 px-3 py-1 text-xs text-vice-text">{label} · v{version.versionNumber}</span>;
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-6xl px-6 py-8 md:px-10">{children}</div>;
}

type SectionProps = {
  tenantId: string;
  data: Exclude<BrandProfileView, { empty: true }>;
  missing?: string;
  copied: string;
  copy: (value: string, key: string) => Promise<void>;
  locked: boolean;
  busy: boolean;
  run: (task: () => Promise<{ ok: boolean; error?: string }>) => Promise<void>;
};
