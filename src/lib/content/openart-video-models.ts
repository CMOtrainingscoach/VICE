/** OpenArt image-to-video model slugs (capability prefix). */
export type OpenArtVideoModel = "kling2-6" | "byte-plus-seedance-2-5";

export const DEFAULT_OPENART_VIDEO_MODEL: OpenArtVideoModel = "kling2-6";

export function parseOpenArtVideoModel(value: unknown): OpenArtVideoModel {
  if (value === "byte-plus-seedance-2-5") return "byte-plus-seedance-2-5";
  return "kling2-6";
}

export function openArtVideoModelLabel(model: OpenArtVideoModel): string {
  return OPENART_VIDEO_MODELS.find((m) => m.id === model)?.label ?? model;
}

export type OpenArtVideoModelOption = {
  id: OpenArtVideoModel;
  label: string;
  /** Korte uitleg onder de dropdown */
  summary: string;
};

export const OPENART_VIDEO_MODELS: OpenArtVideoModelOption[] = [
  {
    id: "kling2-6",
    label: "Kling 2.6",
    summary:
      "Sterk in mensen, gezichten en subtiele beweging. Ideaal voor reels met een personage of product in beeld.",
  },
  {
    id: "byte-plus-seedance-2-5",
    label: "Seedance 2.5",
    summary:
      "Snel en cinematisch; goed voor camera-beweging, sfeer en dynamische scènes. Volgt je startbeeld en prompt goed.",
  },
];

export const OPENART_VIDEO_MODEL_HELP = {
  title: "Welk OpenArt-model kies je?",
  intro:
    "Beide modellen werken via jouw OpenArt-abonnement. VICE stuurt je startbeeld en motion prompt door; OpenArt rekent de generatie af op je platformtegoed. In VICE betaal je daarnaast het klant-video-tegoed.",
  sections: [
    {
      heading: "Kling 2.6 — wanneer?",
      body:
        "Kies Kling 2.6 als een persoon, influencer of merkfiguur centraal staat en je natuurlijke lichaams- of gezichtsbeweging wilt (bijv. knipoog, handgebaar, zachte pose). Ook geschikt als je 720p (goedkoper) of 1080p (pro) expliciet wilt instellen via de resolutie-keuze.",
    },
    {
      heading: "Seedance 2.5 — wanneer?",
      body:
        "Kies Seedance 2.5 voor meer filmische beweging: in- of uitzoomen, parallax, sfeer in interieurs, productshots met flair. Handig als je prompt vooral camera en omgeving beschrijft in plaats van micro-expressies.",
    },
    {
      heading: "Praktische tips",
      body:
        "Gebruik een scherp startbeeld (geen blur), houd de motion prompt concreet (wat beweegt, hoe snel, welke sfeer). Bij twijfel: personen → Kling 2.6; sfeer/camera → Seedance 2.5. Je kunt per concept wisselen vóór je op Genereer MP4 drukt.",
    },
  ],
};
