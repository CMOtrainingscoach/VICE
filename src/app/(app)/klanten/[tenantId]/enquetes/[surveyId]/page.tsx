import { notFound, redirect } from "next/navigation";
import { SurveyBuilderWorkspace } from "@/components/survey/survey-builder-workspace";
import { getUserAppContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { loadSurveyAction } from "@/modules/survey/survey-actions";
import type { TenantRow } from "@/lib/types/tenant";

export default async function EnqueteBuilderPage({
  params,
}: {
  params: Promise<{ tenantId: string; surveyId: string }>;
}) {
  const { tenantId, surveyId } = await params;
  const ctx = await getUserAppContext();
  if (!ctx) redirect("/login");
  if (!ctx.isPlatformAdmin) redirect(`/klanten/${tenantId}`);

  const supabase = await createClient();
  const { data: tenantData } = await supabase
    .schema("app")
    .from("my_tenants")
    .select("name")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenantData) notFound();

  const survey = await loadSurveyAction(surveyId);
  if (!survey.ok || !survey.data) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-xl font-semibold">Enquête niet gevonden</h1>
        <p className="mt-3 text-sm text-red-700">{survey.ok ? "Geen gegevens." : survey.error}</p>
      </div>
    );
  }

  if (survey.data.tenantId !== tenantId) {
    redirect(`/klanten/${survey.data.tenantId}/enquetes/${surveyId}`);
  }

  return (
    <SurveyBuilderWorkspace
      tenantId={tenantId}
      tenantName={(tenantData as Pick<TenantRow, "name">).name}
      initial={survey.data}
    />
  );
}
