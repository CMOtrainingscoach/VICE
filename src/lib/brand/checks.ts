import type { BrandWorkbench } from "@/lib/brand/types";

export type BrandCheck = { id: string; label: string; level: "ready" | "attention" | "block"; detail: string };

export function brandChecks(wb: BrandWorkbench): BrandCheck[] {
  const checks: BrandCheck[] = [];
  const dims = wb.dimensions;
  const open = dims.filter((item) => !item.judgement);
  checks.push(open.length === 0
    ? { id: "dimensions", label: "Modelonderdelen", level: "ready", detail: wb.version.model === "aaker" ? "Aaker is per dimensie beoordeeld." : "Keller is per niveau beoordeeld." }
    : { id: "dimensions", label: "Modelonderdelen", level: "block", detail: "Beoordeel elk onderdeel. Onbekend mag, leeg niet." });
  const unknown = dims.filter((item) => item.evidence_status === "unknown" || item.judgement === "not_assessable");
  if (unknown.length > 0 && wb.version.accepted_uncertainty.trim().length < 10) {
    checks.push({ id: "uncertainty", label: "Onzekerheid", level: "block", detail: "Onbekend is geen slechte prestatie. Benoem wat je accepteert." });
  } else if (unknown.length > 0) {
    checks.push({ id: "uncertainty", label: "Onzekerheid", level: "attention", detail: `${unknown.length} onderdeel blijft onbekend of niet te beoordelen.` });
  }
  const external = wb.sources.some((source) => source.kind === "public" && source.excerpt.trim().length > 0)
    || wb.sources.some((source) => source.material_type === "research" && source.excerpt.trim().length > 20);
  checks.push(external
    ? { id: "perception", label: "Marktperceptie", level: "ready", detail: "Er is minstens één externe of onderzoeksbron. Die dekt de markt niet volledig." }
    : { id: "perception", label: "Marktperceptie", level: "attention", detail: "Geen onafhankelijke perceptiedata. Dat is geen bewijs van een zwak merk." });
  const said = wb.version.verdict.trim().length >= 8 || wb.version.unassessed.trim().length >= 8;
  checks.push(said
    ? { id: "verdict", label: "Conclusie", level: "ready", detail: "Er is een conclusie of een expliciete grens aan wat nog niet te beoordelen is." }
    : { id: "verdict", label: "Conclusie", level: "block", detail: "Schrijf een conclusie, of benoem wat nog niet te beoordelen is." });
  if (wb.version.needs_review) {
    checks.push({ id: "review", label: "Afhankelijkheden", level: "attention", detail: wb.version.review_note || "STP of persona's zijn nieuwer." });
  }
  const readyPages = wb.pages.filter((page) => page.included && page.status === "ready").length;
  const selectedPages = wb.pages.filter((page) => page.included && page.status !== "excluded").length;
  if (selectedPages > 0) {
    checks.push({
      id: "pages",
      label: "Website",
      level: readyPages === selectedPages ? "ready" : "attention",
      detail: readyPages === 0
        ? "Nog geen paginatekst opgehaald. De audit kan verder zonder scan."
        : `${readyPages} van ${selectedPages} geselecteerde pagina's gelezen.${wb.pages.some((page) => page.screenshot_path) ? " Homepage-snapshot bewaard." : " Geen homepage-snapshot."}`,
    });
  }
  return checks;
}

export function approvalBlocked(checks: BrandCheck[]): boolean {
  return checks.some((check) => check.level === "block");
}
