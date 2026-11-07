"use client";

export function MemoryToggle({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={
        "relative inline-flex h-6 w-11 shrink-0 rounded-full border border-vice-border transition-colors disabled:opacity-50 " +
        (checked ? "bg-vice-gold" : "bg-vice-surface-muted")
      }
    >
      <span
        className={
          "pointer-events-none absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform dark:bg-vice-bg " +
          (checked ? "translate-x-5" : "translate-x-0.5")
        }
      />
    </button>
  );
}
