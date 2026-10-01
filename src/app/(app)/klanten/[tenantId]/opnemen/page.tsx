import { redirect } from "next/navigation";

export default async function OpnemenRedirect({
  params,
}: PageProps<"/klanten/[tenantId]/opnemen">) {
  const { tenantId } = await params;
  redirect(`/klanten/${tenantId}/meetings/nieuw`);
}
