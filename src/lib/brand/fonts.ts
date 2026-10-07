/** Standaard webfonts + veelgebruikte Google Fonts voor de merkdropdown. */

export type BrandFontOption = {
  family: string;
  source: "system" | "google";
};

export const BRAND_FONTS: BrandFontOption[] = [
  { family: "Arial", source: "system" },
  { family: "Helvetica", source: "system" },
  { family: "Helvetica Neue", source: "system" },
  { family: "Georgia", source: "system" },
  { family: "Times New Roman", source: "system" },
  { family: "Times", source: "system" },
  { family: "Courier New", source: "system" },
  { family: "Verdana", source: "system" },
  { family: "Tahoma", source: "system" },
  { family: "Trebuchet MS", source: "system" },
  { family: "Palatino Linotype", source: "system" },
  { family: "Garamond", source: "system" },
  { family: "system-ui", source: "system" },
  { family: "Inter", source: "google" },
  { family: "Roboto", source: "google" },
  { family: "Open Sans", source: "google" },
  { family: "Lato", source: "google" },
  { family: "Montserrat", source: "google" },
  { family: "Poppins", source: "google" },
  { family: "Source Sans 3", source: "google" },
  { family: "Nunito", source: "google" },
  { family: "Nunito Sans", source: "google" },
  { family: "Raleway", source: "google" },
  { family: "Work Sans", source: "google" },
  { family: "DM Sans", source: "google" },
  { family: "DM Serif Display", source: "google" },
  { family: "DM Serif Text", source: "google" },
  { family: "Playfair Display", source: "google" },
  { family: "Merriweather", source: "google" },
  { family: "Lora", source: "google" },
  { family: "Libre Baskerville", source: "google" },
  { family: "EB Garamond", source: "google" },
  { family: "Cormorant Garamond", source: "google" },
  { family: "PT Serif", source: "google" },
  { family: "Source Serif 4", source: "google" },
  { family: "Noto Serif", source: "google" },
  { family: "Noto Sans", source: "google" },
  { family: "IBM Plex Sans", source: "google" },
  { family: "IBM Plex Serif", source: "google" },
  { family: "Space Grotesk", source: "google" },
  { family: "Space Mono", source: "google" },
  { family: "Manrope", source: "google" },
  { family: "Outfit", source: "google" },
  { family: "Figtree", source: "google" },
  { family: "Sora", source: "google" },
  { family: "Karla", source: "google" },
  { family: "Mulish", source: "google" },
  { family: "Josefin Sans", source: "google" },
  { family: "Oswald", source: "google" },
  { family: "Barlow", source: "google" },
  { family: "Cabin", source: "google" },
  { family: "Fira Sans", source: "google" },
  { family: "Ubuntu", source: "google" },
  { family: "Rubik", source: "google" },
  { family: "Quicksand", source: "google" },
  { family: "Archivo", source: "google" },
  { family: "Lexend", source: "google" },
  { family: "Plus Jakarta Sans", source: "google" },
  { family: "Instrument Sans", source: "google" },
  { family: "Instrument Serif", source: "google" },
  { family: "Fraunces", source: "google" },
  { family: "Libre Franklin", source: "google" },
  { family: "Crimson Pro", source: "google" },
  { family: "Cardo", source: "google" },
  { family: "Spectral", source: "google" },
  { family: "Bitter", source: "google" },
  { family: "Vollkorn", source: "google" },
  { family: "Alegreya", source: "google" },
  { family: "Alegreya Sans", source: "google" },
  { family: "Anton", source: "google" },
  { family: "Bebas Neue", source: "google" },
  { family: "Comfortaa", source: "google" },
  { family: "Pacifico", source: "google" },
  { family: "Caveat", source: "google" },
  { family: "Dancing Script", source: "google" },
  { family: "Great Vibes", source: "google" },
  { family: "Inconsolata", source: "google" },
  { family: "JetBrains Mono", source: "google" },
  { family: "Roboto Mono", source: "google" },
  { family: "Source Code Pro", source: "google" },
];

export const FONT_WEIGHTS = [
  { value: "300", label: "Light" },
  { value: "400", label: "Regular" },
  { value: "500", label: "Medium" },
  { value: "600", label: "Semibold" },
  { value: "700", label: "Bold" },
] as const;

export function googleFontsCssHref(families: string[]): string | null {
  const unique = [...new Set(families.map((f) => f.trim()).filter(Boolean))];
  const google = unique.filter((family) => BRAND_FONTS.some((f) => f.family === family && f.source === "google"));
  if (google.length === 0) return null;
  const query = google
    .map((family) => `family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@300;400;500;600;700`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${query}&display=swap`;
}

export function fontStack(family: string): string {
  if (!family) return "var(--font-vice-sans), system-ui, sans-serif";
  return `"${family}", system-ui, sans-serif`;
}
