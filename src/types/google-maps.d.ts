/** Minimal Maps JS typings for Leadgen. */
declare namespace google.maps {
  class Map {
    constructor(el: HTMLElement, opts?: Record<string, unknown>);
  }
  class Marker {
    constructor(opts?: { map?: Map; position?: { lat: number; lng: number } });
  }
  class Circle {
    constructor(opts?: Record<string, unknown>);
  }
  namespace places {
    class Autocomplete {
      constructor(input: HTMLInputElement, opts?: Record<string, unknown>);
      addListener(event: string, handler: () => void): MapsEventListener;
      getPlace(): {
        place_id?: string;
        formatted_address?: string;
        name?: string;
        geometry?: { location?: { lat(): number; lng(): number } };
      };
    }
  }
  interface MapsEventListener {
    remove(): void;
  }
}

declare const google: {
  maps: typeof google.maps;
};

interface Window {
  google?: typeof google;
}
