"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Sparkles, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BuyerPersona } from "@/lib/brand/buyer-persona-types";
import type { TenantIcpSummary } from "@/lib/strategy/icp-types";
import {
  approveBuyerPersonaAction,
  generateBuyerPersonasAction,
  listBuyerPersonasForIcpAction,
  regeneratePersonaPortraitAction,
  saveBuyerPersonaAction,
} from "@/modules/brand/buyer-persona-actions";

export function BuyerPersonaWorkspace({
  tenantId,
  tenantName,
  icpOptions,
  initialIcpId,
  initialPersonas,
}: {
  tenantId: string;
  tenantName: string;
  icpOptions: TenantIcpSummary[];
  initialIcpId: string | null;
  initialPersonas: BuyerPersona[];
}) {
  const router = useRouter();
  const [icpId, setIcpId] = useState(initialIcpId ?? icpOptions[0]?.id ?? "");
  const [personas, setPersonas] = useState(initialPersonas);
  const [selectedId, setSelectedId] = useState(initialPersonas[0]?.id ?? "");
  const [extraContext, setExtraContext] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [portraitPrompt, setPortraitPrompt] = useState("");
  const [showPortraitPrompt, setShowPortraitPrompt] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selected = useMemo(
    () => personas.find((p) => p.id === selectedId) ?? personas[0] ?? null,
    [personas, selectedId],
  );

  const selectedIcp = icpOptions.find((i) => i.id === icpId);

  async function reload(icp: string) {
    const result = await listBuyerPersonasForIcpAction(tenantId, icp);
    if (result.ok && result.data) {
      setPersonas(result.data);
      setSelectedId(result.data[0]?.id ?? "");
    }
  }

  async function onIcpChange(next: string) {
    setIcpId(next);
    setError("");
    await reload(next);
    router.refresh();
  }

  async function generate() {
    if (!icpId) return;
    setBusy("gen");
    setError("");
    const result = await generateBuyerPersonasAction(tenantId, tenantName, icpId, extraContext);
    setBusy("");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (result.data) {
      setPersonas(result.data);
      setSelectedId(result.data[0]?.id ?? "");
    }
    setNotice("Buyer persona's gegenereerd. Controleer en keur goed waar nodig.");
    router.refresh();
  }

  async function saveSelected() {
    if (!selected || !icpId) return;
    setBusy("save");
    setError("");
    const result = await saveBuyerPersonaAction(tenantId, icpId, selected.id, {
      roleTitle: selected.roleTitle,
      displayName: selected.displayName,
      summary: selected.summary,
      decisionRoles: selected.decisionRoles,
      goals: selected.goals,
      pains: selected.pains,
      triggers: selected.triggers,
      decisionCriteria: selected.decisionCriteria,
      objections: selected.objections,
      infoNeeded: selected.infoNeeded,
      channels: selected.channels,
      assumptions: selected.assumptions,
      openQuestion: selected.openQuestion,
    });
    setBusy("");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (result.data) setPersonas(result.data);
    setNotice("Persona opgeslagen.");
    router.refresh();
  }

  async function approveSelected() {
    if (!selected) return;
    setBusy("approve");
    const result = await approveBuyerPersonaAction(tenantId, selected.id);
    setBusy("");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await reload(icpId);
    setNotice("Persona goedgekeurd — wordt meegenomen in contentgeneratie.");
    router.refresh();
  }

  async function newPortrait() {
    if (!selected) return;
    setBusy("portrait");
    setError("");
    const result = await regeneratePersonaPortraitAction(
      tenantId,
      selected.id,
      {
        displayName: selected.displayName,
        roleTitle: selected.roleTitle,
        summary: selected.summary,
      },
      showPortraitPrompt ? portraitPrompt : undefined,
    );
    setBusy("");
    if (!result.ok || !result.data) {
      setError(result.ok ? "Portret mislukt" : result.error);
      return;
    }
    await reload(icpId);
    setShowPortraitPrompt(false);
    setPortraitPrompt("");
    router.refresh();
  }

  function patchSelected(patch: Partial<BuyerPersona>) {
    if (!selected) return;
    setPersonas((prev) => prev.map((p) => (p.id === selected.id ? { ...p, ...patch } : p)));
  }

  const portraitUrl =
    selected?.portraits.find((p) => p.id === selected.selectedPortraitId)?.imageUrl ||
    selected?.portraits.find((p) => p.status === "ready")?.imageUrl ||
    null;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-medium">Buyer persona&apos;s</h2>
        <p className="mt-1 text-sm text-vice-text-muted">
          Koppel persona&apos;s aan een ICP. Goedgekeurde persona&apos;s (en het primaire ICP) worden gebruikt bij blog-, social- en
          andere contentgeneratie.
        </p>
      </div>

      <section className="rounded-2xl border border-vice-border bg-vice-surface p-6">
        <h3 className="text-sm font-medium">1. Kies een ICP</h3>
        {icpOptions.length === 0 ? (
          <p className="mt-3 text-sm text-vice-text-muted">
            Nog geen ICP. Maak eerst een profiel aan onder{" "}
            <Link href={`/klanten/${tenantId}/strategie?tab=icp`} className="text-vice-gold underline">
              Strategische audit → ICP
            </Link>
            .
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="min-w-[16rem] flex-1">
              <Label htmlFor="icp-select" className="text-xs text-vice-text-muted">
                ICP
              </Label>
              <select
                id="icp-select"
                className="mt-1 w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm"
                value={icpId}
                onChange={(e) => void onIcpChange(e.target.value)}
              >
                {icpOptions.map((icp) => (
                  <option key={icp.id} value={icp.id}>
                    {icp.headline.trim() || `ICP ${icp.versionNumber}`}
                    {icp.isPrimary ? " (primair)" : ""}
                  </option>
                ))}
              </select>
            </div>
            {selectedIcp ? (
              <Link href={`/klanten/${tenantId}/strategie?tab=icp&icp=${selectedIcp.id}`} className="text-sm text-vice-gold underline">
                Bekijk ICP
              </Link>
            ) : null}
          </div>
        )}
      </section>

      {icpId ? (
        <section className="rounded-2xl border border-vice-border bg-vice-surface p-6">
          <h3 className="text-sm font-medium">2. Genereer buyer persona&apos;s</h3>
          <textarea
            className="mt-3 min-h-[4rem] w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm"
            placeholder="Optionele context, bv. wie beslist samen met marketing?"
            value={extraContext}
            onChange={(e) => setExtraContext(e.target.value)}
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" disabled={Boolean(busy)} onClick={() => void generate()}>
              <Sparkles className="mr-2 size-4" aria-hidden />
              Genereer buyer persona&apos;s
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={Boolean(busy)}
              onClick={() =>
                void saveBuyerPersonaAction(tenantId, icpId, null, {
                  roleTitle: "Nieuwe rol",
                  displayName: "",
                  summary: "",
                }).then(async (r) => {
                  if (r.ok && r.data) {
                    setPersonas(r.data);
                    setSelectedId(r.data[r.data.length - 1]?.id ?? "");
                    setEditMode(true);
                  }
                })
              }
            >
              <UserPlus className="mr-2 size-4" aria-hidden />
              Manueel toevoegen
            </Button>
          </div>
        </section>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">{error}</p>
      ) : null}
      {notice ? <p className="rounded-lg border border-vice-border px-4 py-3 text-sm">{notice}</p> : null}

      {personas.length > 0 && selected ? (
        <>
          <div className="flex flex-wrap gap-2">
            {personas.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedId(p.id)}
                className={
                  p.id === selected.id
                    ? "rounded-full border border-vice-gold bg-vice-gold/10 px-3 py-1.5 text-sm font-medium"
                    : "rounded-full border border-vice-border px-3 py-1.5 text-sm text-vice-text-muted"
                }
              >
                {p.displayName || p.roleTitle}
                {p.approved ? " ✓" : ""}
              </button>
            ))}
          </div>

          <section className="grid gap-6 lg:grid-cols-[minmax(0,16rem)_1fr]">
            <div className="rounded-2xl border border-vice-border bg-vice-surface p-4">
              <div className="aspect-square overflow-hidden rounded-xl border border-vice-border bg-vice-bg/50">
                {portraitUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={portraitUrl} alt="" className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center text-xs text-vice-text-muted">Geen portret</div>
                )}
              </div>
              <Button type="button" variant="secondary" className="mt-3 w-full" disabled={Boolean(busy)} onClick={() => setShowPortraitPrompt((v) => !v)}>
                Nieuw portret
              </Button>
              {showPortraitPrompt ? (
                <div className="mt-2 space-y-2">
                  <textarea
                    className="min-h-[4rem] w-full rounded-md border border-vice-border bg-vice-bg px-2 py-1 text-xs"
                    placeholder="Optionele prompt voor beeldgeneratie in merkstijl…"
                    value={portraitPrompt}
                    onChange={(e) => setPortraitPrompt(e.target.value)}
                  />
                  <Button type="button" className="w-full" disabled={Boolean(busy)} onClick={() => void newPortrait()}>
                    Genereer portret
                  </Button>
                </div>
              ) : (
                <Button type="button" className="mt-2 w-full" disabled={Boolean(busy)} onClick={() => void newPortrait()}>
                  Snel opnieuw genereren
                </Button>
              )}
            </div>

            <div className="rounded-2xl border border-vice-border bg-vice-surface p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  {editMode ? (
                    <div className="space-y-2">
                      <Input value={selected.displayName} onChange={(e) => patchSelected({ displayName: e.target.value })} placeholder="Naam" />
                      <Input value={selected.roleTitle} onChange={(e) => patchSelected({ roleTitle: e.target.value })} placeholder="Functie" />
                    </div>
                  ) : (
                    <>
                      <h3 className="text-xl font-semibold">{selected.displayName || selected.roleTitle}</h3>
                      <p className="text-sm text-vice-text-muted">{selected.roleTitle}</p>
                    </>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" onClick={() => setEditMode((v) => !v)}>
                    <Pencil className="mr-2 size-4" aria-hidden />
                    {editMode ? "Sluiten" : "Bewerken"}
                  </Button>
                  {!selected.approved ? (
                    <Button type="button" disabled={Boolean(busy)} onClick={() => void approveSelected()}>
                      <Check className="mr-2 size-4" aria-hidden />
                      Goedkeuren
                    </Button>
                  ) : null}
                </div>
              </div>

              <PersonaField label="Samenvatting" edit={editMode} value={selected.summary} onChange={(v) => patchSelected({ summary: v })} />
              <PersonaField label="Doelen" edit={editMode} value={selected.goals} onChange={(v) => patchSelected({ goals: v })} />
              <PersonaField label="Uitdagingen" edit={editMode} value={selected.pains} onChange={(v) => patchSelected({ pains: v })} />
              <PersonaField label="Kooptrigger" edit={editMode} value={selected.triggers} onChange={(v) => patchSelected({ triggers: v })} />
              <PersonaField
                label="Besliscriteria & bezwaren"
                edit={editMode}
                value={`${selected.decisionCriteria}\n\n${selected.objections}`.trim()}
                onChange={(v) => {
                  const [a, b] = v.split("\n\n");
                  patchSelected({ decisionCriteria: a ?? "", objections: b ?? "" });
                }}
              />

              {editMode ? (
                <Button type="button" className="mt-4" disabled={Boolean(busy)} onClick={() => void saveSelected()}>
                  Opslaan
                </Button>
              ) : null}
            </div>
          </section>
        </>
      ) : icpId ? (
        <p className="text-sm text-vice-text-muted">Nog geen persona&apos;s voor dit ICP. Genereer of voeg handmatig toe.</p>
      ) : null}
    </div>
  );
}

function PersonaField({
  label,
  value,
  edit,
  onChange,
}: {
  label: string;
  value: string;
  edit: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="mt-4">
      <Label className="text-xs text-vice-text-muted">{label}</Label>
      {edit ? (
        <textarea className="mt-1 min-h-[4rem] w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm" value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <p className="mt-1 whitespace-pre-wrap text-sm text-vice-text">{value || "—"}</p>
      )}
    </div>
  );
}
