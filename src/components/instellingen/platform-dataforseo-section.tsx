import type { DataforSeoPublicStatus } from "@/lib/integrations/dataforseo";

export function PlatformDataforSeoSection({ status }: { status: DataforSeoPublicStatus }) {
  return (
    <section className="mt-8 rounded-lg border border-vice-border bg-vice-surface p-6 text-sm">
      <h2 className="text-base font-semibold text-vice-text">Platform · DataForSEO</h2>
      <p className="mt-2 text-vice-text-muted">
        Zoekwoordonderzoek (volume, CPC, concurrentie) loopt via de DataForSEO Google Ads Keywords API — niet
        via de Google Ads OAuth-koppeling.
      </p>
      <dl className="mt-4 space-y-2">
        <div className="flex justify-between gap-4">
          <dt className="text-vice-text-muted">API-login</dt>
          <dd className={status.loginSet ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700"}>
            {status.loginSet ? "Geconfigureerd" : "Ontbreekt"}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-vice-text-muted">API-wachtwoord</dt>
          <dd className={status.passwordSet ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700"}>
            {status.passwordSet ? "Geconfigureerd" : "Ontbreekt"}
          </dd>
        </div>
      </dl>
      {!status.configured ? (
        <p className="mt-4 text-vice-text-muted">
          Voeg <code className="text-xs">DATAFORSEO_LOGIN</code> en{" "}
          <code className="text-xs">DATAFORSEO_PASSWORD</code> toe in Vercel (zelfde waarden als in je DataForSEO
          dashboard).
        </p>
      ) : (
        <p className="mt-4 text-emerald-800 dark:text-emerald-300">Keywordonderzoek is klaar voor gebruik.</p>
      )}
    </section>
  );
}
