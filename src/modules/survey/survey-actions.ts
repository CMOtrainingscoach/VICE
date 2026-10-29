"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdminMfa, requireSession } from "@/lib/auth/session";
import type { ClientBrand } from "@/lib/brand/types";
import { validateSurveyDefinition } from "@/lib/survey/survey-graph";
import { normalizeSurveyDefinition } from "@/lib/survey/survey-parse";
import {
  SURVEY_MIGRATION,
  type PublishedSurvey,
  type Survey,
  type SurveyDefinition,
  type SurveyResponseRow,
  type SurveySummary,
} from "@/lib/survey/survey-types";
import { loadClientBrandAction } from "@/modules/brand/actions";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const MISSING =
  /list_surveys|create_survey|get_survey|save_survey|publish_survey|close_survey|delete_survey|survey_responses|surveys|schema cache|does not exist/i;

function migrationError(message: string): string {
  return MISSING.test(message) ? SURVEY_MIGRATION : message;
}

async function authed() {
  const session = await requireSession();
  await requirePlatformAdminMfa(session);
  return createClient();
}

function parseDefinition(raw: unknown): SurveyDefinition {
  return normalizeSurveyDefinition(raw);
}

function parseSummary(raw: Record<string, unknown>, definition?: SurveyDefinition): Survey {
  return {
    id: String(raw.id ?? ""),
    tenantId: String(raw.tenantId ?? ""),
    title: String(raw.title ?? ""),
    status: (raw.status === "published" || raw.status === "closed" ? raw.status : "draft") as Survey["status"],
    publicSlug: raw.publicSlug ? String(raw.publicSlug) : null,
    responseCount: Number(raw.responseCount ?? 0),
    publishedAt: raw.publishedAt ? String(raw.publishedAt) : null,
    updatedAt: String(raw.updatedAt ?? ""),
    createdAt: String(raw.createdAt ?? ""),
    definition: definition ?? parseDefinition(raw.definition),
  };
}

function revalidateSurvey(tenantId: string, surveyId?: string) {
  revalidatePath(`/klanten/${tenantId}/enquetes`);
  if (surveyId) {
    revalidatePath(`/klanten/${tenantId}/enquetes/${surveyId}`);
    revalidatePath(`/klanten/${tenantId}/enquetes/${surveyId}/resultaten`);
  }
}

export async function listSurveysAction(tenantId: string): Promise<ActionResult<SurveySummary[]>> {
  const supabase = await authed();
  const { data, error } = await supabase.schema("app").rpc("list_surveys", { p_tenant_id: tenantId });
  if (error) return { ok: false, error: migrationError(error.message) };
  const list = Array.isArray(data) ? data : [];
  return {
    ok: true,
    data: list.map((row) => {
      const r = row as Record<string, unknown>;
      const s = parseSummary(r);
      return {
        id: s.id,
        tenantId: s.tenantId,
        title: s.title,
        status: s.status,
        publicSlug: s.publicSlug,
        responseCount: s.responseCount,
        publishedAt: s.publishedAt,
        updatedAt: s.updatedAt,
        createdAt: s.createdAt,
      };
    }),
  };
}

export async function createSurveyAction(tenantId: string): Promise<ActionResult<Survey>> {
  const supabase = await authed();
  const { data, error } = await supabase.schema("app").rpc("create_survey", { p_tenant_id: tenantId });
  if (error || !data) return { ok: false, error: migrationError(error?.message ?? "Aanmaken mislukt") };
  const survey = parseSummary(data as Record<string, unknown>);
  revalidateSurvey(tenantId, survey.id);
  return { ok: true, data: survey };
}

export async function loadSurveyAction(surveyId: string): Promise<ActionResult<Survey>> {
  const supabase = await authed();
  const { data, error } = await supabase.schema("app").rpc("get_survey", { p_survey_id: surveyId });
  if (error || !data) return { ok: false, error: migrationError(error?.message ?? "Laden mislukt") };
  return { ok: true, data: parseSummary(data as Record<string, unknown>) };
}

export async function saveSurveyAction(
  surveyId: string,
  expectedUpdatedAt: string,
  patch: { title?: string; definition?: SurveyDefinition },
): Promise<ActionResult<Survey>> {
  if (patch.definition) {
    const err = validateSurveyDefinition(patch.definition);
    if (err) return { ok: false, error: err };
  }
  const supabase = await authed();
  const { data, error } = await supabase.schema("app").rpc("save_survey", {
    p_survey_id: surveyId,
    p_expected: expectedUpdatedAt,
    p_patch: patch,
  });
  if (error || !data) return { ok: false, error: migrationError(error?.message ?? "Opslaan mislukt") };
  const survey = parseSummary(data as Record<string, unknown>);
  revalidateSurvey(survey.tenantId, survey.id);
  return { ok: true, data: survey };
}

