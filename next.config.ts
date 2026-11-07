import type { NextConfig } from "next";

function normalizeAppOrigin(raw: string | undefined): string | null {
  const cleaned = (raw ?? "").trim().replace(/\)+$/, "").replace(/\/+$/, "");
  if (!cleaned) return null;
  try {
    return new URL(cleaned.startsWith("http") ? cleaned : `https://${cleaned}`).origin;
  } catch {
    return null;
  }
}

function appOrigin(): string {
  const configured = normalizeAppOrigin(process.env.NEXT_PUBLIC_APP_URL);
  if (configured) return configured;
  const vercel = normalizeAppOrigin(
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL.trim()}` : undefined,
  );
  if (vercel) return vercel;
  return "http://localhost:3000";
}

const appUrl = appOrigin();

const nextConfig: NextConfig = {
  serverExternalPackages: ["unpdf", "mammoth"],
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(self), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: blob: https://*.supabase.co",
              "media-src 'self' blob: https://*.supabase.co",
              "font-src 'self' data: https://fonts.gstatic.com",
              `connect-src 'self' ${appUrl} http://127.0.0.1:54321 https://*.supabase.co wss://*.supabase.co`,
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
