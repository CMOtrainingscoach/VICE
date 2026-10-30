"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle, Pencil, Plus, Sparkles, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { beeldCompositionToJpegFile } from "@/lib/content/beeld-import";
import type { BeeldCompositionSummary } from "@/lib/content/beeld-types";
import { estimateKlingUnits } from "@/lib/integrations/kling";
import {
  VIDEO_ASPECT_PRESETS,
  VIDEO_INTENDED_USES,
  aspectPresetLabel,
  type VideoAspectPreset,
  type VideoConcept,
  type VideoConceptSummary,
  type VideoDurationSeconds,
  type VideoIntendedUse,
  type VideoResolution,
} from "@/lib/content/video-types";
import type { ClientBrand } from "@/lib/brand/types";
import { loadBeeldCompositionAction } from "@/modules/content/beeld-actions";
import {
  createVideoConceptAction,
  deleteVideoConceptAction,
  getKlingCreditsBalanceForVideoAction,
  pollVideoGenerationAction,
  saveVideoConceptAction,
  startVideoGenerationAction,
  uploadVideoSourceImageAction,
} from "@/modules/content/video-actions";

const fieldClass =
  "w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm text-vice-text outline-none focus:border-vice-gold";

export function VideoWorkspace({
  tenantId,
  tenantName,
  initial,
  concepts,
  beeldCompositions = [],
  clientBrand = null,
}: {
  tenantId: string;
  tenantName: string;
  initial: VideoConcept | null;
  concepts: VideoConceptSummary[];
  beeldCompositions?: BeeldCompositionSummary[];
  clientBrand?: ClientBrand | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [concept, setConcept] = useState<VideoConcept | null>(initial);
  const [conceptList, setConceptList] = useState(concepts);
  const [internalName, setInternalName] = useState(initial?.internalName ?? "");
  const [intendedUse, setIntendedUse] = useState<VideoIntendedUse>(initial?.intendedUse ?? "social");
  const [aspectPreset, setAspectPreset] = useState<VideoAspectPreset>(initial?.aspectPreset ?? "reel_9_16");
  const [durationSeconds, setDurationSeconds] = useState<VideoDurationSeconds>(initial?.durationSeconds ?? 5);
  const [resolution, setResolution] = useState<VideoResolution>(initial?.resolution ?? "720p");
  const [motionPrompt, setMotionPrompt] = useState(initial?.motionPrompt ?? "");
  const [beeldCompositionId, setBeeldCompositionId] = useState(initial?.beeldCompositionId ?? "");
  const [unitsBalance, setUnitsBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState("");

  const estimatedUnits = estimateKlingUnits(durationSeconds, resolution);

  useEffect(() => {
    void getKlingCreditsBalanceForVideoAction().then((result) => {
      if (result.ok && result.data) setUnitsBalance(result.data.balance);
    });
  }, []);

  useEffect(() => {
    if (!concept || concept.jobStatus !== "processing") return;
    const timer = window.setInterval(() => {
      void pollVideoGenerationAction(concept.id).then((result) => {
        if (result.ok && result.data) {
          setConcept(result.data);
          if (result.data.jobStatus !== "processing") {
            void getKlingCreditsBalanceForVideoAction().then((b) => {
              if (b.ok && b.data) setUnitsBalance(b.data.balance);
            });
          }
        }
      });
    }, 4000);
    return () => window.clearInterval(timer);
  }, [concept?.id, concept?.jobStatus]);

  async function saveCurrent() {
    if (!concept) return null;
    const saved = await saveVideoConceptAction(concept.id, concept.updatedAt, {
      internalName,
      intendedUse,
      aspectPreset,
      durationSeconds,
      resolution,
      motionPrompt,
    });
    if (!saved.ok || !saved.data) {
      setError(saved.ok ? "Opslaan mislukt" : saved.error);
      return null;
    }
    setConcept(saved.data);
    return saved.data;
  }

  async function createNew() {
    setBusy("create");
    setError("");
    const created = await createVideoConceptAction({
      tenantId,
      internalName: "Nieuwe video",
      intendedUse: "social",
      aspectPreset: "reel_9_16",
    });
    setBusy("");
    if (!created.ok || !created.data) {
      setError(created.ok ? "Aanmaken mislukt" : created.error);
      return;
    }
    router.replace(`/klanten/${tenantId}/content/video/${created.data.id}`);
  }

  async function uploadSource(files: FileList | null) {
    if (!files?.length || !concept) return;
    setBusy("upload");
    setError("");
    const form = new FormData();
    form.set("file", files[0]);
    const result = await uploadVideoSourceImageAction(concept.id, form);
    setBusy("");
    if (!result.ok || !result.data) {
      setError(result.ok ? "Upload mislukt" : result.error);
      return;
    }
    setConcept(result.data);
  }

  async function importBeeld() {
    if (!concept || !beeldCompositionId) return;
    setBusy("beeld");
    setError("");
    try {
      const loaded = await loadBeeldCompositionAction(beeldCompositionId);
      if (!loaded.ok || !loaded.data) throw new Error(loaded.ok ? "Compositie laden mislukt" : loaded.error);
      const file = await beeldCompositionToJpegFile(loaded.data, clientBrand);
      const form = new FormData();
      form.set("file", file);
      const uploaded = await uploadVideoSourceImageAction(concept.id, form);
      if (!uploaded.ok || !uploaded.data) {
        throw new Error(uploaded.ok ? "Importeren mislukt" : uploaded.error);
      }
      const withBeeld = await saveVideoConceptAction(uploaded.data.id, uploaded.data.updatedAt, {
        sourceKind: "beeld",
        beeldCompositionId,
      });
      if (!withBeeld.ok || !withBeeld.data) {
        throw new Error(withBeeld.ok ? "Opslaan mislukt" : withBeeld.error);
      }
      setConcept(withBeeld.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Importeren mislukt");
    } finally {
      setBusy("");
    }
  }

  async function generate() {
    if (!concept) return;
    setBusy("gen");
    setError("");
    await saveCurrent();
    const started = await startVideoGenerationAction(concept.id);
    setBusy("");
    if (!started.ok || !started.data) {
      setError(started.ok ? "Start mislukt" : started.error);
      return;
    }
    setConcept(started.data);
  }

  async function deleteConcept(id: string) {
    if (!window.confirm("Deze video verwijderen?")) return;
    setDeletingId(id);
    const result = await deleteVideoConceptAction(id);
    setDeletingId("");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setConceptList((prev) => prev.filter((item) => item.id !== id));
    if (concept?.id === id) router.replace(`/klanten/${tenantId}/content/video`);
  }

  const processing = concept?.jobStatus === "processing";

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 md:px-10">
      <p className="text-sm text-vice-text-muted">
        {tenantName} /{" "}
        <Link href={`/klanten/${tenantId}/content`} className="hover:text-vice-gold">
          Content
        </Link>{" "}
        / Video
      </p>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-vice-gold">Video v1</p>
          <h1 className="mt-2 font-display text-3xl tracking-tight text-vice-text md:text-4xl">Video</h1>
          <p className="mt-2 max-w-2xl text-sm text-vice-text-muted">
            Animateer een startbeeld met Kling (max 10 s, MP4). Geschikt voor social, ads en hero — koppeling volgt in
            latere releases.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={busy !== ""} onClick={() => void createNew()}>
            <Plus className="size-4" />
            Nieuwe video
          </Button>
          {concept ? (
            <Button type="button" disabled={busy !== "" || processing} onClick={() => void saveCurrent()}>
              Opslaan
            </Button>
          ) : null}
        </div>
      </div>

      {unitsBalance != null ? (
        <p className="mt-3 text-xs text-vice-text-muted">
          Kling-saldo: <span className="tabular-nums font-medium text-vice-text">{unitsBalance.toFixed(2)}</span> units
          · geschatte kosten deze render: ~{estimatedUnits} units (
          <Link href="/instellingen" className="text-vice-gold underline">
            bijladen
          </Link>
          )
        </p>
      ) : null}

      {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}

      {concept ? (
        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section className="space-y-4 rounded-2xl border border-vice-border bg-vice-surface p-5">
            <div>
              <Label className="text-xs text-vice-text-muted">Interne naam</Label>
              <input className={`${fieldClass} mt-1`} value={internalName} onChange={(e) => setInternalName(e.target.value)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs text-vice-text-muted">Doel</Label>
                <select className={`${fieldClass} mt-1`} value={intendedUse} onChange={(e) => setIntendedUse(e.target.value as VideoIntendedUse)}>
                  {VIDEO_INTENDED_USES.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs text-vice-text-muted">Formaat (metadata)</Label>
                <select className={`${fieldClass} mt-1`} value={aspectPreset} onChange={(e) => setAspectPreset(e.target.value as VideoAspectPreset)}>
                  {VIDEO_ASPECT_PRESETS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-vice-text-muted">
                  {VIDEO_ASPECT_PRESETS.find((p) => p.id === aspectPreset)?.hint}
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs text-vice-text-muted">Duur</Label>
                <select
                  className={`${fieldClass} mt-1`}
                  value={durationSeconds}
                  disabled={processing}
                  onChange={(e) => setDurationSeconds(Number(e.target.value) as VideoDurationSeconds)}
                >
                  <option value={5}>5 seconden</option>
                  <option value={10}>10 seconden</option>
                </select>
              </div>
              <div>
                <Label className="text-xs text-vice-text-muted">Resolutie</Label>
                <select
                  className={`${fieldClass} mt-1`}
                  value={resolution}
                  disabled={processing}
                  onChange={(e) => setResolution(e.target.value as VideoResolution)}
                >
                  <option value="720p">720p (goedkoper)</option>
                  <option value="1080p">1080p</option>
                </select>
              </div>
            </div>
            <div>
              <Label className="text-xs text-vice-text-muted">Motion prompt</Label>
              <textarea
                className={`${fieldClass} mt-1 min-h-[6rem]`}
                value={motionPrompt}
                disabled={processing}
                placeholder="Beschrijf beweging, camera, sfeer… (max 2500 tekens)"
                onChange={(e) => setMotionPrompt(e.target.value)}
              />
            </div>
            <Button
              type="button"
              disabled={busy !== "" || processing || !concept.sourceImagePath || !motionPrompt.trim()}
              onClick={() => void generate()}
            >
              {busy === "gen" || processing ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              Genereer MP4
            </Button>
            {concept.jobStatus === "failed" && concept.jobError ? (
              <p className="text-sm text-red-700">{concept.jobError}</p>
            ) : null}
            {processing ? (
              <p className="text-sm text-vice-text-muted">Kling werkt… dit kan enkele minuten duren.</p>
            ) : null}
          </section>

          <section className="space-y-4 rounded-2xl border border-vice-border bg-vice-surface p-5">
            <h2 className="text-sm font-medium text-vice-text">Startbeeld</h2>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => void uploadSource(e.target.files)}
            />
            <Button type="button" variant="secondary" disabled={busy !== "" || processing} onClick={() => fileRef.current?.click()}>
              {busy === "upload" ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />}
              Upload beeld
            </Button>
            {beeldCompositions.length > 0 ? (
              <div className="flex flex-wrap items-end gap-2">
                <select
                  className={`${fieldClass} min-w-[12rem] flex-1`}
                  value={beeldCompositionId}
                  disabled={processing || busy !== ""}
                  onChange={(e) => setBeeldCompositionId(e.target.value)}
                >
                  <option value="">Beeldmateriaal…</option>
                  {beeldCompositions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title || "Naamloos"}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!beeldCompositionId || processing || busy !== ""}
                  onClick={() => void importBeeld()}
                >
                  Importeren
                </Button>
              </div>
            ) : null}
            {concept.sourceImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={concept.sourceImageUrl} alt="" className="max-h-64 w-full rounded-lg object-contain bg-vice-bg" />
            ) : (
              <p className="text-xs text-vice-text-muted">Upload of importeer een startbeeld vóór genereren.</p>
            )}

            <h2 className="pt-4 text-sm font-medium text-vice-text">Resultaat</h2>
            {concept.outputVideoUrl ? (
              <video src={concept.outputVideoUrl} controls className="w-full rounded-lg bg-black" />
            ) : (
              <p className="text-xs text-vice-text-muted">Nog geen MP4. Status: {concept.jobStatus}</p>
            )}
          </section>
        </div>
      ) : (
        <p className="mt-10 text-sm text-vice-text-muted">Kies &quot;Nieuwe video&quot; om te beginnen.</p>
      )}

      {conceptList.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-sm font-medium text-vice-text">Opgeslagen video&apos;s</h2>
          <ul className="mt-3 divide-y divide-vice-border rounded-xl border border-vice-border bg-vice-surface">
            {conceptList.map((item) => (
              <li key={item.id} className="flex items-center gap-2 px-3 py-2 sm:px-4">
                <Link
                  href={`/klanten/${tenantId}/content/video/${item.id}`}
                  className="min-w-0 flex-1 rounded-md px-1 py-2 text-sm hover:bg-vice-surface-muted/60"
                >
                  <span className="block truncate">{item.internalName || "Naamloze video"}</span>
                  <span className="mt-0.5 block text-xs text-vice-text-muted">
                    {aspectPresetLabel(item.aspectPreset)} · {item.durationSeconds}s · {item.jobStatus}
                  </span>
                </Link>
                <Link
                  href={`/klanten/${tenantId}/content/video/${item.id}`}
                  className="inline-flex size-8 items-center justify-center rounded-md text-vice-text-muted hover:bg-vice-surface-muted"
                  aria-label="Bewerken"
                >
                  <Pencil className="size-4" />
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  className="size-8 p-0"
                  disabled={deletingId === item.id}
                  onClick={() => void deleteConcept(item.id)}
                >
                  {deletingId === item.id ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