function brandSnapshotPayload(brand: ClientBrand | null): Record<string, unknown> {
  if (!brand) return {};
  return {
    brandName: brand.brandName,
    logoUrl: brand.logoUrl,
    colors: brand.colors,
    typography: brand.typography,
  };
}

export async function publishSurveyAction(surveyId: string): Promise<ActionResult<Survey>> {
  const loaded = await loadSurveyAction(surveyId);
  if (!loaded.ok || !loaded.data) return loaded;
  const err = validateSurveyDefinition(loaded.data.definition);
  if (err) return { ok: false, error: err };

  const brand = await loadClientBrandAction(loaded.data.tenantId);
  const snapshot = brand.ok && brand.data?.brand ? brandSnapshotPayload(brand.data.brand) : {};

  const supabase = await authed();
  const { data, error } = await supabase.schema("app").rpc("publish_survey", {
    p_survey_id: surveyId,
    p_brand_snapshot: snapshot,
  });
  if (error || !data) return { ok: false, error: migrationError(error?.message ?? "Publiceren mislukt") };
  const survey = parseSummary(data as Record<string, unknown>);
  revalidateSurvey(survey.tenantId, survey.id);
  return { ok: true, data: survey };
}

export async function closeSurveyAction(surveyId: string): Promise<ActionResult<Survey>> {
  const supabase = await authed();
  const { data, error } = await supabase.schema("app").rpc("close_survey", { p_survey_id: surveyId });
  if (error || !data) return { ok: false, error: migrationError(error?.message ?? "Sluiten mislukt") };
  const survey = parseSummary(data as Record<string, unknown>);
  revalidateSurvey(survey.tenantId, survey.id);
  return { ok: true, data: survey };
}

export async function deleteSurveyAction(surveyId: string): Promise<ActionResult<{ tenantId: string }>> {
  const supabase = await authed();
  const { data, error } = await supabase.schema("app").rpc("delete_survey", { p_survey_id: surveyId });
  if (error || !data) return { ok: false, error: migrationError(error?.message ?? "Verwijderen mislukt") };
  const row = data as { tenantId?: string };
  const tenantId = String(row.tenantId ?? "");
  revalidateSurvey(tenantId);
  return { ok: true, data: { tenantId } };
}

export async function listSurveyResponsesAction(
  surveyId: string,
): Promise<ActionResult<SurveyResponseRow[]>> {
  const supabase = await authed();
  const { data, error } = await supabase.schema("app").rpc("list_survey_responses", {
    p_survey_id: surveyId,
    p_limit: 500,
  });
  if (error) return { ok: false, error: migrationError(error.message) };
  const list = Array.isArray(data) ? data : [];
  return {
    ok: true,
    data: list.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: String(r.id ?? ""),
        submittedAt: String(r.submittedAt ?? ""),
        answers: (r.answers && typeof r.answers === "object" ? r.answers : {}) as Record<string, unknown>,
        contact: (r.contact && typeof r.contact === "object"
          ? r.contact
          : null) as SurveyResponseRow["contact"],
        definitionVersion: Number(r.definitionVersion ?? 1),
      };
    }),
  };
}

export async function loadPublishedSurveyAction(slug: string): Promise<ActionResult<PublishedSurvey>> {
  const supabase = await createClient();
  const { data, error } = await supabase.schema("app").rpc("get_published_survey_by_slug", {
    p_slug: slug,
  });
  if (error) return { ok: false, error: migrationError(error.message) };
  if (!data) return { ok: false, error: "Enquête niet gevonden." };
  const r = data as Record<string, unknown>;
  return {
    ok: true,
    data: {
      id: String(r.id ?? ""),
      title: String(r.title ?? ""),
      definition: parseDefinition(r.definition),
      definitionVersion: Number(r.definitionVersion ?? 1),
    },
  };
}

export async function submitSurveyResponseAction(input: {
  slug: string;
  answers: Record<string, unknown>;
  contact?: { name?: string; email?: string } | null;
  userAgent?: string;
  referrer?: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.schema("app").rpc("submit_survey_response", {
    p_slug: input.slug,
    p_answers: input.answers,
    p_contact: input.contact ?? null,
    p_user_agent: input.userAgent ?? "",
    p_referrer: input.referrer ?? "",
  });
  if (error) return { ok: false, error: migrationError(error.message) };
  return { ok: true };
}
