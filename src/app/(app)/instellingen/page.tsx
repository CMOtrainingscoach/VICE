import { redirect } from "next/navigation";
import { PlatformDataforSeoSection } from "@/components/instellingen/platform-dataforseo-section";
import { PlatformGoogleAdsSection } from "@/components/instellingen/platform-google-ads-section";
import { PlatformKlingSection } from "@/components/instellingen/platform-kling-section";
import { PlatformOpenArtSection } from "@/components/instellingen/platform-openart-section";
import { loadPlatformKlingStatusAction } from "@/modules/integrations/platform-kling-actions";
import { dataforSeoPublicStatus } from "@/lib/integrations/dataforseo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { getUserAppContext } from "@/lib/auth/context";
import {
  PLATFORM_GOOGLE_ADS_PROVIDER,
  googleAdsOAuthConfigured,
  parsePlatformGoogleAdsPublic,
} from "@/lib/integrations/platform-google-ads";
import {
  PLATFORM_OPENART_PROVIDER,
  parsePlatformOpenArtPublic,
} from "@/lib/integrations/platform-openart";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "./sign-out-button";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ads?: string; openart?: string }>;
}) {
  const ctx = await getUserAppContext();
  if (!ctx) redirect("/login");
  const query = await searchParams;
  const adsFlash = typeof query.ads === "string" ? query.ads : null;
  const openartFlash = typeof query.openart === "string" ? query.openart : null;

  const supabase = await createClient();
  const { data: profile } = await supabase
    .schema("app")
    .from("profiles")
    .select("theme_preference, locale")
    .eq("user_id", ctx.session.userId)
    .maybeSingle();

  let platformAds = parsePlatformGoogleAdsPublic(null);
  let platformOpenArt = parsePlatformOpenArtPublic(null);
  let platformKling = { unitsBalance: 0, apiKeyConfigured: false };
  if (ctx.isPlatformAdmin) {
    const adsRpc = await supabase.schema("app").rpc("get_platform_integration_public", {
      p_provider: PLATFORM_GOOGLE_ADS_PROVIDER,
    });
    if (!adsRpc.error) {
      platformAds = parsePlatformGoogleAdsPublic(adsRpc.data);
    }
    const openartRpc = await supabase.schema("app").rpc("get_platform_integration_public", {
      p_provider: PLATFORM_OPENART_PROVIDER,
    });
    if (!openartRpc.error) {
      platformOpenArt = parsePlatformOpenArtPublic(openartRpc.data);
    }
    const kling = await loadPlatformKlingStatusAction();
    if (kling.ok && kling.data) platformKling = kling.data;
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
        <>
          <PlatformDataforSeoSection status={dataforSeoPublicStatus()} />
          <PlatformGoogleAdsSection
            status={platformAds}
            oauthReady={googleAdsOAuthConfigured()}
            initialFlash={adsFlash}
            envCustomerId={process.env.GOOGLE_ADS_CUSTOMER_ID ?? ""}
          />
          <PlatformOpenArtSection status={platformOpenArt} initialFlash={openartFlash} />
          <PlatformKlingSection status={platformKling} />
        </>
      ) : null}

      <div className="mt-8">
        <SignOutButton />
      </div>
    </div>
  );
}
