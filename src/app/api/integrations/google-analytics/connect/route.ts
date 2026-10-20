import { type NextRequest } from "next/server";
import { startGoogleIntegrationConnect } from "@/lib/integrations/google-connect-handler";
import {
  GOOGLE_ANALYTICS_OAUTH_COOKIE,
  GOOGLE_ANALYTICS_REDIRECT_COOKIE,
  buildGoogleAnalyticsAuthUrl,
  googleAnalyticsRedirectUri,
} from "@/lib/integrations/google-analytics";

export async function GET(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get("tenantId")?.trim();
  return startGoogleIntegrationConnect({
    request,
    tenantId,
    buildAuthUrl: buildGoogleAnalyticsAuthUrl,
    redirectUri: googleAnalyticsRedirectUri,
    oauthCookieName: GOOGLE_ANALYTICS_OAUTH_COOKIE,
    redirectCookieName: GOOGLE_ANALYTICS_REDIRECT_COOKIE,
    flashPrefix: "ga",
    missingTenantRedirect: "/klanten?ga=missing-tenant",
  });
}
