import {
  defaultPayload,
  emptyGoogleRsaPayload,
  emptyMetaCarouselPayload,
  emptyMetaSinglePayload,
  type AdFormat,
  type AdPlatform,
  type AdCopyPayload,
} from "@/lib/content/ad-types";

export type AdTemplateDefinition = {
  key: string;
  label: string;
  description: string;
  platform: AdPlatform;
  format: AdFormat;
  defaultInternalName: string;
  metaPlacements: ("facebook" | "instagram")[];
  buildPayload: () => AdCopyPayload;
};

export const AD_TEMPLATES: AdTemplateDefinition[] = [
  {
    key: "google_rsa_brand",
    label: "Google Search — merkbekendheid",
    description: "RSA met merknaam en kernboodschap in koppen.",
    platform: "google_search",
    format: "rsa",
    defaultInternalName: "Google RSA merk",
    metaPlacements: [],
    buildPayload: () => {
      const base = emptyGoogleRsaPayload();
      base.headlines = ["Merknaam | Tagline", "Ontdek ons aanbod", "Vraag een demo aan"];
      base.descriptions = [
        "Korte merkboodschap voor zoekers die al bekend zijn met je categorie.",
        "Call-to-action met voordeel voor de lezer.",
      ];
      return base;
    },
  },
  {
    key: "google_rsa_lead",
    label: "Google Search — leadgeneratie",
    description: "RSA gericht op conversie en duidelijke CTA.",
    platform: "google_search",
    format: "rsa",
    defaultInternalName: "Google RSA leads",
    metaPlacements: [],
    buildPayload: () => {
      const base = emptyGoogleRsaPayload();
      base.headlines = ["Gratis adviesgesprek", "Plan een demo", "Start vandaag nog"];
      base.descriptions = [
        "Leg het concrete voordeel uit in één zin.",
        "Verwijs naar de volgende stap zonder overdreven claims.",
      ];
      return base;
    },
  },
  {
    key: "meta_single_promo",
    label: "Meta — enkel beeld promotie",
    description: "Feed-ad met primaire tekst, kop en link.",
    platform: "meta",
    format: "single_image",
    defaultInternalName: "Meta single promotie",
    metaPlacements: ["facebook", "instagram"],
    buildPayload: () => {
      const base = emptyMetaSinglePayload();
      base.primaryText = "Korte intro die de aandacht trekt.";
      base.headline = "Kopregel op het beeld";
      base.description = "Ondertitel of extra detail";
      base.cta = "Meer info";
      return base;
    },
  },
  {
    key: "meta_carousel_story",
    label: "Meta — carrousel verhaal",
    description: "Meerdere kaarten met opeenvolgende boodschap.",
    platform: "meta",
    format: "carousel",
    defaultInternalName: "Meta carrousel",
    metaPlacements: ["facebook", "instagram"],
    buildPayload: () => {
      const base = emptyMetaCarouselPayload();
      base.primaryText = "Intro voor de hele carrousel.";
      base.cards = [
        { id: crypto.randomUUID(), headline: "Stap 1", description: "Probleem", linkUrl: "" },
        { id: crypto.randomUUID(), headline: "Stap 2", description: "Oplossing", linkUrl: "" },
        { id: crypto.randomUUID(), headline: "Stap 3", description: "Actie", linkUrl: "" },
      ];
      return base;
    },
  },
];

export function adTemplateByKey(key: string): AdTemplateDefinition | undefined {
  return AD_TEMPLATES.find((item) => item.key === key);
}

export function payloadForNewAd(
  platform: AdPlatform,
  format: AdFormat,
  templateKey?: string,
): AdCopyPayload {
  const template = templateKey ? adTemplateByKey(templateKey) : undefined;
  if (template && template.platform === platform && template.format === format) {
    return template.buildPayload();
  }
  return defaultPayload(platform, format);
}
