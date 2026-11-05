import type { LucideIcon } from "lucide-react";
import { FolderOpen, Mic } from "lucide-react";

export type QuickAccessContext = {
  tenantId: string | null;
  isPlatformAdmin: boolean;
};

export type QuickAccessItem = {
  id: string;
  /** Short label for aria and future overflow menu */
  label: string;
  /** Tooltip / title attribute */
  title: string;
  icon: LucideIcon;
  href: (ctx: QuickAccessContext) => string | null;
  visible?: (ctx: QuickAccessContext) => boolean;
};

/**
 * Register quick-access shortcuts here. Items with `href` null or missing tenant stay disabled in the UI.
 */
export const QUICK_ACCESS_ITEMS: QuickAccessItem[] = [
  {
    id: "meeting-recorder",
    label: "Meeting opnemen",
    title: "Meeting recorder",
    icon: Mic,
    href: ({ tenantId }) => (tenantId ? `/klanten/${tenantId}/meetings/nieuw` : null),
    visible: ({ isPlatformAdmin }) => isPlatformAdmin,
  },
  {
    id: "documents",
    label: "Documenten",
    title: "Documentenmap",
    icon: FolderOpen,
    href: ({ tenantId }) => (tenantId ? `/klanten/${tenantId}/documenten` : null),
    visible: ({ isPlatformAdmin }) => isPlatformAdmin,
  },
];

export function quickAccessItemsFor(ctx: QuickAccessContext): QuickAccessItem[] {
  return QUICK_ACCESS_ITEMS.filter((item) => item.visible?.(ctx) ?? true);
}
