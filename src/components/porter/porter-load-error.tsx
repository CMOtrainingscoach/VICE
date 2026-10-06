import Link from "next/link";
import { Button } from "@/components/ui/button";

export function PorterLoadError({
  tenantId,
  message,
}: {
  tenantId: string;
  message: string;
}) {
  const needsMigration =
    /get_porter_workbench|porter_versions|does not exist|Could not find the function/i.test(
      message,
    );

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <h1 className="text-xl font-semibold text-vice-text">Porter kon niet openen</h1>
      <p className="mt-3 text-sm text-vice-text-muted">
        PESTEL is goedgekeurd, maar stap 2 (Porter) kon niet worden geladen.
      </p>
      <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-800 dark:text-red-200">
        {message}
      </p>
      {needsMigration && (
        <p className="mt-4 text-sm text-vice-text-muted">
          Voer op Supabase de migratie{" "}
          <code className="rounded bg-vice-surface-muted px-1">
            20260330131200_porter_manual_slice.sql
          </code>{" "}
          uit (en deploy daarna de nieuwste Vercel-build).
        </p>
      )}
      <div className="mt-6 flex justify-end">
        <Button type="button" asChild className="bg-vice-gold text-[#1a1814] hover:bg-vice-gold-hover">
          <Link href={`/klanten/${tenantId}/strategie/porter`}>Opnieuw proberen</Link>
        </Button>
      </div>
    </div>
  );
}
