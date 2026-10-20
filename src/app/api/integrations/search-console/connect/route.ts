import { type NextRequest } from "next/server";
import { startGoogleIntegrationConnect } from "@/lib/integrations/google-connect-handler";
import {
  SEARCH_CONSOLE_OAUTH_COOKIE,
  SEARCH_CONSOLE_REDIRECT_COOKIE,
  buildSearchConsoleAuthUrl,
  searchConsoleRedirectUri,
} from "@/lib/integrations/search-console";

export async function GET(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get("tenantId")?.trim();
  return startGoogleIntegrationConnect({
    request,
    tenantId,
    buildAuthUrl: buildSearchConsoleAuthUrl,
    redirectUri: searchConsoleRedirectUri,
    oauthCookieName: SEARCH_CONSOLE_OAUTH_COOKIE,
    redirectCookieName: SEARCH_CONSOLE_REDIRECT_COOKIE,
    flashPrefix: "gsc",
    missingTenantRedirect: "/klanten?gsc=missing-tenant",
  });
}
