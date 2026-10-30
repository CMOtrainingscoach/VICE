import { type NextRequest } from "next/server";
import { startPlatformOpenArtConnect } from "@/lib/integrations/platform-openart-connect-handler";

export async function GET(request: NextRequest) {
  return startPlatformOpenArtConnect(request);
}
