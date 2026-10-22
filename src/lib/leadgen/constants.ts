export function leadgenMaxResults(): number {
  const n = Number.parseInt(process.env.LEADGEN_MAX_RESULTS ?? "30", 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, 5), 100) : 30;
}

export function leadgenMinRadiusKm(): number {
  const n = Number.parseFloat(process.env.LEADGEN_MIN_RADIUS_KM ?? "5");
  return Number.isFinite(n) ? n : 5;
}

export function leadgenMaxRadiusKm(): number {
  const n = Number.parseFloat(process.env.LEADGEN_MAX_RADIUS_KM ?? "100");
  return Number.isFinite(n) ? n : 100;
}

export function leadgenMaxPagesPerSite(): number {
  const n = Number.parseInt(process.env.LEADGEN_MAX_PAGES_PER_SITE ?? "3", 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), 8) : 3;
}

export function leadgenFetchTimeoutMs(): number {
  const n = Number.parseInt(process.env.LEADGEN_MAX_FETCH_MS ?? "12000", 10);
  return Number.isFinite(n) ? n : 12000;
}

export function leadgenMaxFetchBytes(): number {
  const n = Number.parseInt(process.env.LEADGEN_MAX_FETCH_BYTES ?? "1500000", 10);
  return Number.isFinite(n) ? n : 1_500_000;
}
