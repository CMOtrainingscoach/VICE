"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Minus, Pencil, Plus, Sparkles, Star, Trash2, X } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { icpProfileToMarkdown } from "@/lib/strategy/icp-ai";
import {
  emptyTenantIcpProfile,
  versionLabel,
  type TenantIcpProfileData,
  type TenantIcpRecord,
  type TenantIcpSummary,
} from "@/lib/strategy/icp-types";
import {
  approveTenantIcpAction,
  archiveTenantIcpAction,
  createEmptyTenantIcpAction,
  generateTenantIcpFromDocumentAction,
  reopenTenantIcpAction,
  saveTenantIcpAction,
  setPrimaryTenantIcpAction,
} from "@/modules/strategy/icp-actions";

export function IcpWorkspace({
  tenantId,
  tenantName,
  initialList,
  initialRecord,
  selectedIcpId,
}: {
  tenantId: string;
  tenantName: string;
  initialList: TenantIcpSummary[];
  initialRecord: TenantIcpRecord | null;
  selectedIcpId: string | null;
}) {
  const router = useRouter();
  const [list, setList] = useState(initialList);
  const [record, setRecord] = useState<TenantIcpRecord | null>(initialRecord);
  const [profile, setProfile] = useState<TenantIcpProfileData>(initialRecord?.profile ?? emptyTenantIcpProfile());
  const [editMode, setEditMode] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showExtra, setShowExtra] = useState(false);
  const [showSources, setShowSources] = useState(false);

  const version = useMemo(
    () => (record ? versionLabel(record.versionNumber) : "v1.0"),
    [record],
  );
  const locked = record?.status === "approved" && !editMode;
  const openCount = profile.openQuestions.filter(Boolean).length;

  function applyRecord(next: TenantIcpRecord) {
    setRecord(next);
    setProfile(next.profile);
  }

  function icpHref(icpId: string) {
    return `/klanten/${tenantId}/strategie?tab=icp&icp=${icpId}`;
  }

  async function generateNew() {
    setBusy("generate");
    setError("");
    setNotice("");
    const result = await generateTenantIcpFromDocumentAction(tenantId, tenantName);
    setBusy("");
    if (!result.ok || !result.data) {
      setError(result.ok ? "Genereren mislukt" : result.error);
      return;
    }
    setEditMode(true);
    setNotice("Nieuwe ICP gegenereerd uit het auditdocument.");
    router.push(icpHref(result.data.id));
    router.refresh();
  }

  async function regenerateCurrent() {
    if (!record?.id) return;
    setBusy("generate");
    setError("");
    setNotice("");
    const result = await generateTenantIcpFromDocumentAction(tenantId, tenantName, { icpId: record.id });
    setBusy("");
    if (!result.ok || !result.data) {
      setError(result.ok ? "Genereren mislukt" : result.error);
      return;
    }
    applyRecord(result.data);
    setEditMode(true);
    setNotice("Dit ICP opnieuw gegenereerd uit het document (versie verhoogd).");
    router.refresh();
  }

  async function createEmpty() {
    setBusy("create");
    setError("");
    const result = await createEmptyTenantIcpAction(tenantId);
    setBusy("");
    if (!result.ok || !result.data) {
      setError(result.ok ? "Aanmaken mislukt" : result.error);
      return;
    }
    setEditMode(true);
    router.push(icpHref(result.data.id));
    router.refresh();
  }

  async function save() {
    if (!record?.id) return;
    setBusy("save");
    setError("");
    setNotice("");
    const result = await saveTenantIcpAction(record.id, profile, {
      expectedUpdatedAt: record.updatedAt,
    });
    setBusy("");
    if (!result.ok || !result.data) {
      setError(result.ok ? "Opslaan mislukt" : result.error);
      return;
    }
    applyRecord(result.data);
    setNotice("ICP opgeslagen.");
    router.refresh();
  }

  async function approve() {
    if (!record) return;
    setBusy("approve");
    setError("");
    const result = await approveTenantIcpAction(tenantId, record.id, record.updatedAt);
    setBusy("");
    if (!result.ok || !result.data) {
      setError(result.ok ? "Goedkeuren mislukt" : result.error);
      return;
    }
    applyRecord(result.data);
    setEditMode(false);
    setNotice("ICP goedgekeurd.");
    router.refresh();
  }

  async function reopen() {
    if (!record) return;
    setBusy("reopen");
    setError("");
    const result = await reopenTenantIcpAction(tenantId, record.id, record.updatedAt);
    setBusy("");
    if (!result.ok || !result.data) {
      setError(result.ok ? "Heropenen mislukt" : result.error);
      return;
    }
    applyRecord(result.data);
    setEditMode(true);
    router.refresh();
  }

  async function copyExport() {
    const md = icpProfileToMarkdown(tenantName, profile, version);
    try {
      await navigator.clipboard.writeText(md);
      setNotice("ICP gekopieerd als markdown.");
    } catch {
      setError("Kopiëren mislukt in deze browser.");
    }
  }

  async function makePrimary() {
    if (!record?.id) return;
    setBusy("primary");
    setError("");
    const result = await setPrimaryTenantIcpAction(tenantId, record.id);
    setBusy("");
    if (!result.ok || !result.data) {
      setError(result.ok ? "Instellen mislukt" : result.error);
      return;
    }
    applyRecord(result.data);
    setList((prev) =>
      prev.map((item) => ({
        ...item,
        isPrimary: item.id === result.data!.id,
      })),
    );
    router.refresh();
  }

  async function removeIcp() {
    if (!record?.id) return;
    if (!window.confirm("Dit ICP verbergen? Je kan later een nieuw profiel toevoegen.")) return;
    setBusy("archive");
    setError("");
    const result = await archiveTenantIcpAction(tenantId, record.id);
    setBusy("");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(`/klanten/${tenantId}/strategie?tab=icp`);
    router.refresh();
  }

  const hasProfile = Boolean(record?.profile.headline.trim() || profile.headline.trim());
  const showEmptyPanel = !record && list.length === 0;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 md:px-10">
      <p className="text-sm text-vice-text-muted">Klanten / {tenantName}</p>
      <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-vice-text md:text-3xl">ICP</h1>
          <p className="mt-2 max-w-prose text-sm text-vice-text-muted">
            Meerdere ideale klantprofielen per klant, afgeleid uit het auditdocument. Kies een profiel, genereer
            segmenten of scherp handmatig bij.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {record ? (
            <span
              className={
                record.status === "approved"
                  ? "rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-800 dark:text-emerald-200"
                  : "rounded-full border border-vice-border px-3 py-1 text-xs font-medium text-vice-text-muted"
              }
            >
              {record.status === "approved" ? `Goedgekeurd · ${version}` : `Concept · ${version}`}
            </span>
          ) : null}
          <Button type="button" variant="secondary" disabled={Boolean(busy)} onClick={() => void copyExport()}>
            <Copy className="mr-2 size-4" aria-hidden />
            Exporteer
          </Button>
          {record?.status === "approved" && !editMode ? (
            <Button type="button" variant="secondary" disabled={Boolean(busy)} onClick={() => void reopen()}>
              <Pencil className="mr-2 size-4" aria-hidden />
              Bewerken
            </Button>
          ) : (
            <Button
              type="button"
              variant="secondary"
              disabled={Boolean(busy)}
              onClick={() => setEditMode((value) => !value)}
            >
              {editMode ? (
                <>
                  <X className="mr-2 size-4" aria-hidden />
                  Voorbeeld
                </>
              ) : (
                <>
                  <Pencil className="mr-2 size-4" aria-hidden />
                  Bewerken
                </>
              )}
            </Button>
          )}
          {record && record.status !== "approved" ? (
            <Button type="button" disabled={Boolean(busy) || !hasProfile} onClick={() => void approve()}>
              <Check className="mr-2 size-4" aria-hidden />
              Goedkeuren
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {list.map((item) => {
          const active = item.id === selectedIcpId;
          const label = item.headline.trim() || `ICP ${item.versionNumber}`;
          return (
            <Link
              key={item.id}
              href={icpHref(item.id)}
              className={
                active
                  ? "rounded-full border border-vice-gold bg-vice-gold/10 px-3 py-1.5 text-sm font-medium text-vice-text"
                  : "rounded-full border border-vice-border px-3 py-1.5 text-sm text-vice-text-muted hover:text-vice-text"
              }
            >
              {item.isPrimary ? "★ " : ""}
              {label}
            </Link>
          );
        })}
        <Button type="button" variant="secondary" className="h-8 rounded-full px-3 text-xs" disabled={Boolean(busy)} onClick={() => void createEmpty()}>
          <Plus className="mr-1 size-3.5" aria-hidden />
          Leeg ICP
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <Button type="button" disabled={Boolean(busy)} onClick={() => void generateNew()}>
          <Sparkles className="mr-2 size-4" aria-hidden />
          Nieuwe ICP uit document
        </Button>
        {record ? (
          <Button type="button" variant="secondary" disabled={Boolean(busy)} onClick={() => void regenerateCurrent()}>
            Opnieuw genereren (huidige)
          </Button>
        ) : null}
        <Button type="button" variant="secondary" disabled={Boolean(busy) || !record?.id} onClick={() => void save()}>
          Opslaan
        </Button>
        {record && !record.isPrimary ? (
          <Button type="button" variant="secondary" disabled={Boolean(busy)} onClick={() => void makePrimary()}>
            <Star className="mr-2 size-4" aria-hidden />
            Maak primair
          </Button>
        ) : null}
        {record ? (
          <Button type="button" variant="secondary" disabled={Boolean(busy)} onClick={() => void removeIcp()}>
            <Trash2 className="mr-2 size-4" aria-hidden />
            Verbergen
          </Button>
        ) : null}
        <Link
          href={`/klanten/${tenantId}/strategie?tab=document`}
          className="inline-flex items-center text-sm text-vice-gold underline"
        >
          Naar auditdocument
        </Link>
      </div>

      {error ? (
        <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mt-4 rounded-lg border border-vice-border bg-vice-surface px-4 py-3 text-sm text-vice-text">{notice}</p>
      ) : null}

      {showEmptyPanel && !busy ? (
        <div className="mt-10 rounded-2xl border border-dashed border-vice-border bg-vice-surface/60 px-6 py-12 text-center">
          <p className="text-sm text-vice-text-muted">
            Nog geen ICP&apos;s. Bewaar een audit op het tabblad Document, kom terug en klik op{" "}
            <strong className="font-medium text-vice-text">Nieuwe ICP uit document</strong>.
          </p>
        </div>
      ) : record ? (
        <div className="mt-8 space-y-6">
          <section className="rounded-2xl border border-vice-border bg-vice-surface p-6 md:p-8">
            <p className="text-xs font-medium uppercase tracking-wide text-vice-text-muted">Je ideale klant</p>
            <h2 className="mt-2 text-xl font-semibold text-vice-text md:text-2xl">
              {editMode && !locked ? (
                <Input
                  value={profile.headline}
                  onChange={(e) => setProfile((p) => ({ ...p, headline: e.target.value }))}
                  placeholder="Korte titel van het ICP"
                  className="text-lg font-semibold"
                />
              ) : (
                profile.headline || "Ideale klant"
              )}
            </h2>
            <p className="mt-1 text-sm text-vice-text-muted">Een helder profiel om de juiste bedrijven te herkennen</p>

            <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <div className="flex min-h-[8rem] items-center justify-center rounded-xl border border-vice-border bg-vice-bg/50 text-vice-text-muted">
                <span className="text-xs">Profiel</span>
              </div>
              <div>
                {editMode && !locked ? (
                  <textarea
                    className="min-h-[5rem] w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm"
                    value={profile.summary}
                    onChange={(e) => setProfile((p) => ({ ...p, summary: e.target.value }))}
                    placeholder="Samenvatting in 2–3 zinnen"
                  />
                ) : (
                  <p className="text-sm leading-relaxed text-vice-text">{profile.summary || "—"}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {record.isPrimary ? <Badge>Primair ICP</Badge> : <Badge muted>Secundair ICP</Badge>}
                  <Badge muted>Gebaseerd op audit</Badge>
                </div>
                <p className="mt-4 text-sm text-vice-text-muted">
                  Aanbod:{" "}
                  {editMode && !locked ? (
                    <Input
                      value={profile.offer}
                      onChange={(e) => setProfile((p) => ({ ...p, offer: e.target.value }))}
                      className="mt-1"
                    />
                  ) : (
                    <span className="text-vice-text">{profile.offer || "—"}</span>
                  )}
                </p>
              </div>
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Bedrijfsprofiel">
              <Field label="Activiteit" edit={editMode && !locked} value={profile.activity} onChange={(v) => setProfile((p) => ({ ...p, activity: v }))} />
              <Field label="Werkgebied" edit={editMode && !locked} value={profile.region} onChange={(v) => setProfile((p) => ({ ...p, region: v }))} />
              <Field label="Bedrijfsfase" edit={editMode && !locked} value={profile.phase} onChange={(v) => setProfile((p) => ({ ...p, phase: v }))} />
              <div className="mt-3">
                <Label className="text-xs text-vice-text-muted">Teamgrootte</Label>
                {editMode && !locked ? (
                  <div className="mt-1 space-y-2">
                    <Input value={profile.teamSize} onChange={(e) => setProfile((p) => ({ ...p, teamSize: e.target.value }))} />
                    <label className="flex items-center gap-2 text-xs text-vice-text-muted">
                      <input
                        type="checkbox"
                        checked={profile.teamSizeNeedsValidation}
                        onChange={(e) => setProfile((p) => ({ ...p, teamSizeNeedsValidation: e.target.checked }))}
                      />
                      Nog te valideren
                    </label>
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-vice-text">
                    {profile.teamSize || "—"}
                    {profile.teamSizeNeedsValidation ? (
                      <span className="ml-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-900 dark:text-amber-100">
                        Nog te valideren
                      </span>
                    ) : null}
                  </p>
                )}
              </div>
              <button
                type="button"
                className="mt-4 text-xs font-medium text-vice-gold underline"
                onClick={() => setShowExtra((v) => !v)}
              >
                {showExtra ? "Minder kenmerken" : "Meer kenmerken"}
              </button>
              {showExtra ? (
                editMode && !locked ? (
                  <textarea
                    className="mt-2 min-h-[4rem] w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm"
                    value={profile.extraCharacteristics}
                    onChange={(e) => setProfile((p) => ({ ...p, extraCharacteristics: e.target.value }))}
                  />
                ) : (
                  <p className="mt-2 text-sm text-vice-text-muted">{profile.extraCharacteristics || "—"}</p>
                )
              ) : null}
            </Card>

            <Card title="Past deze klant bij ons?">
              <CriteriaList
                title="Moet aanwezig zijn"
                icon="check"
                items={profile.criteriaMust}
                edit={editMode && !locked}
                onChange={(items) => setProfile((p) => ({ ...p, criteriaMust: items }))}
              />
              <CriteriaList
                title="Is een pluspunt"
                icon="plus"
                items={profile.criteriaPlus}
                edit={editMode && !locked}
                onChange={(items) => setProfile((p) => ({ ...p, criteriaPlus: items }))}
              />
              <CriteriaList
                title="Past niet"
                icon="minus"
                items={profile.criteriaExclude}
                edit={editMode && !locked}
                onChange={(items) => setProfile((p) => ({ ...p, criteriaExclude: items }))}
              />
            </Card>

            <Card title="Behoefte & kooptrigger">
              <Field
                label="Belangrijkste probleem"
                edit={editMode && !locked}
                value={profile.mainProblem}
                onChange={(v) => setProfile((p) => ({ ...p, mainProblem: v }))}
                tag={profile.mainProblemSource}
                tagEdit={editMode && !locked}
                onTagChange={(v) => setProfile((p) => ({ ...p, mainProblemSource: v }))}
              />
              <Field
                label="Gewenste uitkomst"
                edit={editMode && !locked}
                value={profile.desiredOutcome}
                onChange={(v) => setProfile((p) => ({ ...p, desiredOutcome: v }))}
              />
              <Field
                label="Aanleiding"
                edit={editMode && !locked}
                value={profile.trigger}
                onChange={(v) => setProfile((p) => ({ ...p, trigger: v }))}
                tag={profile.triggerLabel}
                tagEdit={editMode && !locked}
                onTagChange={(v) => setProfile((p) => ({ ...p, triggerLabel: v }))}
              />
            </Card>

            <Card title="Voorwaarden voor samenwerking">
              <Field label="Budgetindicatie" edit={editMode && !locked} value={profile.budget} onChange={(v) => setProfile((p) => ({ ...p, budget: v }))} />
              <Field label="Beschikbare capaciteit" edit={editMode && !locked} value={profile.capacity} onChange={(v) => setProfile((p) => ({ ...p, capacity: v }))} />
              {openCount > 0 ? (
                <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
                  {openCount} open {openCount === 1 ? "vraag" : "vragen"} — valideer en werk het profiel bij.
                </div>
              ) : null}
              <OpenQuestionsList
                items={profile.openQuestions}
                edit={editMode && !locked}
                onChange={(items) => setProfile((p) => ({ ...p, openQuestions: items }))}
              />
            </Card>
          </div>

          <Card title="Positionering">
            {editMode && !locked ? (
              <textarea
                className="min-h-[6rem] w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm"
                value={profile.positioning}
                onChange={(e) => setProfile((p) => ({ ...p, positioning: e.target.value }))}
              />
            ) : (
              <p className="text-sm leading-relaxed text-vice-text">{profile.positioning || "—"}</p>
            )}
            <p className="mt-2 text-xs text-vice-text-muted">Audit · {version}</p>
          </Card>

          <button
            type="button"
            className="flex w-full items-center justify-between rounded-xl border border-vice-border bg-vice-surface px-4 py-3 text-left text-sm font-medium text-vice-text"
            onClick={() => setShowSources((v) => !v)}
          >
            Bronnen & aannames
            <span className="text-vice-text-muted">{showSources ? "−" : "+"}</span>
          </button>
          {showSources ? (
            <div className="rounded-b-xl border border-t-0 border-vice-border bg-vice-surface px-4 pb-4">
              {editMode && !locked ? (
                <textarea
                  className="min-h-[5rem] w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm"
                  value={profile.sourcesAndAssumptions}
                  onChange={(e) => setProfile((p) => ({ ...p, sourcesAndAssumptions: e.target.value }))}
                />
              ) : (
                <p className="text-sm whitespace-pre-wrap text-vice-text-muted">{profile.sourcesAndAssumptions || "—"}</p>
              )}
              {record?.sourceDocumentSavedAt ? (
                <p className="mt-2 text-xs text-vice-text-muted">
                  Document bewaard: {new Date(record.sourceDocumentSavedAt).toLocaleString("nl-BE")}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-10 text-sm text-vice-text-muted">Selecteer een ICP hierboven of maak een nieuwe aan.</p>
      )}
    </div>
  );
}

function Badge({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return (
    <span
      className={
        muted
          ? "rounded-full border border-vice-border px-2.5 py-0.5 text-xs text-vice-text-muted"
          : "rounded-full border border-vice-gold/40 bg-vice-gold/10 px-2.5 py-0.5 text-xs text-vice-text"
      }
    >
      {children}
    </span>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-vice-border bg-vice-surface p-6">
      <h3 className="text-base font-medium text-vice-text">{title}</h3>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  value,
  edit,
  onChange,
  tag,
  tagEdit,
  onTagChange,
}: {
  label: string;
  value: string;
  edit: boolean;
  onChange: (value: string) => void;
  tag?: string;
  tagEdit?: boolean;
  onTagChange?: (value: string) => void;
}) {
  return (
    <div>
      <Label className="text-xs text-vice-text-muted">{label}</Label>
      {edit ? (
        <Input className="mt-1" value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <p className="mt-1 text-sm text-vice-text">{value || "—"}</p>
      )}
      {tag || tagEdit ? (
        <div className="mt-1">
          {tagEdit && onTagChange ? (
            <Input className="max-w-[10rem] text-xs" value={tag ?? ""} placeholder="Tag" onChange={(e) => onTagChange(e.target.value)} />
          ) : tag ? (
            <span className="rounded-full border border-vice-border px-2 py-0.5 text-xs text-vice-text-muted">{tag}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CriteriaList({
  title,
  icon,
  items,
  edit,
  onChange,
}: {
  title: string;
  icon: "check" | "plus" | "minus";
  items: string[];
  edit: boolean;
  onChange: (items: string[]) => void;
}) {
  const Icon = icon === "check" ? Check : icon === "plus" ? Plus : Minus;
  const list = items.length ? items : edit ? [""] : [];

  return (
    <div>
      <p className="text-xs font-medium text-vice-text-muted">{title}</p>
      <ul className="mt-2 space-y-2">
        {(list.length ? list : ["—"]).map((item, index) => (
          <li key={`${title}-${index}`} className="flex items-start gap-2 text-sm">
            <Icon className="mt-0.5 size-4 shrink-0 text-vice-gold" aria-hidden />
            {edit ? (
              <Input
                value={item === "—" ? "" : item}
                onChange={(e) => {
                  const next = [...items];
                  next[index] = e.target.value;
                  onChange(next.filter((row, i) => row.trim() || i === index));
                }}
                placeholder="Criteria…"
              />
            ) : (
              <span className="text-vice-text">{item}</span>
            )}
          </li>
        ))}
      </ul>
      {edit ? (
        <Button
          type="button"
          variant="secondary"
          className="mt-2 h-8 text-xs"
          onClick={() => onChange([...items, ""])}
        >
          Regel toevoegen
        </Button>
      ) : null}
    </div>
  );
}

function OpenQuestionsList({
  items,
  edit,
  onChange,
}: {
  items: string[];
  edit: boolean;
  onChange: (items: string[]) => void;
}) {
  if (!edit && items.length === 0) return null;
  const list = items.length ? items : edit ? [""] : [];
  return (
    <div className="mt-4">
      <p className="text-xs font-medium text-vice-text-muted">Open vragen</p>
      <ul className="mt-2 space-y-2">
        {list.map((item, index) => (
          <li key={`q-${index}`}>
            {edit ? (
              <Input
                value={item}
                onChange={(e) => {
                  const next = [...items];
                  next[index] = e.target.value;
                  onChange(next);
                }}
                placeholder="Vraag voor validatie…"
              />
            ) : (
              <p className="text-sm text-vice-text">{item}</p>
            )}
          </li>
        ))}
      </ul>
      {edit ? (
        <Button type="button" variant="secondary" className="mt-2 h-8 text-xs" onClick={() => onChange([...items, ""])}>
          Vraag toevoegen
        </Button>
      ) : null}
    </div>
  );
}
