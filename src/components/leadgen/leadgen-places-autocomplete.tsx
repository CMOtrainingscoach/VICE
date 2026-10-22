"use client";

import { useEffect, useRef } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { loadGoogleMaps } from "@/components/leadgen/load-google-maps";

export type LeadgenPlaceSelection = {
  placeId: string;
  label: string;
  lat: number;
  lng: number;
};

type LeadgenPlacesAutocompleteProps = {
  apiKey: string | null;
  value: string;
  onChange: (label: string) => void;
  onPlaceSelect: (place: LeadgenPlaceSelection) => void;
  disabled?: boolean;
};

export function LeadgenPlacesAutocomplete({
  apiKey,
  value,
  onChange,
  onPlaceSelect,
  disabled,
}: LeadgenPlacesAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!apiKey || !inputRef.current || disabled) return;
    let autocomplete: google.maps.places.Autocomplete | null = null;
    let listener: google.maps.MapsEventListener | null = null;

    void loadGoogleMaps(apiKey).then((maps) => {
      if (!inputRef.current) return;
      autocomplete = new maps.places.Autocomplete(inputRef.current, {
        fields: ["place_id", "formatted_address", "geometry", "name"],
        componentRestrictions: { country: ["be", "nl"] },
      });
      listener = autocomplete.addListener("place_changed", () => {
        const place = autocomplete?.getPlace();
        if (!place) return;
        const lat = place.geometry?.location?.lat();
        const lng = place.geometry?.location?.lng();
        if (lat == null || lng == null) return;
        const label = place.formatted_address || place.name || "";
        onChange(label);
        onPlaceSelect({
          placeId: place.place_id ?? "",
          label,
          lat,
          lng,
        });
      });
    });

    return () => {
      listener?.remove();
    };
  }, [apiKey, disabled, onChange, onPlaceSelect]);

  return (
    <div>
      <Label htmlFor="leadgen-location">Locatie</Label>
      <input
        id="leadgen-location"
        ref={inputRef}
        className={cn(
          "mt-1.5 w-full rounded-md border border-vice-border bg-vice-surface px-3 py-2 text-sm text-vice-text placeholder:text-vice-text-muted",
        )}
        placeholder={apiKey ? "Zoek een stad of adres…" : "Bijv. Turnhout, België"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        autoComplete="off"
      />
      {!apiKey ? (
        <p className="mt-1 text-xs text-vice-text-muted">Autocomplete vereist NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.</p>
      ) : null}
    </div>
  );
}
