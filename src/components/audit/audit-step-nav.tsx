"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AUDIT_STEPS } from "@/lib/audit/steps";
import { AUDIT_FRAMEWORK_COUNT } from "@/lib/pestel/constants";
import { cn } from "@/lib/utils";
import type { AuditFrameworkProgress } from "@/modules/porter/actions";

export function AuditStepNav({
  tenantId,
  progress,
}: {
  tenantId: string;
  progress: AuditFrameworkProgress | null;
}) {
  const pathname = usePathname();
  const approvedCount = progress ? AUDIT_STEPS.filter((step) => step.approved(progress)).length : 0;

  return (
    <nav aria-label="Strategische audit" className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-6 pt-6 md:px-10 print:hidden">
      <p className="text-sm font-medium text-vice-text">Strategische audit</p>
      <ol className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {AUDIT_STEPS.map((step) => {
          const href = step.route ? `/klanten/${tenantId}/strategie/${step.route}` : null;
          const current = href !== null && (pathname === href || pathname.startsWith(`${href}/`));
          const approved = progress ? step.approved(progress) : false;
          const label = step.route ? `${step.index}. ${step.label}` : `Stap ${step.index}. Nog geen framework`;
          const dot = (
            <span
              className={cn(
                "block size-2.5 rounded-full",
                approved ? "bg-vice-gold" : "bg-vice-border",
                current && "ring-2 ring-vice-gold/50 ring-offset-2 ring-offset-vice-bg",
              )}
            />
          );
          return (
            <li key={step.index} className="group relative flex">
              {href ? (
                <Link href={href} aria-current={current ? "step" : undefined} aria-label={label} title={label} className="flex size-6 items-center justify-center rounded-full">
                  {dot}
                </Link>
              ) : (
                <span aria-label={label} title={label} className="flex size-6 cursor-default items-center justify-center rounded-full">
                  {dot}
                </span>
              )}
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
