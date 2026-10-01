import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  asChild?: boolean;
};

export function Button({
  className,
  variant = "primary",
  asChild,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
        variant === "primary" &&
          "bg-vice-gold text-white hover:bg-vice-gold-hover",
        variant === "secondary" &&
          "border border-vice-border bg-vice-surface text-vice-text hover:bg-vice-surface-muted",
        variant === "ghost" &&
          "text-vice-text-muted hover:bg-vice-surface-muted hover:text-vice-text",
        variant === "danger" &&
          "bg-vice-danger text-white hover:opacity-90",
        className,
      )}
      {...props}
    />
  );
}
