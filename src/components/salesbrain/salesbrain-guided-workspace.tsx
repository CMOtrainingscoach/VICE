"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LeadgenMap } from "@/components/leadgen/leadgen-map";
import { LeadgenPlacesAutocomplete } from "@/components/leadgen/leadgen-places-autocomplete";
import { leadgenBasePath } from "@/lib/leadgen/paths";
import { exampleFirstMarketerFormSchema } from "@/lib/salesbrain/graph/example-first-marketer";
import type { SbGuidedStepId } from "@/lib/salesbrain/types";
import { createSbRunAction } from "@/modules/salesbrain/actions";

const STEPS: { id: SbGuidedStepId; label: string }[] = [
  { id: "goal", label: "Jouw doel" },
  { id: "sources", label: "Bronnen" },
  { id: "review", label: "Controleren" },
  { id: "results", label: "Resultaten" },
];

export function SalesbrainGuidedWorkspace({
  tenantId,
  tenantName,
  workflowId,
  workflowName,
  mapsApiKey,
  testMode,
}: {
  tenantId: string;
  tenantName: string;
  workflowId: string;
  workflowName: string;
  mapsApiKey: string | null;
  testMode?: boolean;
}) {
  const router = useRouter();
  const formSchema = useMemo(() => exampleFirstMarketerFormSchema(), []);
  const visibleSteps = STEPS.filter((s) => formSchema.steps.some((st) => st.id === s.id && st.visible));
  const [stepIndex, setStepIndex] = useState(0);
  const step = visibleSteps[stepIndex]?.id ?? "goal";

  const [icpId, setIcpId] = useState("");
  const [goalText, setGoalText] = useState("Bedrijven die hun eerste marketeer zoeken");
  const [locationLabel, setLocationLabel] = useState("Heist-op-den-Berg, België");
  const [lat, setLat] = useState(51.0756);
  const [lng, setLng] = useState(4.7286);
  const [radiusKm, setRadiusKm] = useState(25);
  const [trendsImportText, setTrendsImportText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onStart() {
    setError("");
    setBusy(true);
    const result = await createSbRunAction(tenantId, {
      workflowId,
      name: workflowName,
      isTest: testMode ?? false,
      locationLabel,
      lat,
      lng,
      radiusKm,
      inputs: {
        icpId,
        goalText,
        icpSnapshot: { icpId },
        trendsImportText: trendsImportText.trim() || undefined,
      },
    });
    setBusy(false);
    if (!result.ok || !result.data) {
      setError(result.ok ? "Start mislukt" : result.error);
      return;
    }
    router.push(`${leadgenBasePath(tenantId)}/sb/${result.data.id}`);
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 md:px-10">
      {testMode ? (
        <p className="mb-4 rounded-lg border border-vice-gold/40 bg-vice-gold/10 px-4 py-3 text-sm">
          Testmodus — geen productiestatus of klantnotities.
        </p>
      ) : null}
      <p className="text-sm text-vice-text-muted">
        {tenantName} / Salesbrain / {workflowName}
      </p>
      <h1 className="mt-4 font-display text-3xl text-vice-text">Begeleide zoektocht</h1>

      <ol className="mt-6 flex flex-wrap gap-2 text-sm">
        {visibleSteps.map((s, i) => (
          <li
            key={s.id}
            className={`rounded-full border px-3 py-1 ${i === stepIndex ? "border-vice-gold text-vice-text" : "border-vice-border text-vice-text-muted"}`}
          >
            {i + 1}. {s.label}
          </li>
        ))}
      </ol>

      {error ? (
        <p className="mt-4 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr,320px]">
        <div>
          {step === "goal" ? (
            <div className="space-y-4 rounded-xl border border-vice-border bg-vice-surface p-5">
              <div>
                <Label htmlFor="sb-icp">Ideale klantprofiel (ID)</Label>
                <Input id="sb-icp" className="mt-1.5" value={icpId} onChange={(e) => setIcpId(e.target.value)} placeholder="Uit strategie-audit" />
              </div>
              <div>
                <Label htmlFor="sb-goal">Wat zoek je?</Label>
                <textarea
                  id="sb-goal"
                  className="mt-1.5 min-h-[100px] w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm"
                  value={goalText}
                  onChange={(e) => setGoalText(e.target.value)}
                />
              </div>
              <LeadgenPlacesAutocomplete
                apiKey={mapsApiKey}
                value={locationLabel}
                onChange={setLocationLabel}
                onPlaceSelect={(p) => {
                  setLocationLabel(p.label);
                  setLat(p.lat);
                  setLng(p.lng);
                }}
              />
              <div>
                <Label htmlFor="sb-radius">Straal (km)</Label>
                <Input id="sb-radius" type="number" className="mt-1.5 max-w-[120px]" value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))} />
              </div>
            </div>
          ) : null}

          {step === "sources" ? (
            <div className="rounded-xl border border-vice-border bg-vice-surface p-5 text-sm text-vice-text-muted">
              <p>Live webonderzoek en vacatures: beschikbaar via workflow.</p>
              <p className="mt-2">Documenten: upload via Content (PDF/DOCX) — koppeling in volgende iteratie.</p>
              <p className="mt-2">GSC/GA4: gebruik bestaande klantkoppelingen in Instellingen.</p>
              <div className="mt-4">
                <Label htmlFor="sb-trends">Google Trends (handmatige CSV/JSON)</Label>
                <textarea
                  id="sb-trends"
                  className="mt-1.5 min-h-[80px] w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-xs font-mono"
                  placeholder="Plak geëxporteerde trends-data — geen live API in MVP."
                  value={trendsImportText}
                  onChange={(e) => setTrendsImportText(e.target.value)}
                />
              </div>
            </div>
          ) : null}

          {step === "review" ? (
            <div className="rounded-xl border border-vice-border bg-vice-surface p-5 text-sm">
              <p>
                <strong>Doel:</strong> {goalText}
              </p>
              <p className="mt-2">
                <strong>Gebied:</strong> {locationLabel}, {radiusKm} km
              </p>
              <p className="mt-2 text-vice-text-muted">De workflow controleert evidence en ICP-fit voordat prospects worden opgeslagen.</p>
            </div>
          ) : null}

          <div className="mt-6 flex gap-3">
            {stepIndex > 0 ? (
              <Button type="button" variant="secondary" onClick={() => setStepIndex((i) => i - 1)}>
                Terug
              </Button>
            ) : null}
            {stepIndex < visibleSteps.length - 1 && step !== "results" ? (
              <Button type="button" onClick={() => setStepIndex((i) => i + 1)}>
                Volgende
              </Button>
            ) : null}
            {step === "review" || stepIndex === visibleSteps.length - 1 ? (
              <Button type="button" disabled={busy} onClick={() => void onStart()}>
                Start analyse
              </Button>
            ) : null}
            <Button asChild variant="ghost">
              <Link href={leadgenBasePath(tenantId)}>Annuleren</Link>
            </Button>
          </div>
        </div>
        <LeadgenMap lat={lat} lng={lng} radiusKm={radiusKm} apiKey={mapsApiKey} />
      </div>
    </div>
  );
}
