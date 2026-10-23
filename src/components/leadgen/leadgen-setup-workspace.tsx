"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LeadgenMap } from "@/components/leadgen/leadgen-map";
import { LeadgenPlacesAutocomplete } from "@/components/leadgen/leadgen-places-autocomplete";
import { leadgenMaxRadiusKm, leadgenMinRadiusKm } from "@/lib/leadgen/constants";
import { LEADGEN_FIXTURE_BANNER, leadgenFixturesEnabled } from "@/lib/leadgen/fixtures";
import type { LeadgenRunConfig } from "@/lib/leadgen/types";
import { leadgenBasePath } from "@/lib/leadgen/paths";
import { createLeadgenRunAction, saveLeadgenTemplateAction } from "@/modules/leadgen/actions";

const DEFAULT_LAT = 51.3225;
const DEFAULT_LNG = 4.9447;

export function LeadgenSetupWorkspace({
  tenantId,
  tenantName,
  mapsApiKey,
  initialConfig,
}: {
  tenantId: string;
  tenantName: string;
  mapsApiKey: string | null;
  initialConfig?: Partial<LeadgenRunConfig> | null;
}) {
  const router = useRouter();
  const [locationLabel, setLocationLabel] = useState(initialConfig?.locationLabel ?? "Turnhout, België");
  const [placeId, setPlaceId] = useState<string | null>(initialConfig?.placeId ?? null);
  const [lat, setLat] = useState(initialConfig?.lat ?? DEFAULT_LAT);
  const [lng, setLng] = useState(initialConfig?.lng ?? DEFAULT_LNG);
  const [radiusKm, setRadiusKm] = useState(initialConfig?.radiusKm ?? 25);
  const [assignmentText, setAssignmentText] = useState(
    initialConfig?.assignmentText ?? "Zoek bedrijven met een mogelijk verouderde website.",
  );
  const [sector, setSector] = useState(initialConfig?.criteria?.sector ?? "");
  const [maxResults, setMaxResults] = useState(initialConfig?.criteria?.maxResults ?? 30);
  const [signalsText, setSignalsText] = useState((initialConfig?.criteria?.signals ?? []).join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("leadgen-clone-config");
      if (!raw) return;
      sessionStorage.removeItem("leadgen-clone-config");
      const config = JSON.parse(raw) as Partial<LeadgenRunConfig>;
      if (config.locationLabel) setLocationLabel(config.locationLabel);
      if (config.placeId !== undefined) setPlaceId(config.placeId);
      if (config.lat != null) setLat(config.lat);
      if (config.lng != null) setLng(config.lng);
      if (config.radiusKm != null) setRadiusKm(config.radiusKm);
      if (config.assignmentText) setAssignmentText(config.assignmentText);
      if (config.criteria?.sector) setSector(config.criteria.sector);
      if (config.criteria?.maxResults) setMaxResults(config.criteria.maxResults);
      if (config.criteria?.signals?.length) setSignalsText(config.criteria.signals.join(", "));
    } catch {
      /* ignore */
    }
  }, []);

  const interpretation = useMemo(
    () => ({
      targetBusinesses: sector.trim() || "Bedrijven die passen bij je opdracht",
      geographicBoundary: `${radiusKm} km rond ${locationLabel}`,
      criteriaSummary: signalsText.trim() || assignmentText.slice(0, 120),
      enabledSources: "Openbaar internet (Tavily/Serper)",
      resultLimit: maxResults,
    }),
    [assignmentText, locationLabel, maxResults, radiusKm, sector, signalsText],
  );

  const signals = signalsText
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  async function buildPayload() {
    const minR = leadgenMinRadiusKm();
    const maxR = leadgenMaxRadiusKm();
    if (radiusKm < minR || radiusKm > maxR) {
      setError(`Straal moet tussen ${minR} en ${maxR} km liggen.`);
      return null;
    }
    if (!assignmentText.trim()) {
      setError("Beschrijf je opdracht.");
      return null;
    }
    if (!locationLabel.trim()) {
      setError("Kies een locatie.");
      return null;
    }
    const autoName = `${sector.trim() || "Prospecten"} · ${locationLabel.split(",")[0]?.trim()} · ${radiusKm} km`;
    return {
      name: autoName,
      autoName,
      locationLabel,
      placeId,
      lat,
      lng,
      radiusKm,
      assignmentText,
      criteria: { sector: sector.trim() || undefined, maxResults, signals },
      sources: ["public_internet"],
      interpretation,
    };
  }

  async function onStart() {
    setError("");
    const payload = await buildPayload();
    if (!payload) return;
    setBusy(true);
    const result = await createLeadgenRunAction(tenantId, payload);
    setBusy(false);
    if (!result.ok || !result.data) {
      setError(result.ok ? "Run aanmaken mislukt" : result.error);
      return;
    }
    router.push(`${leadgenBasePath(tenantId)}/${result.data.id}`);
    router.refresh();
  }

  async function onSaveTemplate() {
    setError("");
    const payload = await buildPayload();
    if (!payload) return;
    setBusy(true);
    const result = await saveLeadgenTemplateAction(tenantId, { ...payload, templateName: payload.name });
    setBusy(false);
    if (!result.ok) setError(result.error);
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 md:px-10">
      <p className="text-sm text-vice-text-muted">
        {tenantName} / Leadgen / Nieuwe zoektocht
      </p>
      <h1 className="mt-4 font-display text-4xl tracking-tight text-vice-text">Vind je volgende klant.</h1>
      <p className="mt-2 max-w-2xl text-sm text-vice-text-muted">
        Stel locatie, straal en opdracht in. VICE zoekt publiek beschikbare bedrijven en beoordeelt signalen op basis van
        wat daadwerkelijk gevonden werd.
      </p>

      {leadgenFixturesEnabled() ? (
        <p className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">{LEADGEN_FIXTURE_BANNER}</p>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr,minmax(280px,360px)]">
        <div className="space-y-8">
          <section className="rounded-xl border border-vice-border bg-vice-surface p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-vice-text-muted">A · Locatie</h2>
            <div className="mt-4 space-y-4">
              <LeadgenPlacesAutocomplete
                apiKey={mapsApiKey}
                value={locationLabel}
                onChange={setLocationLabel}
                onPlaceSelect={(place) => {
                  setPlaceId(place.placeId || null);
                  setLocationLabel(place.label);
                  setLat(place.lat);
                  setLng(place.lng);
                }}
              />
              <div>
                <Label htmlFor="leadgen-radius">Straal (km)</Label>
                <Input
                  id="leadgen-radius"
                  type="number"
                  min={leadgenMinRadiusKm()}
                  max={leadgenMaxRadiusKm()}
                  className="mt-1.5 max-w-[120px]"
                  value={radiusKm}
                  onChange={(e) => setRadiusKm(Number(e.target.value))}
                />
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-vice-border bg-vice-surface p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-vice-text-muted">B · Opdracht</h2>
            <div className="mt-4 space-y-4">
              <div>
                <Label htmlFor="leadgen-sector">Sector (optioneel)</Label>
                <Input id="leadgen-sector" className="mt-1.5" value={sector} onChange={(e) => setSector(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="leadgen-assignment">Wat zoek je?</Label>
                <textarea
                  id="leadgen-assignment"
                  className="mt-1.5 min-h-[120px] w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm"
                  value={assignmentText}
                  onChange={(e) => setAssignmentText(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="leadgen-signals">Signalen (komma-gescheiden)</Label>
                <Input
                  id="leadgen-signals"
                  className="mt-1.5"
                  placeholder="Mobiele weergave, gebroken links, …"
                  value={signalsText}
                  onChange={(e) => setSignalsText(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="leadgen-max">Max. resultaten</Label>
                <Input
                  id="leadgen-max"
                  type="number"
                  min={5}
                  max={100}
                  className="mt-1.5 max-w-[120px]"
                  value={maxResults}
                  onChange={(e) => setMaxResults(Number(e.target.value))}
                />
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-vice-border bg-vice-surface p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-vice-text-muted">C · Interpretatie (preview)</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div>
                <dt className="text-vice-text-muted">Doelgroep</dt>
                <dd>{interpretation.targetBusinesses}</dd>
              </div>
              <div>
                <dt className="text-vice-text-muted">Geografisch</dt>
                <dd>{interpretation.geographicBoundary}</dd>
              </div>
              <div>
                <dt className="text-vice-text-muted">Criteria</dt>
                <dd>{interpretation.criteriaSummary}</dd>
              </div>
            </dl>
          </section>

          <div className="flex flex-wrap gap-3">
            <Button type="button" disabled={busy} onClick={() => void onStart()}>
              {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
              Start zoektocht
            </Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void onSaveTemplate()}>
              Bewaar opdracht
            </Button>
            <Button type="button" variant="ghost" asChild>
              <Link href={leadgenBasePath(tenantId)}>Annuleren</Link>
            </Button>
          </div>
        </div>

        <LeadgenMap lat={lat} lng={lng} radiusKm={radiusKm} apiKey={mapsApiKey} className="h-full min-h-[320px] lg:sticky lg:top-6" />
      </div>
    </div>
  );
}
