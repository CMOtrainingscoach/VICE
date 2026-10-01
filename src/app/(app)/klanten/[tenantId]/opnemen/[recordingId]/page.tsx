import { redirect } from "next/navigation";

export default async function OpnemenRecordingRedirect({
  params,
}: PageProps<"/klanten/[tenantId]/opnemen/[recordingId]">) {
  const { tenantId, recordingId } = await params;
  redirect(`/klanten/${tenantId}/meetings/${recordingId}`);
}
