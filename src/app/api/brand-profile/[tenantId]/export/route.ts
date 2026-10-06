import { NextResponse } from "next/server";
import { brandKitFiles, kitSource } from "@/lib/brand-profile/export-kit";
import { zipStore } from "@/lib/brand-profile/zip";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadBrandProfileAction } from "@/modules/brand-profile/actions";

export async function GET(_request: Request, context: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await context.params;
  const loaded = await loadBrandProfileAction(tenantId);
  if (!loaded.ok || !loaded.data || ("empty" in loaded.data && loaded.data.empty) || !("version" in loaded.data) || !loaded.data.version) {
    return new NextResponse("Geen merkprofiel om te exporteren.", { status: 404 });
  }
  const source = kitSource(loaded.data);
  const files = brandKitFiles(source);
  try {
    const admin = createAdminClient();
    for (const asset of [...loaded.data.assets, ...loaded.data.fonts]) {
      if (!asset.path || !asset.exportAllowed) continue;
      const downloaded = await admin.storage.from("brand-kit").download(asset.path);
      if (!downloaded.data) continue;
      const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
      const name = asset.path.split("/").pop() ?? asset.name;
      files.push({ name: `bestanden/${name}`, data: bytes });
    }
  } catch {
    files.push({ name: "bestanden.txt", data: new TextEncoder().encode(`${new TextDecoder().decode(files.find((file) => file.name.endsWith("bestanden.txt"))?.data ?? new Uint8Array())}\nBestanden konden niet worden toegevoegd.`) });
  }
  const zip = zipStore(files);
  const label = source.concept ? "concept-brand-kit" : "brand-kit";
  return new NextResponse(Buffer.from(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${label}-v${source.versionNumber}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
