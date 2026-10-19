"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Repeat2,
  Send,
  Share,
  ThumbsUp,
} from "lucide-react";
import {
  SOCIAL_CHANNELS,
  type SocialChannel,
  type SocialFormat,
  type SocialPostAsset,
} from "@/lib/content/social-types";

type Props = {
  brandName: string;
  channels: SocialChannel[];
  format: SocialFormat;
  caption: string;
  hashtags: string;
  assets: SocialPostAsset[];
};

function handleFromName(name: string) {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 18);
  return slug || "merk";
}

function Avatar({ name }: { name: string }) {
  const letter = (name.trim()[0] || "V").toUpperCase();
  return (
    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-vice-gold text-sm font-semibold text-white">
      {letter}
    </div>
  );
}

function MediaStage({
  assets,
  format,
  slideIndex,
  onSlideChange,
}: {
  assets: SocialPostAsset[];
  format: SocialFormat;
  slideIndex: number;
  onSlideChange: (index: number) => void;
}) {
  const urls = assets.map((asset) => asset.url).filter((url): url is string => Boolean(url));
  const current = urls[slideIndex] ?? urls[0] ?? null;
  const isCarousel = format === "carousel" && urls.length > 1;
  const isReel = format === "reel";

  return (
    <div className="relative">
      <div
        className={
          isReel
            ? "relative mx-auto aspect-[9/16] max-h-[420px] w-full max-w-[240px] overflow-hidden bg-neutral-900"
            : "relative aspect-square w-full overflow-hidden bg-neutral-100"
        }
      >
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full min-h-48 items-center justify-center text-sm text-neutral-400">
            Geen beeld
          </div>
        )}

        {isCarousel ? (
          <>
            <button
              type="button"
              aria-label="Vorige slide"
              className="absolute left-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white disabled:opacity-30"
              disabled={slideIndex <= 0}
              onClick={() => onSlideChange(slideIndex - 1)}
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Volgende slide"
              className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white disabled:opacity-30"
              disabled={slideIndex >= urls.length - 1}
              onClick={() => onSlideChange(slideIndex + 1)}
            >
              <ChevronRight className="size-4" />
            </button>
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
              {urls.map((_, index) => (
                <button
                  key={index}
                  type="button"
                  aria-label={`Slide ${index + 1}`}
                  className={
                    index === slideIndex
                      ? "size-1.5 rounded-full bg-white"
                      : "size-1.5 rounded-full bg-white/45"
                  }
                  onClick={() => onSlideChange(index)}
                />
              ))}
            </div>
            <span className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white">
              {slideIndex + 1}/{urls.length}
            </span>
          </>
        ) : null}

        {isReel ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/55 to-transparent" />
        ) : null}
      </div>
    </div>
  );
}

