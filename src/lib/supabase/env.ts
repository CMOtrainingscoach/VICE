export function getSupabasePublicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !key) {
    throw new Error(
      "Supabase is niet geconfigureerd. Vul NEXT_PUBLIC_SUPABASE_URL en NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local, sla op en herstart pnpm dev.",
    );
  }

  if (url.includes("127.0.0.1") || url.includes("localhost:54321")) {
    throw new Error(
      "Je .env.local wijst nog naar lokale Supabase (54321). Gebruik je cloud-URL (https://….supabase.co) of start Docker + supabase start.",
    );
  }

  return { url, key };
}
