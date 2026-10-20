import { type NextRequest } from "next/server";
import { startPlatformGoogleConnect } from "@/lib/integrations/platform-google-connect-handler";
import {
  GOOGLE_ADS_OAUTH_COOKIE,
  GOOGLE_ADS_REDIRECT_COOKIE,
  buildGoogleAdsAuthUrl,
  googleAdsRedirectUri,
} from "@/lib/integrations/platform-google-ads";

export async function GET(request: NextRequest) {
  return startPlatformGoogleConnect({
    request,
    buildAuthUrl: buildGoogleAdsAuthUrl,
    redirectUri: googleAdsRedirectUri,
    oauthCookieName: GOOGLE_ADS_OAUTH_COOKIE,
    redirectCookieName: GOOGLE_ADS_REDIRECT_COOKIE,
    flashPrefix: "ads",
    settingsPath: "/instellingen",
  });
}
