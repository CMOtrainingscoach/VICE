import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { AcceptInviteClient } from "./accept-invite-client";

export default async function InvitePage({
  params,
}: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const session = await getSession();
  if (!session) {
    redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  }

  return <AcceptInviteClient token={token} />;
}
