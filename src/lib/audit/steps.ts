import type { AuditFrameworkProgress } from "@/modules/porter/actions";

export type AuditStep = {
  index: number;
  label: string;
  route: string;
  approved: (progress: AuditFrameworkProgress) => boolean;
};

export const AUDIT_STEPS: AuditStep[] = [
  { index: 1, label: "PESTEL", route: "pestel", approved: (progress) => progress.pestelApproved },
  { index: 2, label: "Porter", route: "porter", approved: (progress) => progress.porterApproved },
  { index: 3, label: "5C", route: "marketing-5c", approved: (progress) => progress.fiveCApproved },
  { index: 4, label: "SWOT", route: "swot", approved: (progress) => progress.swotApproved },
  { index: 5, label: "VRIO", route: "vrio", approved: (progress) => progress.vrioApproved },
  { index: 6, label: "BCG", route: "bcg", approved: (progress) => progress.bcgApproved },
  { index: 7, label: "Waardeketen", route: "waardeketen", approved: (progress) => progress.valueChainApproved },
  { index: 8, label: "STP", route: "stp", approved: (progress) => progress.stpApproved },
  { index: 9, label: "Persona's", route: "personas", approved: (progress) => progress.personaApproved },
  { index: 10, label: "Brand audit", route: "brand", approved: (progress) => progress.brandApproved },
  { index: 11, label: "Contextbestand", route: "context", approved: (progress) => progress.contextSaved },
];
