export const PORTER_FRAMEWORK_INDEX = 2;

export const PORTER_FORCES = [
  "rivalry",
  "new_entrants",
  "suppliers",
  "buyers",
  "substitutes",
] as const;

export type PorterForceKey = (typeof PORTER_FORCES)[number];

export type PorterIntensity = "low" | "medium" | "high" | "unknown";

export type PorterVersionStatus =
  | "not_started"
  | "research_running"
  | "draft"
  | "in_review"
  | "approved"
  | "needs_revision";

export const PORTER_STATUS_LABELS: Record<PorterVersionStatus, string> = {
  not_started: "Nog niet gestart",
  research_running: "Onderzoek bezig",
  draft: "Concept",
  in_review: "Ter beoordeling",
  approved: "Goedgekeurd",
  needs_revision: "Herziening nodig",
};

export const PORTER_FORCE_META: Record<
  PorterForceKey,
  {
    label: string;
    shortLabel: string;
    question: string;
    gridArea: string;
  }
> = {
  rivalry: {
    label: "Concurrentiestrijd tussen bestaande aanbieders",
    shortLabel: "Concurrentiestrijd",
    question: "Hoe intens is de strijd tussen bestaande spelers?",
    gridArea: "center",
  },
  new_entrants: {
    label: "Dreiging van nieuwe toetreders",
    shortLabel: "Nieuwe toetreders",
    question: "Hoe makkelijk kunnen nieuwe spelers de markt betreden?",
    gridArea: "top",
  },
  suppliers: {
    label: "Onderhandelingsmacht van leveranciers",
    shortLabel: "Leveranciers",
    question: "Hoeveel macht hebben leveranciers in deze markt?",
    gridArea: "left",
  },
  buyers: {
    label: "Onderhandelingsmacht van afnemers",
    shortLabel: "Afnemers",
    question: "Hoeveel keuze en macht hebben klanten?",
    gridArea: "right",
  },
  substitutes: {
    label: "Dreiging van substituten",
    shortLabel: "Substituten",
    question: "Welke alternatieven lossen dezelfde behoefte op?",
    gridArea: "bottom",
  },
};

export const PORTER_INTENSITY_LABELS: Record<PorterIntensity, string> = {
  low: "Laag",
  medium: "Middel",
  high: "Hoog",
  unknown: "Onbekend",
};

export function porterForceHasContent(force: {
  intensity: string;
  motivation: string;
  headline_factor: string;
}): boolean {
  return (
    force.intensity !== "unknown"
    || force.motivation.trim().length >= 20
    || force.headline_factor.trim().length >= 5
  );
}

export function porterIntensityBadgeClass(intensity: PorterIntensity): string {
  switch (intensity) {
    case "high":
      return "bg-red-500/15 text-red-700 dark:text-red-300";
    case "medium":
      return "bg-amber-500/15 text-amber-800 dark:text-amber-200";
    case "low":
      return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200";
    default:
      return "bg-vice-surface-muted text-vice-text-muted";
  }
}
