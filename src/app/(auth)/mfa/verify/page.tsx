import { Suspense } from "react";
import { MfaVerifyForm } from "./mfa-verify-form";

export default function MfaVerifyPage() {
  return (
    <div className="rounded-xl border border-vice-border bg-vice-surface p-8">
      <h1 className="mb-2 text-lg font-medium">MFA-verificatie</h1>
      <p className="mb-6 text-sm text-vice-text-muted">
        Voer de code uit je authenticator-app in.
      </p>
      <Suspense fallback={<p className="text-sm text-vice-text-muted">Laden…</p>}>
        <MfaVerifyForm />
      </Suspense>
    </div>
  );
}
