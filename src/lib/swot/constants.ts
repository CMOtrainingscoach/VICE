export const SWOT_FRAMEWORK_INDEX = 4;

export const SWOT_ROUTE = "swot" as const;

export const SWOT_LABEL = "SWOT";

export const SWOT_QUADRANTS = ["strength", "weakness", "opportunity", "threat"] as const;

export type SwotQuadrant = (typeof SWOT_QUADRANTS)[number];

export type SwotVersionStatus = "not_started" | "draft" | "approved";

export type SwotRefType =
  | "tenant_profile"
  | "meeting"
  | "pestel_insight"
  | "porter_scope"
  | "porter_force"
  | "porter_factor"
  | "five_c_item"
  | "five_c_synthesis"
  | "manual";

export const SWOT_QUADRANT_META: Record<
  SwotQuadrant,
  {
    label: string;
    subtitle: string;
    cardClass: string;
    iconTone: string;
  }
> = {
  strength: {
    label: "Sterktes",
    subtitle: "Intern · wat werkt in jouw voordeel",
    cardClass: "border-emerald-500/35 bg-emerald-500/10 dark:bg-emerald-950/30",
    iconTone: "text-emerald-700 dark:text-emerald-300",
  },
  weakness: {
    label: "Zwaktes",
    subtitle: "Intern · waar je kwetsbaar bent",
    cardClass: "border-rose-500/35 bg-rose-500/10 dark:bg-rose-950/30",
    iconTone: "text-rose-700 dark:text-rose-300",
  },
  opportunity: {
    label: "Kansen",
    subtitle: "Extern · wat je kunt benutten",
    cardClass: "border-sky-500/35 bg-sky-500/10 dark:bg-sky-950/30",
    iconTone: "text-sky-700 dark:text-sky-300",
  },
  threat: {
    label: "Bedreigingen",
    subtitle: "Extern · wat je positionering kan schaden",
    cardClass: "border-amber-500/40 bg-amber-500/10 dark:bg-amber-950/30",
    iconTone: "text-amber-800 dark:text-amber-200",
  },
};

export const SWOT_STATUS_LABELS: Record<SwotVersionStatus, string> = {
  not_started: "Nog niet gestart",
  draft: "Concept",
  approved: "Goedgekeurd",
};
