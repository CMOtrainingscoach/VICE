import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-3 rounded-lg border border-dashed border-vice-border bg-vice-surface/50 px-6 py-10",
        className,
      )}
    >
      <h2 className="text-lg font-medium text-vice-text">{title}</h2>
      <p className="max-w-prose text-sm text-vice-text-muted">{description}</p>
      {action}
    </div>
  );
}
