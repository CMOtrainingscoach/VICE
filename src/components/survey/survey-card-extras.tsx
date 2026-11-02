import {
  normalizeSurveyCardLinkUrl,
  surveyCardImagePublicUrl,
  surveyCardLinkLabel,
} from "@/lib/survey/survey-card-assets";
import type { SurveyNodeData } from "@/lib/survey/survey-types";

export function SurveyCardExtras({
  data,
  className = "mt-4",
}: {
  data: Pick<SurveyNodeData, "cardImagePath" | "cardLinkUrl" | "cardLinkLabel">;
  className?: string;
}) {
  const imageUrl = surveyCardImagePublicUrl(data.cardImagePath);
  const linkUrl = normalizeSurveyCardLinkUrl(data.cardLinkUrl);
  if (!imageUrl && !linkUrl) return null;

  return (
    <div className={`space-y-4 ${className}`}>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- tenant-uploaded survey card art (public bucket)
        <img
          src={imageUrl}
          alt=""
          className="max-h-64 w-full rounded-lg object-cover object-center"
        />
      ) : null}
      {linkUrl ? (
        <a
          href={linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex text-sm font-medium text-[color:var(--survey-primary)] underline-offset-2 hover:underline"
        >
          {surveyCardLinkLabel(linkUrl, data.cardLinkLabel)}
        </a>
      ) : null}
    </div>
  );
}
