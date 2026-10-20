"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ImageIcon, LoaderCircle, Pencil, Plus, Sparkles, Trash2, Upload } from "lucide-react";
import { SocialPostMockup } from "@/components/content/social-post-mockup";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { BlogConceptSummary, BlogSourceMeeting, BrandContext } from "@/lib/content/blog-types";
import {
  SOCIAL_CHANNELS,
  SOCIAL_FORMATS,
  type SocialCarouselSlide,
  type SocialChannel,
  type SocialFormat,
  type SocialPostConcept,
  type SocialPostConceptSummary,
  type SocialTopicMode,
} from "@/lib/content/social-types";
import {
  createSocialPostConceptAction,
  deleteSocialAssetAction,
  deleteSocialPostConceptAction,
  generateSocialCaptionAction,
  generateSocialVisualAction,
  planSocialCarouselOutlineAction,
  saveSocialPostConceptAction,
  selectSocialAssetAction,
  uploadSocialAssetAction,
} from "@/modules/content/social-actions";

const fieldClass =
  "w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm text-vice-text outline-none focus:border-vice-gold";

export function SocialWorkspace({
  tenantId,
  tenantName,
  brand,
  initial,
  concepts,
  blogs,
  meetings,
}: {
  tenantId: string;
  tenantName: string;
  brand: BrandContext;
  initial: SocialPostConcept | null;
  concepts: SocialPostConceptSummary[];
  blogs: BlogConceptSummary[];
  meetings: BlogSourceMeeting[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [concept, setConcept] = useState<SocialPostConcept | null>(initial);
  const [channels, setChannels] = useState<SocialChannel[]>(initial?.channels ?? ["instagram"]);
  const [format, setFormat] = useState<SocialFormat>(initial?.format ?? "single");
  const [topicMode, setTopicMode] = useState<SocialTopicMode>(initial?.topicMode ?? "manual");
  const [topicText, setTopicText] = useState(initial?.topicText ?? "");
  const [blogConceptId, setBlogConceptId] = useState(initial?.blogConceptId ?? "");
  const [meetingRecordingId, setMeetingRecordingId] = useState(initial?.meetingRecordingId ?? "");
  const [caption, setCaption] = useState(initial?.caption ?? "");
  const [hashtags, setHashtags] = useState(initial?.hashtags ?? "");
  const [visualSubject, setVisualSubject] = useState("");
  const [carouselSlides, setCarouselSlides] = useState<SocialCarouselSlide[]>(() => {
    if (initial?.format !== "carousel" || initial.assets.length === 0) return [];
    return initial.assets.map((asset, index) => ({
      id: crypto.randomUUID(),
      title: asset.altText?.trim() || `Slide ${index + 1}`,
      subject: asset.altText?.trim() || "",
    }));
  });
  const [selectedStyleId, setSelectedStyleId] = useState(brand.styles[0]?.id ?? "");
  const [conceptList, setConceptList] = useState(concepts);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [deletingId, setDeletingId] = useState("");

  function toggleChannel(id: SocialChannel) {
    setChannels((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  async function ensureConcept() {
    if (concept) {
      const saved = await saveSocialPostConceptAction(
        concept.id,
        concept.updatedAt,
        {
          channels,
          format,
          topicMode,
          topicText,
          blogConceptId: topicMode === "blog" ? blogConceptId || null : null,
          meetingRecordingId: topicMode === "meeting" ? meetingRecordingId || null : null,
          caption,
          hashtags,
        },
        { quiet: true },
      );
      if (!saved.ok || !saved.data) {
        setError(saved.ok ? "Opslaan mislukt" : saved.error);
        return null;
      }
      setConcept(saved.data);
      return saved.data;
    }

    const created = await createSocialPostConceptAction({
      tenantId,
      channels,
      format,
      topicMode,
      topicText,
      blogConceptId: topicMode === "blog" ? blogConceptId || null : null,
      meetingRecordingId: topicMode === "meeting" ? meetingRecordingId || null : null,
    });
    if (!created.ok || !created.data) {
      setError(created.ok ? "Concept aanmaken mislukt" : created.error);
      return null;
    }
    setConcept(created.data);
    setCaption(created.data.caption);
    setHashtags(created.data.hashtags);
    router.replace(`/klanten/${tenantId}/content/social/${created.data.id}`);
    return created.data;
  }

  async function saveConcept() {
    setBusy("save");
    setError("");
    setSaveState("saving");
    try {
      const current = await ensureConcept();
      if (!current) {
        setSaveState("failed");
        return;
      }
      if (caption !== current.caption || hashtags !== current.hashtags) {
        const saved = await saveSocialPostConceptAction(current.id, current.updatedAt, {
          caption,
          hashtags,
          channels,
          format,
          topicMode,
          topicText,
          blogConceptId: topicMode === "blog" ? blogConceptId || null : null,
          meetingRecordingId: topicMode === "meeting" ? meetingRecordingId || null : null,
        });
        if (!saved.ok || !saved.data) {
          setError(saved.ok ? "Opslaan mislukt" : saved.error);
          setSaveState("failed");
          return;
        }
        setConcept(saved.data);
      }
      setSaveState("saved");
      router.refresh();
    } finally {
      setBusy("");
    }
  }

  async function planCarouselOutline(
    conceptId: string,
    captionOverride?: string,
  ): Promise<SocialCarouselSlide[] | null> {
    const result = await planSocialCarouselOutlineAction(conceptId, {
      caption: captionOverride,
    });
    if (!result.ok || !result.data) {
      setError(result.ok ? "Outline maken mislukt" : result.error);
      return null;
    }
    setCarouselSlides(result.data);
    return result.data;
  }

  async function generateCaption() {
    setBusy("caption");
    setError("");
    try {
      const current = await ensureConcept();
      if (!current) return;
      const result = await generateSocialCaptionAction(current.id);
      if (!result.ok || !result.data) {
        setError(result.ok ? "Caption genereren mislukt" : result.error);
        return;
      }
      setConcept(result.data);
      setCaption(result.data.caption);
      setHashtags(result.data.hashtags);
      setSaveState("saved");
      if (format === "carousel") {
        setBusy("outline");
        await planCarouselOutline(result.data.id, result.data.caption);
      }
    } finally {
      setBusy("");
    }
  }

  async function generateVisual() {
    setBusy("image");
    setError("");
    try {
      const current = await ensureConcept();
      if (!current) return;

      if (format === "carousel") {
        let slides = carouselSlides.filter((slide) => slide.subject.trim());
        if (slides.length < 2) {
          setBusy("outline");
          const planned = await planCarouselOutline(current.id, caption);
          if (!planned || planned.length < 2) {
            if (planned && planned.length < 2) setError("Outline heeft minstens 2 slides nodig.");
            return;
          }
          slides = planned;
          setBusy("image");
        }
        const result = await generateSocialVisualAction(current.id, {
          styleId: selectedStyleId || undefined,
          slides,
        });
        if (!result.ok || !result.data) {
          setError(result.ok ? "Visuals genereren mislukt" : result.error);
          return;
        }
        setConcept(result.data);
        setSaveState("saved");
        return;
      }

      const result = await generateSocialVisualAction(current.id, {
        styleId: selectedStyleId || undefined,
        subject: visualSubject.trim() || undefined,
      });
      if (!result.ok || !result.data) {
        setError(result.ok ? "Visual genereren mislukt" : result.error);
        return;
      }
      setConcept(result.data);
      setSaveState("saved");
    } finally {
      setBusy("");
    }
  }

  async function refreshCarouselOutline() {
    setBusy("outline");
    setError("");
    try {
      const current = await ensureConcept();
      if (!current) return;
      await planCarouselOutline(current.id, caption);
    } finally {
      setBusy("");
    }
  }

  async function chooseFormat(next: SocialFormat) {
    setFormat(next);
    if (next !== "carousel" || carouselSlides.length > 0 || !caption.trim()) return;
    setBusy("outline");
    setError("");
    try {
      const current = await ensureConcept();
      if (!current) return;
      await planCarouselOutline(current.id, caption);
    } finally {
      setBusy("");
    }
  }

  async function uploadAsset(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusy("upload");
    setError("");
    try {
      const current = await ensureConcept();
      if (!current) return;
      const formData = new FormData();
      formData.set("file", file);
      const result = await uploadSocialAssetAction(current.id, formData);
      if (!result.ok || !result.data) {
        setError(result.ok ? "Upload mislukt" : result.error);
        return;
      }
      setConcept(result.data);
      setSaveState("saved");
    } finally {
      setBusy("");
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function deleteAsset(assetId: string) {
    if (!window.confirm("Deze afbeelding verwijderen?")) return;
    setBusy("delete-asset");
    setError("");
    const result = await deleteSocialAssetAction(assetId);
    setBusy("");
    if (!result.ok || !result.data) {
      setError(result.ok ? "Verwijderen mislukt" : result.error);
      return;
    }
    setConcept(result.data);
  }

  async function deleteConcept(id: string) {
    if (!window.confirm("Dit socialconcept permanent verwijderen?")) return;
    setDeletingId(id);
    setError("");
    const result = await deleteSocialPostConceptAction(id);
    setDeletingId("");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setConceptList((prev) => prev.filter((item) => item.id !== id));
    if (concept?.id === id) {
      setConcept(null);
      router.replace(`/klanten/${tenantId}/content/social`);
    }
    router.refresh();
  }

  const selected = concept?.selectedAsset ?? concept?.assets[0] ?? null;
  const previewAspect =
    format === "reel" ? "aspect-[9/16] max-w-xs mx-auto" : "aspect-square";

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 md:px-10">
      <p className="text-sm text-vice-text-muted">
        <Link href={`/klanten/${tenantId}/content`} className="hover:text-vice-text">
          {tenantName} / Content
        </Link>
        {" / "}
        Socialmediapost
      </p>
      <Link href={`/klanten/${tenantId}/content`} className="mt-2 inline-block text-sm text-vice-gold hover:underline">
        Terug naar Content
      </Link>

      <div className="mt-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl tracking-tight text-vice-text">Socialmediapost</h1>
          <p className="mt-2 text-sm text-vice-text-muted">
            Bereid een post voor je kanalen voor. Opslaan als concept — publiceren volgt later.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-vice-text-muted">
            {saveState === "saving" ? "Opslaan…" : saveState === "saved" ? "Opgeslagen" : "Concept"}
          </span>
          <Button type="button" disabled={busy !== ""} onClick={() => void saveConcept()}>
            {busy === "save" ? <LoaderCircle className="size-4 animate-spin" /> : null}
            Bewaar concept
          </Button>
        </div>
      </div>

      <BrandBar brand={brand} />

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <section className="space-y-6 rounded-2xl border border-vice-border bg-vice-surface p-6">
          <div>
            <Label className="text-sm font-medium">Kanalen</Label>
            <div className="mt-3 flex flex-wrap gap-2">
              {SOCIAL_CHANNELS.map((channel) => {
                const active = channels.includes(channel.id);
                return (
                  <button
                    key={channel.id}
                    type="button"
                    onClick={() => toggleChannel(channel.id)}
                    className={
                      active
                        ? "rounded-md bg-vice-gold px-3 py-1.5 text-sm font-medium text-white"
                        : "rounded-md border border-vice-border px-3 py-1.5 text-sm text-vice-text-muted hover:text-vice-text"
                    }
                  >
                    {channel.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium">Formaat</Label>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {SOCIAL_FORMATS.map((item) => {
                const active = format === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => void chooseFormat(item.id)}
                    className={
                      active
                        ? "rounded-xl border border-vice-gold bg-vice-gold/10 px-3 py-3 text-left"
                        : "rounded-xl border border-vice-border px-3 py-3 text-left hover:border-vice-text-muted"
                    }
                  >
                    <span className="block text-sm font-medium text-vice-text">{item.label}</span>
                    <span className="mt-1 block text-xs text-vice-text-muted">{item.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium">Onderwerp</Label>
            <div className="mt-3 flex flex-wrap gap-2">
              {(
                [
                  ["manual", "Eigen onderwerp"],
                  ["blog", "Blogartikel"],
                  ["meeting", "Meeting"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTopicMode(id)}
                  className={
                    topicMode === id
                      ? "rounded-md bg-vice-gold px-3 py-1.5 text-sm font-medium text-white"
                      : "rounded-md border border-vice-border px-3 py-1.5 text-sm text-vice-text-muted"
                  }
                >
                  {label}
                </button>
              ))}
            </div>

            {topicMode === "manual" ? (
              <textarea
                className={`${fieldClass} mt-3 min-h-24`}
                value={topicText}
                onChange={(event) => setTopicText(event.target.value)}
                placeholder="Waarover gaat deze post?"
              />
            ) : null}

            {topicMode === "blog" ? (
              <div className="mt-3 space-y-2">
                <select
                  className={fieldClass}
                  value={blogConceptId}
                  onChange={(event) => setBlogConceptId(event.target.value)}
                >
                  <option value="">Kies een blogconcept…</option>
                  {blogs.map((blog) => (
                    <option key={blog.id} value={blog.id}>
                      {blog.title || blog.sourceText || "Naamloos blogconcept"}
                    </option>
                  ))}
                </select>
                <textarea
                  className={`${fieldClass} min-h-20`}
                  value={topicText}
                  onChange={(event) => setTopicText(event.target.value)}
                  placeholder="Optionele invalshoek of focus voor de socialpost"
                />
              </div>
            ) : null}

            {topicMode === "meeting" ? (
              <div className="mt-3 space-y-2">
                <select
                  className={fieldClass}
                  value={meetingRecordingId}
                  onChange={(event) => setMeetingRecordingId(event.target.value)}
                >
                  <option value="">Kies een meeting met transcript…</option>
                  {meetings.map((meeting) => (
                    <option key={meeting.id} value={meeting.id}>
                      {meeting.title}
                    </option>
                  ))}
                </select>
                <textarea
                  className={`${fieldClass} min-h-20`}
                  value={topicText}
                  onChange={(event) => setTopicText(event.target.value)}
                  placeholder="Optionele focus uit de meetingnotes"
                />
              </div>
            ) : null}
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-sm font-medium">Caption</Label>
              <Button
                type="button"
                variant="secondary"
                disabled={busy !== "" || !brand.hasVoice || channels.length === 0}
                onClick={() => void generateCaption()}
              >
                {busy === "caption" ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                Genereer caption
              </Button>
            </div>
            {!brand.hasVoice ? (
              <p className="mt-2 text-xs text-amber-800">
                Tone of voice ontbreekt.{" "}
                <Link href={brand.brandHref} className="text-vice-gold underline">
                  Aanvullen bij Brand
                </Link>
              </p>
            ) : null}
            <textarea
              className={`${fieldClass} mt-3 min-h-36`}
              value={caption}
              onChange={(event) => {
                setCaption(event.target.value);
                setSaveState("idle");
              }}
              placeholder="Schrijf of genereer de posttekst…"
            />
            <Label className="mt-4 block text-xs text-vice-text-muted">Hashtags</Label>
            <input
              className={`${fieldClass} mt-1.5`}
              value={hashtags}
              onChange={(event) => {
                setHashtags(event.target.value);
                setSaveState("idle");
              }}
              placeholder="#merk #onderwerp"
            />
          </div>
        </section>

        <section className="rounded-2xl border border-vice-border bg-vice-surface p-6">
          <h2 className="text-lg font-medium">Beeld</h2>
          <p className="mt-1 text-xs text-vice-text-muted">
            {format === "carousel"
              ? "Na de caption verschijnt hier een slide-outline. Upload per slide of genereer alle visuals in één keer."
              : "Upload eigen beelden of genereer met de merkstijl. Publiceren naar kanalen volgt later."}
          </p>

          {brand.styles.length > 0 ? (
            <div className="mt-4">
              <Label className="mb-1.5 block text-xs text-vice-text-muted">Beeldstijl</Label>
              <select
                className={fieldClass}
                value={selectedStyleId || brand.styles[0]?.id || ""}
                disabled={busy !== ""}
                onChange={(event) => setSelectedStyleId(event.target.value)}
              >
                {brand.styles.map((style) => (
                  <option key={style.id} value={style.id}>
                    {style.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {format === "carousel" ? (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="text-xs text-vice-text-muted">Slide-outline</Label>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy !== "" || !caption.trim()}
                  onClick={() => void refreshCarouselOutline()}
                >
                  {busy === "outline" ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  {carouselSlides.length > 0 ? "Vernieuw outline" : "Maak outline uit caption"}
                </Button>
              </div>
              {!caption.trim() ? (
                <p className="rounded-md border border-dashed border-vice-border px-3 py-3 text-xs text-vice-text-muted">
                  Genereer eerst een caption — die wordt hier omgezet naar een outline voor de carrouselbeelden.
                </p>
              ) : null}
              {topicMode === "blog" ? (
                <p className="text-xs text-vice-text-muted">
                  Bij een blogartikel gebruikt de outline bij voorkeur elke h2 als aparte slide.
                </p>
              ) : null}
              {carouselSlides.length > 0 ? (
                <ol className="space-y-3">
                  {carouselSlides.map((slide, index) => {
                    const asset = concept?.assets[index] ?? null;
                    return (
                      <li
                        key={slide.id}
                        className="rounded-xl border border-vice-border bg-vice-bg/60 p-3"
                      >
                        <div className="flex items-start gap-3">
                          <div className="size-14 shrink-0 overflow-hidden rounded-md border border-vice-border bg-vice-bg">
                            {asset?.url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={asset.url}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center text-xs text-vice-text-muted">
                                {index + 1}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="w-14 shrink-0 text-xs font-medium text-vice-text-muted">
                                Slide {index + 1}
                              </span>
                              <input
                                className={`${fieldClass} min-w-0 flex-1 py-1.5`}
                                value={slide.title}
                                disabled={busy !== ""}
                                onChange={(event) => {
                                  const title = event.target.value;
                                  setCarouselSlides((prev) =>
                                    prev.map((item) =>
                                      item.id === slide.id ? { ...item, title } : item,
                                    ),
                                  );
                                }}
                                placeholder="Slide-titel"
                              />
                              <button
                                type="button"
                                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-vice-text-muted hover:text-vice-danger"
                                disabled={busy !== "" || carouselSlides.length <= 2}
                                title="Slide verwijderen"
                                onClick={() =>
                                  setCarouselSlides((prev) => prev.filter((item) => item.id !== slide.id))
                                }
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </div>
                            <textarea
                              className={`${fieldClass} min-h-14`}
                              value={slide.subject}
                              disabled={busy !== ""}
                              onChange={(event) => {
                                const subject = event.target.value;
                                setCarouselSlides((prev) =>
                                  prev.map((item) =>
                                    item.id === slide.id ? { ...item, subject } : item,
                                  ),
                                );
                              }}
                              placeholder="Waarover gaat dit beeld?"
                            />
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : null}
              {carouselSlides.length > 0 && carouselSlides.length < 8 ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy !== ""}
                  onClick={() =>
                    setCarouselSlides((prev) => [
                      ...prev,
                      {
                        id: crypto.randomUUID(),
                        title: `Slide ${prev.length + 1}`,
                        subject: "",
                      },
                    ])
                  }
                >
                  <Plus className="size-4" />
                  Slide toevoegen
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="mt-4">
              <Label className="mb-1.5 block text-xs text-vice-text-muted">
                Waarover gaat de foto? (optioneel)
              </Label>
              <textarea
                className={`${fieldClass} min-h-16`}
                value={visualSubject}
                disabled={busy !== ""}
                onChange={(event) => setVisualSubject(event.target.value)}
                placeholder="Leeg = op basis van onderwerp/caption"
              />
            </div>
          )}

          {format !== "carousel" ? (
            <div className={`mt-4 overflow-hidden rounded-xl border border-vice-border bg-vice-bg ${previewAspect}`}>
              {selected?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selected.url} alt={selected.altText || "Social visual"} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 text-vice-text-muted">
                  <ImageIcon className="size-8" />
                  <span className="text-xs">Nog geen beeld</span>
                </div>
              )}
            </div>
          ) : null}

          {format === "carousel" && concept && concept.assets.length > 0 ? (
            <ul className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {concept.assets.map((asset, index) => (
                <li key={asset.id}>
                  <button
                    type="button"
                    className={
                      asset.id === concept.selectedAssetId
                        ? "block size-16 overflow-hidden rounded-md ring-2 ring-vice-gold"
                        : "block size-16 overflow-hidden rounded-md border border-vice-border"
                    }
                    onClick={() => {
                      void selectSocialAssetAction(concept.id, concept.updatedAt, asset.id).then((result) => {
                        if (result.ok && result.data) setConcept(result.data);
                      });
                    }}
                  >
                    {asset.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={asset.url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full items-center justify-center text-xs">{index + 1}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(event) => void uploadAsset(event.target.files)}
            />
            <Button type="button" variant="secondary" disabled={busy !== ""} onClick={() => fileRef.current?.click()}>
              {busy === "upload" ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />}
              Upload
            </Button>
            <Button
              type="button"
              disabled={
                busy !== ""
                || !brand.hasVisual
                || (format === "carousel" && !caption.trim() && carouselSlides.length < 2)
              }
              title={!brand.hasVisual ? "Beeldstijl ontbreekt" : undefined}
              onClick={() => void generateVisual()}
            >
              {busy === "image" || busy === "outline" ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {format === "carousel"
                ? `Genereer ${carouselSlides.length > 0 ? `${carouselSlides.length} visuals` : "visuals"}`
                : "Genereer visual"}
            </Button>
            {selected && format !== "carousel" ? (
              <Button
                type="button"
                variant="ghost"
                disabled={busy !== ""}
                onClick={() => void deleteAsset(selected.id)}
              >
                <Trash2 className="size-4" />
                Verwijder beeld
              </Button>
            ) : null}
          </div>
          {format === "reel" ? (
            <p className="mt-3 text-xs text-vice-text-muted">
              Reel gebruikt voorlopig een verticaal beeld. Video-upload volgt later.
            </p>
          ) : null}
          {format === "carousel" ? (
            <p className="mt-3 text-xs text-vice-text-muted">
              Tip: pas de outline aan vóór je genereert. Elke slide wordt een apart beeld in de merkstijl.
            </p>
          ) : null}
        </section>
      </div>

      {concept && concept.assets.length > 0 ? (
        <SocialPostMockup
          brandName={brand.brandName || brand.tenantName || tenantName}
          channels={channels}
          format={format}
          caption={caption}
          hashtags={hashtags}
          assets={concept.assets}
        />
      ) : null}

      {conceptList.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-sm font-medium text-vice-text">Mijn socialconcepten</h2>
          <ul className="mt-3 divide-y divide-vice-border rounded-xl border border-vice-border bg-vice-surface">
            {conceptList.map((item) => (
              <li key={item.id} className="flex items-center gap-2 px-3 py-2 sm:px-4">
                <Link
                  href={`/klanten/${tenantId}/content/social/${item.id}`}
                  className="min-w-0 flex-1 rounded-md px-1 py-2 text-sm hover:bg-vice-surface-muted/60"
                >
                  <span className="block truncate">
                    {item.caption || item.topicText || "Naamloos concept"}
                  </span>
                  <span className="mt-0.5 block text-xs text-vice-text-muted">
                    {item.format} · {item.channels.join(", ") || "geen kanaal"} ·{" "}
                    {new Date(item.updatedAt).toLocaleString("nl-BE", { timeZone: "Europe/Brussels" })}
                  </span>
                </Link>
                <Link
                  href={`/klanten/${tenantId}/content/social/${item.id}`}
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
                  {deletingId === item.id ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function BrandBar({ brand }: { brand: BrandContext }) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-vice-border bg-vice-surface px-4 py-3 text-sm">
      <span className="font-medium">
        {brand.brandName || brand.tenantName}
        {brand.versionNumber != null ? ` · Brand v${brand.versionNumber}` : ""}
      </span>
      <span className="text-xs text-vice-text-muted">
        {brand.hasVoice ? "Tone of voice gekoppeld" : "Tone of voice ontbreekt"}
      </span>
      <span className="text-xs text-vice-text-muted">
        {brand.hasVisual ? "Beeldstijl gekoppeld" : "Beeldstijl ontbreekt"}
      </span>
      <Link href={brand.brandHref} className="ml-auto text-xs text-vice-gold">
        Merkrichtlijnen
      </Link>
    </div>
  );
}
