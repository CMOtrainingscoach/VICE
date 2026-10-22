export type GeocodeResult = {
  lat: number;
  lng: number;
  formattedAddress: string;
  municipality: string | null;
};

function mapsServerKey(): string | null {
  return (
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.GOOGLE_GEOCODING_API_KEY?.trim() ||
    null
  );
}

export async function geocodeBusinessNearLocation(
  businessLabel: string,
  locationLabel: string,
): Promise<GeocodeResult | null> {
  const key = mapsServerKey();
  if (!key) return null;
  const query = `${businessLabel}, ${locationLabel}`;
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", query);
  url.searchParams.set("key", key);
  url.searchParams.set("region", "be");

  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) return null;
  const json = (await response.json()) as {
    status?: string;
    results?: {
      formatted_address?: string;
      geometry?: { location?: { lat?: number; lng?: number } };
      address_components?: { long_name?: string; types?: string[] }[];
    }[];
  };
  if (json.status !== "OK" || !json.results?.length) return null;
  const first = json.results[0];
  const lat = first.geometry?.location?.lat;
  const lng = first.geometry?.location?.lng;
  if (lat == null || lng == null) return null;

  let municipality: string | null = null;
  for (const component of first.address_components ?? []) {
    if (component.types?.includes("locality")) {
      municipality = component.long_name ?? null;
      break;
    }
  }

  return {
    lat,
    lng,
    formattedAddress: first.formatted_address ?? query,
    municipality,
  };
}
