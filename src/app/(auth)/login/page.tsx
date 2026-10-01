import Link from "next/link";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/vandaag";

  return (
    <div className="rounded-xl border border-vice-border bg-vice-surface p-8 shadow-sm">
      <p
        className="mb-2 text-center text-2xl font-semibold tracking-tight text-vice-text"
        style={{ fontFamily: "var(--font-vice-display)" }}
      >
        VICE
      </p>
      <h1 className="mb-6 text-center text-sm text-vice-text-muted">
        Log in op je werkomgeving
      </h1>
      <LoginForm nextPath={next} />
      <p className="mt-6 text-center text-sm">
        <Link href="/forgot-password" className="text-vice-gold hover:underline">
          Wachtwoord vergeten
        </Link>
      </p>
    </div>
  );
}
