import { describe, expect, it } from "vitest";
import { contrastRatio, hexToRgb } from "@/lib/brand-profile/color";
import { brandCss } from "@/lib/brand-profile/export-kit";
import { parseAuditMarkdown } from "@/lib/brand-profile/parse-audit-markdown";
import { composeBrandPrompt } from "@/lib/brand-profile/prompt";
import { sanitizeSvg } from "@/lib/brand-profile/svg";
import { emptyVisual, emptyVoice, type BrandColor } from "@/lib/brand-profile/types";
import { zipStore } from "@/lib/brand-profile/zip";

const audit = `# Strategische audit — Noordlicht

## 8. STP

**Positioneringszin.** Dit komt uit STP en hoort niet in het merkprofiel.

## 10. Brand audit

**Beoogde positionering.** Rust, richting, vooruitgang.
**Conclusie.** De site zegt wat het merk wil zijn.

### Bevinding · tekst (hypothese)
**Observatie.** De homepage noemt advies. (hypothese)
**Voorstel.** Maak de belofte korter.

### Imago
**Beoogd.** Warm en helder.
**Waargenomen.** De site oogt licht.

- Prioriteit: Helderder aanbod (Communicatie): herschrijf de openingszin

### Bron · Huisstijl
- Soort: Brand guidelines
- URL: https://cdn.example.com/logo.svg
**Tekst.** Merkessentie: Rust die vooruit helpt.
Lettertype: Fraunces
Kleur: donkerblauw
Primair #1B3A4B
Prompt: Een stille werkruimte bij ochtendlicht.

# Geen font
## Ook geen font
`;

describe("parseAuditMarkdown", () => {
  const parsed = parseAuditMarkdown(audit);

  it("neemt de merknaam en een expliciete richtlijn over", () => {
    expect(parsed.brandName?.value).toBe("Noordlicht");
    expect(parsed.fields.map((field) => field.key)).toContain("essence");
    expect(parsed.fields.find((field) => field.key === "essence")?.value).toBe("Rust die vooruit helpt.");
  });

  it("laat auditobservaties buiten de merkstandaard", () => {
    expect(parsed.fields.some((field) => field.value.includes("Rust, richting"))).toBe(false);
    expect(parsed.fields.some((field) => field.value.includes("STP"))).toBe(false);
    const positioning = parsed.reviews.find((item) => item.label === "Beoogde positionering");
    expect(positioning?.origin).toBe("observed");
    expect(positioning?.proposal).toEqual({ kind: "field", key: "positioning", value: "Rust, richting, vooruitgang." });
  });

  it("maakt van een kleurwoord geen hex en van een kop geen lettertype", () => {
    expect(parsed.colors.map((color) => color.hex)).toEqual(["#1B3A4B"]);
    expect(parsed.reviews.some((item) => item.label === "Kleur genoemd zonder code")).toBe(true);
    expect(parsed.styles.map((style) => style.family)).toEqual(["Fraunces"]);
    expect(parsed.styles.some((style) => style.role === "H1" && style.size)).toBe(false);
  });

  it("houdt een hypothese en een aanbeveling apart", () => {
    expect(parsed.reviews.find((item) => item.passage.includes("homepage"))?.origin).toBe("hypothesis");
    expect(parsed.reviews.find((item) => item.label === "Voorstel")?.origin).toBe("recommended");
    expect(parsed.reviews.find((item) => item.label === "Prioriteit")?.origin).toBe("recommended");
  });

  it("bewaart een prompt en een assetverwijzing zonder het bestand op te halen", () => {
    expect(parsed.prompts[0]?.body).toContain("stille werkruimte");
    expect(parsed.assetNotes[0]?.name).toBe("logo.svg");
  });

  it("meldt een document zonder merksectie", () => {
    const empty = parseAuditMarkdown("# Strategische audit — Kaap\n\n## 4. SWOT\n\n- Sterkte: team");
    expect(empty.hasBrandSection).toBe(false);
    expect(empty.warnings.join(" ")).toContain("geen merksectie");
    expect(empty.fields).toEqual([]);
  });

  it("zet tegenstrijdige richtlijnen klaar ter beoordeling", () => {
    const conflict = parseAuditMarkdown(`# Strategische audit — Kaap

## 10. Brand audit

### Bron · A
- Soort: Merkstrategie
**Tekst.** Positionering: Eerste zin.

### Bron · B
- Soort: Brand guidelines
**Tekst.** Positionering: Tweede zin.
`);
    expect(conflict.fields.some((field) => field.key === "positioning")).toBe(false);
    expect(conflict.warnings.join(" ")).toContain("Tegenstrijdige");
    expect(conflict.reviews.filter((item) => item.proposal && "key" in item.proposal && item.proposal.key === "positioning")).toHaveLength(2);
  });
});

