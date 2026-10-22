export const TENANT_ICP_MIGRATION =
  "Pas migratie 20260330136000 toe in de Supabase SQL-editor, na 20260330135900. Een klant kan meerdere ICP's hebben.";

export type TenantIcpStatus = "draft" | "approved";

export type TenantIcpMarketType = "b2b" | "b2c";

export type TenantIcpProfileData = {
  marketType: TenantIcpMarketType;
  headline: string;
  summary: string;
  offer: string;
  activity: string;
  region: string;
  phase: string;
  teamSize: string;
  teamSizeNeedsValidation: boolean;
  extraCharacteristics: string;
  criteriaMust: string[];
  criteriaPlus: string[];
  criteriaExclude: string[];
  mainProblem: string;
  mainProblemSource: string;
  desiredOutcome: string;
  trigger: string;
  triggerLabel: string;
  budget: string;
  capacity: string;
  openQuestions: string[];
  positioning: string;
  sourcesAndAssumptions: string;
};

export type TenantIcpSummary = {
  id: string;
  tenantId: string;
  isPrimary: boolean;
  status: TenantIcpStatus;
  versionNumber: number;
  headline: string;
  updatedAt: string;
};

export type TenantIcpRecord = {
  id: string;
  tenantId: string;
  isPrimary: boolean;
  status: TenantIcpStatus;
  versionNumber: number;
  profile: TenantIcpProfileData;
  sourceDocumentSavedAt: string | null;
  aiGeneratedAt: string | null;
  updatedAt: string;
};

export function normalizeTenantIcpMarketType(raw: unknown): TenantIcpMarketType {
  const value = String(raw ?? "").trim().toLowerCase();
  return value === "b2c" ? "b2c" : "b2b";
}

export function tenantIcpMarketTypeLabel(marketType: TenantIcpMarketType): string {
  return marketType === "b2c" ? "B2C" : "B2B";
}

export function emptyTenantIcpProfile(): TenantIcpProfileData {
  return {
    marketType: "b2b",
    headline: "",
    summary: "",
    offer: "",
    activity: "",
    region: "",
    phase: "",
    teamSize: "",
    teamSizeNeedsValidation: false,
    extraCharacteristics: "",
    criteriaMust: [],
    criteriaPlus: [],
    criteriaExclude: [],
    mainProblem: "",
    mainProblemSource: "",
    desiredOutcome: "",
    trigger: "",
    triggerLabel: "",
    budget: "",
    capacity: "",
    openQuestions: [],
    positioning: "",
    sourcesAndAssumptions: "",
  };
}

export function versionLabel(versionNumber: number): string {
  const major = Math.max(1, versionNumber);
  return `v1.${Math.max(0, major - 1)}`;
}
