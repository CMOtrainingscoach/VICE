import {
  normalizeSurveyCardLinkUrl,
  surveyCardImagePublicUrl,
  surveyCardLinkDisplayText,
} from "@/lib/survey/survey-card-assets";
import type { SurveyNodeData } from "@/lib/survey/survey-types";

const surveyCardImageClassName = "block w-full max-w-full h-auto rounded-lg";

export function SurveyCardExtras({
  data,
  className = "mt-4",
}: {
  data: Pick<
    SurveyNodeData,
    "cardImagePath" | "cardImageDescription" | "cardLinkUrl" | "cardLinkLabel"
  >;
  className?: string;
}) {
  const imageUrl = surveyCardImagePublicUrl(data.cardImagePath);
  const linkUrl = normalizeSurveyCardLinkUrl(data.cardLinkUrl);
  const linkText = surveyCardLinkDisplayText(data.cardLinkLabel);
  const imageCaption = data.cardImageDescription?.trim();

  if (!imageUrl && !imageCaption && !(linkUrl && linkText)) return null;

  return (
    <div className={`space-y-3 ${className}`}>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- tenant-uploaded survey card art (public bucket)
        <img src={imageUrl} alt={imageCaption ?? ""} className={surveyCardImageClassName} />
      ) : null}
      {imageCaption ? (
        <p className="text-sm text-[color:var(--survey-text-muted)]">{imageCaption}</p>
      ) : null}
      {linkUrl && linkText ? (
        <a
          href={linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex text-sm font-medium text-[color:var(--survey-primary)] underline-offset-2 hover:underline"
        >
          {linkText}
        </a>
      ) : null}
    </div>
  );
}
