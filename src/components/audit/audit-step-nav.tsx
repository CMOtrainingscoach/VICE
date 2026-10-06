"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, type ReactNode } from "react";
import { AUDIT_STEPS } from "@/lib/audit/steps";
import { AUDIT_FRAMEWORK_COUNT } from "@/lib/pestel/constants";
import { cn } from "@/lib/utils";
import type { AuditFrameworkProgress } from "@/modules/porter/actions";

const AuditProgressContext = createContext<{
  tenantId: string;
  progress: AuditFrameworkProgress | null;
} | null>(null);

export function AuditProgressProvider({
  tenantId,
  progress,
  children,
}: {
  tenantId: string;
  progress: AuditFrameworkProgress | null;
  children: ReactNode;
}) {
  return <AuditProgressContext.Provider value={{ tenantId, progress }}>{children}</AuditProgressContext.Provider>;
}

export function AuditStepNav() {
  const ctx = useContext(AuditProgressContext);
  const pathname = usePathname();
  if (!ctx) return null;
  const { tenantId, progress } = ctx;
  const approvedCount = progress ? AUDIT_STEPS.filter((step) => step.approved(progress)).length : 0;

  return (
    <nav aria-label="Voortgang van de audit" className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 print:hidden">
      <ol className="flex min-w-0 flex-wrap items-center gap-1">
        {AUDIT_STEPS.map((step) => {
          const href = `/klanten/${tenantId}/strategie/${step.route}`;
          const current = pathname === href || pathname.startsWith(`${href}/`);
          const approved = progress ? step.approved(progress) : false;
          const label = `${step.index}. ${step.label}`;
          return (
            <li key={step.index} className="group relative flex">
              <Link href={href} aria-current={current ? "step" : undefined} aria-label={label} title={label} className="flex size-6 items-center justify-center rounded-full">
                <span
                  className={cn(
                    "block size-2.5 rounded-full",
                    approved ? "bg-vice-gold" : "bg-vice-border",
                    current && "ring-2 ring-vice-gold/50 ring-offset-2 ring-offset-vice-bg",
                  )}
                />
              </Link>
              <span className="pointer-events-none absolute top-full left-1/2 z-20 mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-vice-border bg-vice-surface px-2 py-1 text-xs text-vice-text shadow-sm group-hover:block group-focus-within:block">
                {label}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-vice-text-muted">{approvedCount} van {AUDIT_FRAMEWORK_COUNT} goedgekeurd</p>
    </nav>
  );
}
