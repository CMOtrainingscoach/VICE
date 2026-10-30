export type ContentTypeId = "social" | "blog" | "email" | "beeld" | "ads";

export type ContentType = {
  id: ContentTypeId;
  title: string;
  description: string;
  href: string;
};

export function contentTypes(tenantId: string): ContentType[] {
  const base = `/klanten/${tenantId}/content`;
  return [
    {
      id: "social",
      title: "Socialmediapost",
      description: "Bereid een single, carrousel of reel voor je kanalen voor.",
      href: `${base}/social`,
    },
    {
      id: "blog",
      title: "Blogpost",
      description: "Werk een onderwerp uit tot een artikel.",
      href: `${base}/blog`,
    },
    {
      id: "email",
      title: "E-mail",
      description: "Maak een duidelijke mail voor je doelgroep.",
      href: `${base}/email`,
    },
    {
      id: "beeld",
      title: "Beeldmateriaal",
      description: "Creëer visuals in de stijl van je merk.",
      href: `${base}/beeld`,
    },
    {
      id: "ads",
      title: "Advertenties",
      description: "Bereid Google Search- en Meta-creatives voor (export, nog geen live publish).",
      href: `${base}/ads`,
    },
  ];
}
