export type TenantStatus =
  | "new"
  | "collecting"
  | "audit_in_progress"
  | "audit_done"
  | "archived";

export type TenantRow = {
  id: string;
  name: string;
  website: string | null;
  vat_number: string | null;
  contact_name: string | null;
  contact_email: string | null;
  audit_goal: string;
  language: string;
  status: TenantStatus;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export const TENANT_STATUS_LABELS: Record<TenantStatus, string> = {
  new: "Nieuw",
  collecting: "Informatie verzamelen",
  audit_in_progress: "Audit bezig",
  audit_done: "Audit afgerond",
  archived: "Gearchiveerd",
};
