import { notFound, redirect } from "next/navigation";
import { SurveyList } from "@/components/survey/survey-list";
import { getUserAppContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { listSurveysAction } from "@/modules/survey/survey-actions";
import type { TenantRow } from "@/lib/types/tenant";

export default async function EnquetesPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
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

  const surveys = await listSurveysAction(tenantId);

  return (
    <SurveyList
      tenantId={tenantId}
      tenantName={(tenantData as Pick<TenantRow, "name">).name}
      initial={surveys.ok ? surveys.data ?? [] : []}
    />
  );
}