describe("composeBrandPrompt", () => {
  it("verzint geen stijl als die niet is vastgelegd", () => {
    const prompt = composeBrandPrompt(
      { subject: "Werktafel", use: "Website", format: "16:9", message: "", composition: "", camera: "", light: "", textSpace: false, exclusions: "" },
      emptyVisual(),
      emptyVoice(),
      [],
    );
    expect(prompt.full).toContain("Werktafel");
    expect(prompt.full).toContain("echte logo's");
    expect(prompt.missing).toContain("Beeldstijl of merkkleuren");
    expect(prompt.full).not.toContain("#");
    expect(prompt.style).toBe("");
  });

  it("gebruikt alleen opgeslagen stijl en kleuren", () => {
    const visual = { ...emptyVisual(), mood: "Ochtendlicht" };
    const color = { id: "c", name: "Inkt", hex: "#1B3A4B", rgb: "rgb(27, 58, 75)", role: "primary", note: "", cmyk: "", pantone: "", sort: 0, archived: false } satisfies BrandColor;
    const prompt = composeBrandPrompt(
      { subject: "Werktafel", use: "Social", format: "1:1", message: "", composition: "", camera: "", light: "", textSpace: true, exclusions: "geen logo in beeld" },
      visual,
      emptyVoice(),
      [color],
    );
    expect(prompt.full).toContain("Ochtendlicht");
    expect(prompt.full).toContain("#1B3A4B");
    expect(prompt.full).toContain("vrije ruimte");
    expect(prompt.label).toBe("Samengesteld uit merkrichtlijnen");
  });
});

describe("brand veilig", () => {
  it("berekent rgb uit hex en laat het thema de kleur niet omkeren", () => {
    expect(hexToRgb("#1B3A4B")).toBe("rgb(27, 58, 75)");
    expect(contrastRatio("#1B3A4B", "#F4F1EA")).toBeGreaterThan(1);
    const css = brandCss({
      concept: true,
      tenantName: "Kaap",
      versionNumber: 2,
      brandName: "Kaap",
      essence: "",
      positioning: "",
      promise: "",
      audience: "",
      valuesText: "",
      styles: [{ id: "s", role: "H1", family: "Fraunces", weight: "500", italic: false, size: "", unit: "", lineHeight: "", letterSpacing: "", transform: "", usage: "", fallback: "Georgia, serif", sample: "", mobileSize: "", mobileUnit: "", sort: 0, archived: false }],
      colors: [{ id: "c", name: "Inkt", hex: "#1B3A4B", rgb: "rgb(27, 58, 75)", role: "primary", note: "", cmyk: "", pantone: "", sort: 0, archived: false }],
      fonts: [],
      assets: [],
      prompts: [],
      voiceSummary: "",
      visualSummary: "",
    });
    expect(css).toContain(".vice-brand-v2");
    expect(css).toContain("#1B3A4B");
    expect(css).not.toContain("font-size");
  });

  it("verwijdert scripts uit svg", () => {
    const clean = sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="10" height="10" onclick="alert(1)"></rect></svg>`);
    expect(clean).not.toContain("script");
    expect(clean).not.toContain("onclick");
    expect(sanitizeSvg("<p>geen svg</p>")).toBeNull();
  });

  it("maakt een zip zonder scripts", () => {
    const zip = zipStore([{ name: "brand.json", data: new TextEncoder().encode("{\"concept\":true}") }]);
    expect(zip[0]).toBe(0x50);
    expect(zip[1]).toBe(0x4b);
  });
});