function InstagramMockup({
  brandName,
  caption,
  hashtags,
  assets,
  format,
  slideIndex,
  onSlideChange,
}: {
  brandName: string;
  caption: string;
  hashtags: string;
  assets: SocialPostAsset[];
  format: SocialFormat;
  slideIndex: number;
  onSlideChange: (index: number) => void;
}) {
  const handle = handleFromName(brandName);
  const body = [caption.trim(), hashtags.trim()].filter(Boolean).join("\n\n");

  if (format === "reel") {
    return (
      <div className="mx-auto w-full max-w-[280px] overflow-hidden rounded-[1.75rem] border border-neutral-800 bg-black shadow-lg">
        <div className="flex items-center justify-between px-4 py-3 text-white">
          <span className="text-sm font-semibold">Reels</span>
          <MoreHorizontal className="size-4" />
        </div>
        <MediaStage assets={assets} format={format} slideIndex={slideIndex} onSlideChange={onSlideChange} />
        <div className="space-y-2 px-4 py-3 text-white">
          <div className="flex items-center gap-3">
            <Heart className="size-5" />
            <MessageCircle className="size-5" />
            <Send className="size-5" />
            <Bookmark className="ml-auto size-5" />
          </div>
          <p className="text-sm font-semibold">@{handle}</p>
          {body ? <p className="line-clamp-4 whitespace-pre-wrap text-sm text-white/90">{body}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <Avatar name={brandName} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-neutral-900">{handle}</p>
        </div>
        <MoreHorizontal className="size-4 text-neutral-500" />
      </div>
      <MediaStage assets={assets} format={format} slideIndex={slideIndex} onSlideChange={onSlideChange} />
      <div className="space-y-2 px-3 py-3">
        <div className="flex items-center gap-3 text-neutral-900">
          <Heart className="size-5" />
          <MessageCircle className="size-5" />
          <Send className="size-5" />
          <Bookmark className="ml-auto size-5" />
        </div>
        <p className="text-sm font-semibold text-neutral-900">128 vind-ik-leuks</p>
        {body ? (
          <p className="whitespace-pre-wrap text-sm text-neutral-800">
            <span className="font-semibold">{handle}</span> {caption.trim()}
            {hashtags.trim() ? (
              <>
                {"\n"}
                <span className="text-sky-700">{hashtags.trim()}</span>
              </>
            ) : null}
          </p>
        ) : (
          <p className="text-sm text-neutral-400">Nog geen caption</p>
        )}
      </div>
    </div>
  );
}

function LinkedInMockup({
  brandName,
  caption,
  hashtags,
  assets,
  format,
  slideIndex,
  onSlideChange,
}: {
  brandName: string;
  caption: string;
  hashtags: string;
  assets: SocialPostAsset[];
  format: SocialFormat;
  slideIndex: number;
  onSlideChange: (index: number) => void;
}) {
  const body = [caption.trim(), hashtags.trim()].filter(Boolean).join("\n\n");
  return (
    <div className="mx-auto w-full max-w-md overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div className="flex items-start gap-3 px-4 py-3">
        <Avatar name={brandName} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-neutral-900">{brandName}</p>
          <p className="text-xs text-neutral-500">Nu · Voor iedereen</p>
        </div>
        <MoreHorizontal className="size-4 text-neutral-500" />
      </div>
      {body ? (
        <p className="whitespace-pre-wrap px-4 pb-3 text-sm text-neutral-800">{body}</p>
      ) : (
        <p className="px-4 pb-3 text-sm text-neutral-400">Nog geen caption</p>
      )}
      <MediaStage
        assets={assets}
        format={format === "reel" ? "single" : format}
        slideIndex={slideIndex}
        onSlideChange={onSlideChange}
      />
      <div className="flex items-center justify-between border-t border-neutral-100 px-2 py-2 text-xs font-medium text-neutral-600">
        <span className="inline-flex items-center gap-1.5 px-2 py-1.5">
          <ThumbsUp className="size-4" /> Interessant
        </span>
        <span className="inline-flex items-center gap-1.5 px-2 py-1.5">
          <MessageCircle className="size-4" /> Commentaar
        </span>
        <span className="inline-flex items-center gap-1.5 px-2 py-1.5">
          <Repeat2 className="size-4" /> Delen
        </span>
        <span className="inline-flex items-center gap-1.5 px-2 py-1.5">
          <Send className="size-4" /> Versturen
        </span>
      </div>
    </div>
  );
}

function FacebookMockup({
  brandName,
  caption,
  hashtags,
  assets,
  format,
  slideIndex,
  onSlideChange,
}: {
  brandName: string;
  caption: string;
  hashtags: string;
  assets: SocialPostAsset[];
  format: SocialFormat;
  slideIndex: number;
  onSlideChange: (index: number) => void;
}) {
  const body = [caption.trim(), hashtags.trim()].filter(Boolean).join("\n\n");
  return (
    <div className="mx-auto w-full max-w-md overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div className="flex items-start gap-3 px-4 py-3">
        <Avatar name={brandName} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-neutral-900">{brandName}</p>
          <p className="text-xs text-neutral-500">Zojuist · Openbaar</p>
        </div>
        <MoreHorizontal className="size-4 text-neutral-500" />
      </div>
      {body ? (
        <p className="whitespace-pre-wrap px-4 pb-3 text-sm text-neutral-800">{body}</p>
      ) : (
        <p className="px-4 pb-3 text-sm text-neutral-400">Nog geen caption</p>
      )}
      <MediaStage
        assets={assets}
        format={format === "reel" ? "single" : format}
        slideIndex={slideIndex}
        onSlideChange={onSlideChange}
      />
      <div className="flex items-center justify-around border-t border-neutral-100 px-2 py-2 text-sm font-medium text-neutral-600">
        <span className="inline-flex items-center gap-1.5 px-2 py-1.5">
          <ThumbsUp className="size-4" /> Vind ik leuk
        </span>
        <span className="inline-flex items-center gap-1.5 px-2 py-1.5">
          <MessageCircle className="size-4" /> Reageren
        </span>
        <span className="inline-flex items-center gap-1.5 px-2 py-1.5">
          <Share className="size-4" /> Delen
        </span>
      </div>
    </div>
  );
}

function TikTokMockup({
  brandName,
  caption,
  hashtags,
  assets,
  slideIndex,
  onSlideChange,
}: {
  brandName: string;
  caption: string;
  hashtags: string;
  assets: SocialPostAsset[];
  slideIndex: number;
  onSlideChange: (index: number) => void;
}) {
  const handle = handleFromName(brandName);
  const body = [caption.trim(), hashtags.trim()].filter(Boolean).join(" ");
  return (
    <div className="mx-auto w-full max-w-[280px] overflow-hidden rounded-[1.75rem] border border-neutral-800 bg-black shadow-lg">
      <MediaStage
        assets={assets}
        format="reel"
        slideIndex={slideIndex}
        onSlideChange={onSlideChange}
      />
      <div className="space-y-2 px-4 py-3 text-white">
        <p className="text-sm font-semibold">@{handle}</p>
        {body ? <p className="line-clamp-4 text-sm text-white/90">{body}</p> : (
          <p className="text-sm text-white/50">Nog geen caption</p>
        )}
        <p className="truncate text-xs text-white/60">♪ Origineel geluid — {brandName}</p>
      </div>
    </div>
  );
}

function XMockup({
  brandName,
  caption,
  hashtags,
  assets,
  format,
  slideIndex,
  onSlideChange,
}: {
  brandName: string;
  caption: string;
  hashtags: string;
  assets: SocialPostAsset[];
  format: SocialFormat;
  slideIndex: number;
  onSlideChange: (index: number) => void;
}) {
  const handle = handleFromName(brandName);
  const body = [caption.trim(), hashtags.trim()].filter(Boolean).join("\n\n");
  return (
    <div className="mx-auto w-full max-w-md overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div className="flex gap-3 px-4 py-3">
        <Avatar name={brandName} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
            <span className="font-semibold text-neutral-900">{brandName}</span>
            <span className="text-neutral-500">@{handle}</span>
            <span className="text-neutral-400">· nu</span>
          </div>
          {body ? (
            <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-900">{body}</p>
          ) : (
            <p className="mt-1 text-sm text-neutral-400">Nog geen caption</p>
          )}
          <div className="mt-3 overflow-hidden rounded-2xl border border-neutral-200">
            <MediaStage
              assets={assets}
              format={format === "reel" ? "single" : format}
              slideIndex={slideIndex}
              onSlideChange={onSlideChange}
            />
          </div>
          <div className="mt-3 flex items-center justify-between text-neutral-500">
            <MessageCircle className="size-4" />
            <Repeat2 className="size-4" />
            <Heart className="size-4" />
            <Share className="size-4" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function SocialPostMockup({
  brandName,
  channels,
  format,
  caption,
  hashtags,
  assets,
}: Props) {
  const previewChannels = useMemo(() => {
    if (channels.length > 0) return channels;
    return ["instagram"] as SocialChannel[];
  }, [channels]);

  const [previewChannel, setPreviewChannel] = useState<SocialChannel>(previewChannels[0]!);
  const [slideIndex, setSlideIndex] = useState(0);

  useEffect(() => {
    if (!previewChannels.includes(previewChannel)) {
      setPreviewChannel(previewChannels[0]!);
    }
  }, [previewChannels, previewChannel]);

  useEffect(() => {
    setSlideIndex(0);
  }, [assets.length, format]);

  if (assets.length === 0) return null;

  const displayName = brandName.trim() || "Merk";
  const channelLabel =
    SOCIAL_CHANNELS.find((item) => item.id === previewChannel)?.label ?? previewChannel;

  return (
    <section className="mt-8 rounded-2xl border border-vice-border bg-vice-surface p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-vice-text">Voorbeeld op kanaal</h2>
          <p className="mt-1 text-xs text-vice-text-muted">
            Zo zou de post er ongeveer uitzien op {channelLabel}
            {format === "carousel" ? " als carrousel" : format === "reel" ? " als reel" : ""}.
          </p>
        </div>
        {previewChannels.length > 1 ? (
          <div className="flex flex-wrap gap-1.5">
            {previewChannels.map((channel) => {
              const label = SOCIAL_CHANNELS.find((item) => item.id === channel)?.label ?? channel;
              const active = channel === previewChannel;
              return (
                <button
                  key={channel}
                  type="button"
                  onClick={() => setPreviewChannel(channel)}
                  className={
                    active
                      ? "rounded-md bg-vice-gold px-2.5 py-1 text-xs font-medium text-white"
                      : "rounded-md border border-vice-border px-2.5 py-1 text-xs text-vice-text-muted hover:text-vice-text"
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="mt-6 rounded-xl bg-vice-bg/70 px-3 py-6 sm:px-6">
        {previewChannel === "instagram" ? (
          <InstagramMockup
            brandName={displayName}
            caption={caption}
            hashtags={hashtags}
            assets={assets}
            format={format}
            slideIndex={slideIndex}
            onSlideChange={setSlideIndex}
          />
        ) : null}
        {previewChannel === "linkedin" ? (
          <LinkedInMockup
            brandName={displayName}
            caption={caption}
            hashtags={hashtags}
            assets={assets}
            format={format}
            slideIndex={slideIndex}
            onSlideChange={setSlideIndex}
          />
        ) : null}
        {previewChannel === "facebook" ? (
          <FacebookMockup
            brandName={displayName}
            caption={caption}
            hashtags={hashtags}
            assets={assets}
            format={format}
            slideIndex={slideIndex}
            onSlideChange={setSlideIndex}
          />
        ) : null}
        {previewChannel === "tiktok" ? (
          <TikTokMockup
            brandName={displayName}
            caption={caption}
            hashtags={hashtags}
            assets={assets}
            slideIndex={slideIndex}
            onSlideChange={setSlideIndex}
          />
        ) : null}
        {previewChannel === "x" ? (
          <XMockup
            brandName={displayName}
            caption={caption}
            hashtags={hashtags}
            assets={assets}
            format={format}
            slideIndex={slideIndex}
            onSlideChange={setSlideIndex}
          />
        ) : null}
      </div>
    </section>
  );
}
