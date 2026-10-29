import type { ClientBrand } from "@/lib/brand/types";

export const SURVEY_MIGRATION =
  "Enquête-database ontbreekt. Voer de nieuwste Supabase-migraties uit (surveys).";

export type SurveyStatus = "draft" | "published" | "closed";

export type SurveyNodeType =
  | "welcome"
  | "title_screen"
  | "thank_you"
  | "short_text"
  | "long_text"
  | "multiple_choice"
  | "dropdown"
  | "radio"
  | "rating"
  | "contact";

export type SurveyOption = { id: string; label: string };

export type SurveyNodeData = {
  screenTitle: string;
  screenDescription: string;
  questionLabel?: string;
  buttonLabel?: string;
  required?: boolean;
  options?: SurveyOption[];
  scaleMin?: number;
  scaleMax?: number;
  scaleMinLabel?: string;
  scaleMaxLabel?: string;
};

export type SurveyNode = {
  id: string;
  type: SurveyNodeType;
  position: { x: number; y: number };
  data: SurveyNodeData;
};

export type SurveyEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  label?: string;
};

export type SurveySettings = {
  askContact?: boolean;
  contactRequired?: boolean;
  privacyText?: string;
  brandSnapshot?: Partial<ClientBrand> | null;
};

export type SurveyDefinition = {
  version: number;
  nodes: SurveyNode[];
  edges: SurveyEdge[];
  settings: SurveySettings;
};

export type SurveySummary = {
  id: string;
  tenantId: string;
  title: string;
  status: SurveyStatus;
  publicSlug: string | null;
  responseCount: number;
  publishedAt: string | null;
  updatedAt: string;
  createdAt: string;
};

export type Survey = SurveySummary & {
  definition: SurveyDefinition;
};

export type SurveyResponseRow = {
  id: string;
  submittedAt: string;
  answers: Record<string, unknown>;
  contact: { name?: string; email?: string } | null;
  definitionVersion: number;
};

export type PublishedSurvey = {
  id: string;
  title: string;
  definition: SurveyDefinition;
  definitionVersion: number;
};

export const SURVEY_QUESTION_TYPES: SurveyNodeType[] = [
  "short_text",
  "long_text",
  "multiple_choice",
  "dropdown",
  "radio",
  "rating",
  "contact",
];

export const SURVEY_SCREEN_TYPES: SurveyNodeType[] = ["welcome", "title_screen", "thank_you"];

export const SURVEY_PALETTE: { type: SurveyNodeType; label: string; group: "screen" | "question" }[] = [
  { type: "welcome", label: "Welkom", group: "screen" },
  { type: "title_screen", label: "Titelscherm", group: "screen" },
  { type: "thank_you", label: "Bedankpagina", group: "screen" },
  { type: "short_text", label: "Korte tekst", group: "question" },
  { type: "long_text", label: "Lange tekst", group: "question" },
  { type: "multiple_choice", label: "Meerkeuze", group: "question" },
  { type: "dropdown", label: "Dropdown", group: "question" },
  { type: "radio", label: "Radioknoppen", group: "question" },
  { type: "rating", label: "Beoordelingsschaal", group: "question" },
  { type: "contact", label: "Contact", group: "question" },
];

export function newSurveyOption(label = ""): SurveyOption {
  return { id: crypto.randomUUID(), label };
}

export function defaultNodeData(type: SurveyNodeType): SurveyNodeData {
  const base = { screenTitle: "", screenDescription: "" };
  switch (type) {
    case "welcome":
      return { ...base, screenTitle: "Welkom", screenDescription: "", buttonLabel: "Start" };
    case "title_screen":
      return { ...base, screenTitle: "Titel", screenDescription: "" };
    case "thank_you":
      return { ...base, screenTitle: "Bedankt!", screenDescription: "Je antwoorden zijn ontvangen." };
    case "short_text":
    case "long_text":
      return { ...base, questionLabel: "Je antwoord", required: false };
    case "multiple_choice":
    case "dropdown":
    case "radio":
      return {
        ...base,
        questionLabel: "Kies een optie",
        required: false,
        options: [newSurveyOption("Optie 1"), newSurveyOption("Optie 2")],
      };
    case "rating":
      return {
        ...base,
        questionLabel: "Hoe tevreden ben je?",
        required: false,
        scaleMin: 1,
        scaleMax: 5,
        scaleMinLabel: "Zeer ontevreden",
        scaleMaxLabel: "Zeer tevreden",
      };
    case "contact":
      return { ...base, questionLabel: "Contactgegevens (optioneel)", required: false };
    default:
      return base;
  }
}

export function nodeTypeLabel(type: SurveyNodeType): string {
  return SURVEY_PALETTE.find((p) => p.type === type)?.label ?? type;
}

export function isQuestionNode(type: SurveyNodeType): boolean {
  return SURVEY_QUESTION_TYPES.includes(type);
}

export function isBranchingQuestion(type: SurveyNodeType): boolean {
  return type === "multiple_choice" || type === "dropdown" || type === "radio";
}
