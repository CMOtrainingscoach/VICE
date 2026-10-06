import type { ColorRole } from "@/lib/brand-profile/types";

const HEX = /^#([0-9a-f]{6})$/i;

export function normalizeHex(value: string): string | null {
  const raw = value.trim();
  const match = raw.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return null;
  const body = match[1].length === 3
    ? match[1].split("").map((char) => char + char).join("")
    : match[1];
  return `#${body.toUpperCase()}`;
}

export function hexToRgb(hex: string): string | null {
  const normalized = normalizeHex(hex);
  if (!normalized || !HEX.test(normalized)) return null;
  const body = normalized.slice(1);
  const r = Number.parseInt(body.slice(0, 2), 16);
  const g = Number.parseInt(body.slice(2, 4), 16);
  const b = Number.parseInt(body.slice(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

export function contrastRatio(foreground: string, background: string): number | null {
  const fg = relativeLuminance(foreground);
  const bg = relativeLuminance(background);
  if (fg === null || bg === null) return null;
  const lighter = Math.max(fg, bg);
  const darker = Math.min(fg, bg);
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(hex: string): number | null {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  const body = normalized.slice(1);
  const channels = [0, 2, 4].map((index) => {
    const value = Number.parseInt(body.slice(index, index + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function roleFromText(value: string): ColorRole {
  const text = value.toLowerCase();
  if (text.includes("primair")) return "primary";
  if (text.includes("secundair")) return "secondary";
  if (text.includes("accent")) return "accent";
  if (text.includes("achtergrond")) return "background";
  if (text.includes("tekst")) return "text";
  if (text.includes("ondersteunend")) return "support";
  return "unknown";
}
