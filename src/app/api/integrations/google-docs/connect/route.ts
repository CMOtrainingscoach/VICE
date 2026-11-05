import { type NextRequest } from "next/server";
import { startGoogleIntegrationConnect } from "@/lib/integrations/google-connect-handler";
import {
  GOOGLE_DOCS_OAUTH_COOKIE,
  GOOGLE_DOCS_REDIRECT_COOKIE,
  buildGoogleDocsAuthUrl,
  googleDocsRedirectUri,
} from "@/lib/integrations/google-docs";

export async function GET(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get("tenantId")?.trim();
  return startGoogleIntegrationConnect({
    request,
    tenantId,
    buildAuthUrl: buildGoogleDocsAuthUrl,
    redirectUri: googleDocsRedirectUri,
    oauthCookieName: GOOGLE_DOCS_OAUTH_COOKIE,
    redirectCookieName: GOOGLE_DOCS_REDIRECT_COOKIE,
    flashPrefix: "gdocs",
    missingTenantRedirect: "/klanten?gdocs=missing-tenant",
  });
}
