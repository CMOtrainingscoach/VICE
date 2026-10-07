import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeScript } from "@/components/theme/theme-script";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-vice-sans",
});

const interDisplay = Inter({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-vice-display",
});

export const metadata: Metadata = {
  title: "VICE",
  description: "Klantplatform van Hardwig Aerts",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="nl"
      suppressHydrationWarning
      className={`${inter.variable} ${interDisplay.variable} h-full`}
    >
      <body className="min-h-full antialiased">
        <ThemeScript />
        {children}
      </body>
    </html>
  );
}
