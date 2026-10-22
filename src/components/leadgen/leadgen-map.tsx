"use client";

import { useEffect, useRef } from "react";

type LeadgenMapProps = {
  lat: number;
  lng: number;
  radiusKm: number;
  apiKey: string | null;
  className?: string;
};

export function LeadgenMap({ lat, lng, radiusKm, apiKey, className = "" }: LeadgenMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!apiKey || !containerRef.current) return;
    let cancelled = false;
    const radiusM = radiusKm * 1000;

    void import("@/components/leadgen/load-google-maps").then(({ loadGoogleMaps }) =>
      loadGoogleMaps(apiKey).then((maps) => {
        if (cancelled || !containerRef.current) return;
        const map = new maps.Map(containerRef.current, {
          center: { lat, lng },
          zoom: 11,
          disableDefaultUI: true,
          zoomControl: true,
        });
        new maps.Marker({ map, position: { lat, lng } });
        new maps.Circle({
          map,
          center: { lat, lng },
          radius: radiusM,
          fillColor: "#c9a962",
          fillOpacity: 0.15,
          strokeColor: "#c9a962",
          strokeOpacity: 0.6,
          strokeWeight: 1,
        });
      }),
    );

    return () => {
      cancelled = true;
    };
  }, [apiKey, lat, lng, radiusKm]);

  if (!apiKey) {
    return (
      <div
        className={`flex min-h-[220px] items-center justify-center rounded-xl border border-dashed border-vice-border bg-vice-bg/50 text-sm text-vice-text-muted ${className}`}
      >
        Kaart: stel NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in
      </div>
    );
  }

  return <div ref={containerRef} className={`min-h-[220px] rounded-xl border border-vice-border ${className}`} />;
}
