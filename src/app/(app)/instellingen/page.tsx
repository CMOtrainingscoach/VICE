import { redirect } from "next/navigation";
import { PlatformGoogleAdsSection } from "@/components/instellingen/platform-google-ads-section";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { getUserAppContext } from "@/lib/auth/context";
import {
  PLATFORM_GOOGLE_ADS_PROVIDER,
  googleAdsOAuthConfigured,
  parsePlatformGoogleAdsPublic,
} from "@/lib/integrations/platform-google-ads";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "./sign-out-button";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ads?: string }>;
}) {
  const ctx = await getUserAppContext();
  if (!ctx) redirect("/login");
  const query = await searchParams;
  const adsFlash = typeof query.ads === "string" ? query.ads : null;

  const supabase = await createClient();
  const { data: profile } = await supabase
    .schema("app")
    .from("profiles")
    .select("theme_preference, locale")
    .eq("user_id", ctx.session.userId)
    .maybeSingle();

  let platformAds = parsePlatformGoogleAdsPublic(null);
  if (ctx.isPlatformAdmin) {
    const adsRpc = await supabase.schema("app").rpc("get_platform_integration_public", {
      p_provider: PLATFORM_GOOGLE_ADS_PROVIDER,
    });
    if (!adsRpc.error) {
      platformAds = parsePlatformGoogleAdsPublic(adsRpc.data);
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-2 text-2xl font-semibold">Instellingen</h1>
      <p className="mb-8 text-sm text-vice-text-muted">Profiel, thema en sessie.</p>

      <dl className="space-y-4 rounded-lg border border-vice-border bg-vice-surface p-6 text-sm">
        <div>
          <dt className="text-vice-text-muted">Naam</dt>
          <dd className="font-medium">{ctx.profileDisplayName}</dd>
        </div>
        <div>
          <dt className="text-vice-text-muted">E-mail</dt>
          <dd>{ctx.session.email ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-vice-text-muted">Rol</dt>
          <dd>{ctx.isPlatformAdmin ? "Platformbeheerder" : "Klant"}</dd>
        </div>
        <div>
          <dt className="text-vice-text-muted">Thema (browser)</dt>
          <dd className="mt-2 flex items-center gap-2">
            <ThemeToggle />
            <span className="text-vice-text-muted">
              Opgeslagen lokaal; profielvoorkeur: {profile?.theme_preference ?? "system"}
            </span>
          </dd>
        </div>
      </dl>

      {ctx.isPlatformAdmin ? (
        <PlatformGoogleAdsSection
          status={platformAds}
          oauthReady={googleAdsOAuthConfigured()}
          initialFlash={adsFlash}
          envCustomerId={process.env.GOOGLE_ADS_CUSTOMER_ID ?? ""}
        />
      ) : null}

      <div className="mt-8">
        <SignOutButton />
      </div>
    </div>
  );
}
