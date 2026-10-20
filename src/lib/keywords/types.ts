export type KeywordResearchRun = {
  id: string;
  countryCode: string;
  city: string;
  scope: "national" | "local";
  seedTerms: string[];
  language: string;
  rowCount: number;
  createdAt: string;
};

export type KeywordResearchRow = {
  id: string;
  keyword: string;
  avgMonthlySearches: number;
  competition: string;
  cpcLow: number | null;
  cpcHigh: number | null;
};

export const KEYWORD_RESEARCH_MIGRATION =
  "Pas migratie 20260330135700_tenant_keyword_research.sql toe in de Supabase SQL-editor.";
