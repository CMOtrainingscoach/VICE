"use client";

import Link from "next/link";
import { Label } from "@/components/ui/label";
import type { ContentBuyerPersonaOption } from "@/lib/brand/buyer-persona-types";

export function resolveDefaultContentBuyerPersonaId(
  options: ContentBuyerPersonaOption[],
  existing: string | null | undefined,
): string {
  if (existing && options.some((o) => o.id === existing)) return existing;
  const approved = options.find((o) => o.approved);
  return (approved ?? options[0])?.id ?? "";
}

export function ContentBuyerPersonaField({
  brandHref,
  options,
  value,
  onChange,
  fieldClass,
}: {
  brandHref: string;
  options: ContentBuyerPersonaOption[];
  value: string;
  onChange: (id: string) => void;
  fieldClass: string;
}) {
  if (options.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">Doelgroep</Label>
      <select
        className={fieldClass}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Kies een buyer persona…</option>
        {options.map((persona) => (
          <option key={persona.id} value={persona.id}>
            {persona.roleTitle || persona.displayName}
            {persona.displayName && persona.roleTitle ? ` — ${persona.displayName}` : ""}
            {persona.icpHeadline ? ` (${persona.icpHeadline})` : ""}
            {!persona.approved ? " · concept" : ""}
          </option>
        ))}
      </select>
      <p className="text-xs text-vice-text-muted">
        De AI schrijft voor deze rol/functie, niet over de persona zelf.{" "}
        <Link href={brandHref} className="text-vice-gold underline">
          Buyer persona&apos;s beheren
        </Link>
      </p>
    </div>
  );
}
