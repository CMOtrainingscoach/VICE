export const BUYER_PERSONA_MIGRATION =
  "Pas migratie 20260330136100 toe in de Supabase SQL-editor, na 20260330136000.";

export type BuyerPersonaPortrait = {
  id: string;
  status: string;
  storagePath: string;
  visualPrompt: string;
  errorMessage: string;
  createdAt: string;
  imageUrl?: string | null;
};

export type BuyerPersona = {
  id: string;
  displayName: string;
  roleTitle: string;
  summary: string;
  decisionRoles: string[];
  goals: string;
  pains: string;
  triggers: string;
  decisionCriteria: string;
  objections: string;
  infoNeeded: string;
  channels: string;
  assumptions: string;
  openQuestion: string;
  evidenceLevel: string;
  active: boolean;
  illustrationPrompt: string;
  selectedPortraitId: string | null;
  updatedAt: string;
  portraits: BuyerPersonaPortrait[];
  approved: boolean;
};

export type BuyerPersonaDraft = {
  displayName: string;
  roleTitle: string;
  summary: string;
  decisionRoles: string[];
  goals: string;
  pains: string;
  triggers: string;
  decisionCriteria: string;
  objections: string;
  infoNeeded: string;
  channels: string;
  assumptions: string;
  openQuestion: string;
};
