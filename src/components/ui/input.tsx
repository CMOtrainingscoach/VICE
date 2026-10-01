import { cn } from "@/lib/utils";

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-md border border-vice-border bg-vice-surface px-3 py-2 text-sm text-vice-text placeholder:text-vice-text-muted",
        className,
      )}
      {...props}
    />
  );
}
