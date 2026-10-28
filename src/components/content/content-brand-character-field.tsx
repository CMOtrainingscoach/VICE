"use client";

import Link from "next/link";
import { Label } from "@/components/ui/label";
import type { BrandCharacterContentOption } from "@/lib/brand/character-types";

const fieldClass =
  "w-full rounded-md border border-vice-border bg-vice-bg px-3 py-2 text-sm text-vice-text outline-none focus:border-vice-gold";

export function ContentBrandCharacterField({
  tenantId,
  options,
  value,
  disabled,
  onChange,
}: {
  tenantId: string;
  options: BrandCharacterContentOption[];
  value: string;
  disabled?: boolean;
  onChange: (characterId: string) => void;
}) {
  if (options.length === 0) {
    return (
      <p className="text-xs text-vice-text-muted">
        Geen brand characters.{" "}
        <Link className="text-vice-gold underline" href={`/klanten/${tenantId}/strategie/brand?tab=characters`}>
          Voeg toe onder Brand → Characters
        </Link>
        .
      </p>
    );
  }

  return (
    <div>
      <Label className="mb-1.5 block text-xs text-vice-text-muted">Character (optioneel)</Label>
      <select
        className={fieldClass}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Geen vaste personage</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
            {option.referenceCount > 0 ? ` · ${option.referenceCount} ref.` : ""}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-vice-text-muted">
        Gekozen personage: lock-prompt + referenties worden meegestuurd bij beeldgeneratie.
      </p>
    </div>
  );
}
