import { notFound, redirect } from "next/navigation";
import { MeetingRecorderStudio } from "@/components/meetings/meeting-recorder-studio";
import { getUserAppContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import type { TenantRow } from "@/lib/types/tenant";

export default async function NewMeetingPage({
  params,
}: PageProps<"/klanten/[tenantId]/meetings/nieuw">) {
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
  const tenant = tenantData as Pick<TenantRow, "name">;

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 md:px-10 md:py-10">
      <MeetingRecorderStudio tenantId={tenantId} tenantName={tenant.name} />
    </div>
  );
}
