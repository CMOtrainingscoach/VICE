"use client";

import { googleFontsCssHref, fontStack } from "@/lib/brand/fonts";
import type { ClientBrand, TypeRole } from "@/lib/brand/types";
import { resolveSurveyBrandColors } from "@/lib/survey/survey-contrast";
import type { SurveySettings } from "@/lib/survey/survey-types";

type BrandLike = Partial<ClientBrand> | SurveySettings["brandSnapshot"];

export function SurveyBrandedShell({
  brand,
  embed,
  children,
}: {
  brand: BrandLike | null | undefined;
  embed?: boolean;
  children: React.ReactNode;
}) {
  const colors = brand?.colors ?? [];
  const resolved = resolveSurveyBrandColors({
    primary: colors.find((c) => c.role === "primary")?.hex ?? colors[0]?.hex,
    text: colors.find((c) => c.role === "text")?.hex,
    background: colors.find((c) => c.role === "background")?.hex,
  });

  const typography = brand?.typography;
  const bodyFamily = typography?.body?.family ?? "Inter";
  const h1Family = typography?.h1?.family ?? bodyFamily;

  const googleHref = googleFontsCssHref([h1Family, bodyFamily].filter(Boolean));

  const surfaceStyle = {
    "--survey-primary": resolved.primary,
    "--survey-text": resolved.text,
    "--survey-text-muted": resolved.textMuted,
    "--survey-bg": resolved.background,
    "--survey-on-primary": resolved.onPrimary,
    "--survey-field-bg": resolved.fieldBackground,
    "--survey-field-text": resolved.fieldText,
    "--survey-field-border": resolved.fieldBorder,
    "--survey-error": resolved.errorText,
    backgroundColor: resolved.background,
    color: resolved.text,
    fontFamily: fontStack(bodyFamily),
  } as React.CSSProperties;

  return (
    <div className={embed ? "min-h-0 bg-transparent p-0" : "min-h-screen px-4 py-10"} style={embed ? undefined : surfaceStyle}>
      {googleHref ? <link rel="stylesheet" href={googleHref} /> : null}
      <div
        className={embed ? "mx-auto w-full max-w-lg rounded-xl px-5 py-6 shadow-sm" : "mx-auto w-full max-w-lg"}
        style={embed ? surfaceStyle : undefined}
      >
        {!embed && brand?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brand.logoUrl} alt="" className="mb-8 h-10 w-auto object-contain" />
        ) : null}
        {children}
      </div>
    </div>
  );
}

export function surveyHeadingStyle(typography: Partial<Record<TypeRole, { family?: string }>> | undefined) {
  const h1 = typography?.h1?.family ?? "Inter";
  return { fontFamily: fontStack(h1), color: "var(--survey-text)" };
}

export function surveyBrandButtonClassName(extra?: string) {
  return [
    "bg-[color:var(--survey-primary)] text-[color:var(--survey-on-primary)] hover:opacity-90",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}
