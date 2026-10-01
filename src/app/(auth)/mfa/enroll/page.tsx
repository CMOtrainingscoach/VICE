import { MfaEnrollForm } from "./mfa-enroll-form";

export default function MfaEnrollPage() {
  return (
    <div className="rounded-xl border border-vice-border bg-vice-surface p-8">
      <h1 className="mb-2 text-lg font-medium">Tweefactorauthenticatie</h1>
      <MfaEnrollForm />
    </div>
  );
}
