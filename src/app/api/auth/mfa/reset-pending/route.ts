import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Verwijdert niet-geverifieerde TOTP-factors (inschrijving vastgelopen). Alleen voor ingelogde gebruiker zelf. */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json(
      { error: "Server mist SUPABASE_SERVICE_ROLE_KEY voor MFA-reset." },
      { status: 503 },
    );
  }

  const { data: listed, error: listError } =
    await admin.auth.admin.mfa.listFactors({ userId: user.id });

  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 502 });
  }

  const factors = listed?.factors ?? [];
  const hasVerifiedTotp = factors.some(
    (f) => f.factor_type === "totp" && f.status === "verified",
  );

  const toDelete = factors.filter((f) => {
    if (f.factor_type !== "totp") return false;
    if (f.status === "unverified") return true;
    if (!hasVerifiedTotp && f.status !== "verified") return true;
    return false;
  });

  let deleted = 0;
  for (const factor of toDelete) {
    const { error: delError } = await admin.auth.admin.mfa.deleteFactor({
      userId: user.id,
      id: factor.id,
    });
    if (!delError) deleted += 1;
  }

  return NextResponse.json({ deleted, hadVerifiedTotp: hasVerifiedTotp });
}
