"use client";

import { Moon, Sun, Monitor } from "lucide-react";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

type ThemePref = "light" | "dark" | "system";

function readPref(): ThemePref {
  if (typeof window === "undefined") return "system";
  const stored = localStorage.getItem("vice-theme") as ThemePref | null;
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return "system";
}

function resolveTheme(pref: ThemePref): "light" | "dark" {
  if (pref === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return pref;
}

function applyTheme(pref: ThemePref) {
  const resolved = resolveTheme(pref);
  document.documentElement.setAttribute("data-theme", resolved);
  localStorage.setItem("vice-theme", pref);
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

export function ThemeToggle({ className }: { className?: string }) {
  const pref = useSyncExternalStore(subscribe, readPref, () => "system" as ThemePref);

  const cycle = () => {
    const next: ThemePref =
      pref === "system" ? "light" : pref === "light" ? "dark" : "system";
    applyTheme(next);
    window.dispatchEvent(new Event("storage"));
  };

  const Icon = pref === "dark" ? Moon : pref === "light" ? Sun : Monitor;
  const label =
    pref === "system"
      ? "Thema: systeem"
      : pref === "light"
        ? "Thema: licht"
        : "Thema: donker";

  return (
    <button
      type="button"
      onClick={cycle}
      className={cn(
        "inline-flex items-center justify-center rounded-md p-2 text-vice-text-muted hover:bg-vice-surface-muted hover:text-vice-text",
        className,
      )}
      aria-label={label}
      title={label}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  );
}
