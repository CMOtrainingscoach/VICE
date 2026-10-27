export const LEADGEN_MIGRATION =
  "Pas migratie 20260330136300 toe in de Supabase SQL-editor, na 20260330136200.";

export type LeadgenRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "completed_with_warnings"
  | "failed"
  | "cancelled";

export type LeadgenContactStatus = "to_contact" | "contacted" | "unreachable" | "not_applicable";

export type LeadgenSourceKind = "web_search" | "website_fetch" | "places" | "manual";

export type LeadgenRunProgress = {
  phase: string;
  message: string;
  discovered?: number;
  assessed?: number;
  qualified?: number;
  warnings?: string[];
};

export type LeadgenRunSummary = {
  id: string;
  name: string;
  locationLabel: string;
  radiusKm: number;
  status: LeadgenRunStatus;
  resultCount: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type LeadgenRunConfig = {
  locationLabel: string;
  placeId: string | null;
  lat: number;
  lng: number;
  radiusKm: number;
  assignmentText: string;
  criteria: {
    sector?: string;
    maxResults: number;
    signals: string[];
  };
  sources: string[];
  interpretation?: {
    targetBusinesses: string;
    geographicBoundary: string;
    criteriaSummary: string;
    enabledSources: string;
    resultLimit: number;
  };
};

export type LeadgenRunDetail = LeadgenRunSummary & {
  config: LeadgenRunConfig;
  progress: LeadgenRunProgress;
  errorMessage: string | null;
  isFixture?: boolean;
};

export type LeadgenProspectRow = {
  id: string;
  runProspectId: string;
  displayName: string;
  websiteUrl: string | null;
  websiteHost: string | null;
  municipality: string | null;
  distanceKm: number | null;
  geoEligible: boolean;
  geoVerified: boolean;
  email: string | null;
  phone: string | null;
  contactPageUrl: string | null;
  contactStatus: LeadgenContactStatus;
  sourceCount: number;
  assessedAt: string | null;
  /** Salesbrain run-prospect fields (optional on list rows). */
  assessmentSummary?: string;
  signals?: { label: string; kind: "observed" | "interpretation" | "unverified"; detail: string }[];
  limitations?: string[];
};

export type LeadgenProspectDetail = LeadgenProspectRow & {
  establishmentAddress: string | null;
  assessmentSummary: string | null;
  signals: { label: string; kind: "observed" | "interpretation" | "unverified"; detail: string }[];
  limitations: string[];
  sources: {
    id: string;
    title: string;
    url: string;
    kind: LeadgenSourceKind;
    excerpt: string;
    retrievedAt: string;
  }[];
  notes: { id: string; body: string; createdAt: string; authorLabel: string }[];
  statusHistory: { status: LeadgenContactStatus; changedAt: string; authorLabel: string }[];
  researchRunAt: string;
};

export const CONTACT_STATUS_LABELS: Record<LeadgenContactStatus, string> = {
  to_contact: "Te contacteren",
  contacted: "Gecontacteerd",
  unreachable: "Niet bereikt",
  not_applicable: "Niet van toepassing",
};

export const RUN_STATUS_LABELS: Record<LeadgenRunStatus, string> = {
  queued: "In wachtrij",
  running: "Bezig",
  completed: "Voltooid",
  completed_with_warnings: "Voltooid met waarschuwingen",
  failed: "Mislukt",
  cancelled: "Geannuleerd",
};
