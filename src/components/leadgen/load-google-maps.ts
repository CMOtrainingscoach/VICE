type GoogleMaps = typeof google.maps;

let loadPromise: Promise<GoogleMaps> | null = null;

export function loadGoogleMaps(apiKey: string): Promise<GoogleMaps> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Maps alleen in browser"));
  }
  if (window.google?.maps) {
    return Promise.resolve(window.google.maps);
  }
  if (!loadPromise) {
    loadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
      script.async = true;
      script.onload = () => {
        if (window.google?.maps) resolve(window.google.maps);
        else reject(new Error("Google Maps laden mislukt"));
      };
      script.onerror = () => reject(new Error("Google Maps script mislukt"));
      document.head.appendChild(script);
    });
  }
  return loadPromise;
}

declare global {
  interface Window {
    google?: { maps: GoogleMaps };
  }
}
