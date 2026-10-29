"use client";

import { googleFontsCssHref, fontStack } from "@/lib/brand/fonts";
import type { ClientBrand, TypeRole } from "@/lib/brand/types";
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
  const primary = colors.find((c) => c.role === "primary")?.hex ?? colors[0]?.hex ?? "#c9a227";
  const text = colors.find((c) => c.role === "text")?.hex ?? "#1a1a1a";
  const bg = colors.find((c) => c.role === "background")?.hex ?? "#fafafa";
  const typography = brand?.typography;
  const bodyFamily = typography?.body?.family ?? "Inter";
  const h1Family = typography?.h1?.family ?? bodyFamily;

  const googleHref = googleFontsCssHref([h1Family, bodyFamily].filter(Boolean));

  return (
    <div
      className={embed ? "min-h-0 bg-transparent p-0" : "min-h-screen px-4 py-10"}
      style={
        {
          "--survey-primary": primary,
          "--survey-text": text,
          "--survey-bg": bg,
          backgroundColor: embed ? undefined : bg,
          color: text,
          fontFamily: fontStack(bodyFamily),
        } as React.CSSProperties
      }
    >
      {googleHref ? <link rel="stylesheet" href={googleHref} /> : null}
      <div className={embed ? "w-full" : "mx-auto w-full max-w-lg"}>
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
  return { fontFamily: fontStack(h1) };
}
