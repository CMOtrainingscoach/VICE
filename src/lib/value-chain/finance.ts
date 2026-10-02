/**
 * Financiële rekenregels voor de waardeketen.
 * Het taalmodel stelt interpretaties voor; deze functies rekenen.
 * Een leeg of onbekend bedrag is null en telt nooit als nul.
 * Bedragen lopen in minor units van 4 decimalen (1 eenheid = 10_000).
 */

export type VcScale = "units" | "thousands" | "millions";
export type VcLineKind = "detail" | "subtotal" | "total";
export type VcExtractStatus = "proposed" | "confirmed" | "excluded" | "uncertain";
export type VcFigureType = "actual" | "budget" | "forecast";
export type DecimalMode = "comma" | "point" | "auto";

const SCALE: Record<VcScale, bigint> = {
  units: 1n,
  thousands: 1000n,
  millions: 1_000_000n,
};

const MINOR = 10000n;

export type ParsedAmount = {
  minor: bigint | null;
  uncertain: boolean;
  formula: boolean;
};

export type CostLine = {
  id: string;
  amount: string | null;
  scale: VcScale;
  kind: VcLineKind;
  status: VcExtractStatus;
  inScope: boolean;
  currency: string;
  periodKey: string;
  entityKey: string;
  figureType: VcFigureType;
  isRevenue: boolean;
};

export type AllocationLine = {
  lineId: string;
  activityId: string;
  /** Bedrag in dezelfde documenteenheid als de bronregel. null = nog niet ingevuld. */
  amount: string | null;
  status: "proposed" | "confirmed";
};

export type ReconcileBucket = {
  key: string;
  currency: string;
  periodKey: string;
  entityKey: string;
  figureType: VcFigureType;
  /** Som van bekende detailregels binnen scope. */
  knownSourceMinor: bigint;
  unknownCount: number;
  outOfScopeMinor: bigint;
  outOfScopeUnknown: number;
  assignedConfirmedMinor: bigint;
  assignedProposedMinor: bigint;
  /** null zolang er onbekende bedragen binnen scope zijn: dan is er geen sluitend restant. */
  unassignedMinor: bigint | null;
  documentTotalMinor: bigint | null;
  /** null wanneer het document te weinig informatie geeft om aan te sluiten. */
  tieDifferenceMinor: bigint | null;
  incomplete: boolean;
};

export type MarginView =
  | { kind: "insufficient" }
  | {
      kind: "costs_only";
      currency: string;
      periodKey: string;
      knownSourceMinor: bigint;
      unassignedMinor: bigint | null;
      incomplete: boolean;
      largest: { id: string; minor: bigint }[];
    }
  | {
      kind: "margin";
      currency: string;
      periodKey: string;
      entityKey: string;
      figureType: VcFigureType;
      revenueMinor: bigint;
      costMinor: bigint;
      resultMinor: bigint;
      formula: string;
    }
  | { kind: "blocked"; reason: string };

function stripCurrency(raw: string): string {
  return raw.replace(/€|\$|eur|usd/gi, "").trim();
}

/** Leeg blijft null. Een formule wordt niet uitgevoerd. */
export function parseAmount(raw: string | null | undefined, decimal: DecimalMode = "auto"): ParsedAmount {
  if (raw == null) return { minor: null, uncertain: false, formula: false };
  const trimmed = stripCurrency(String(raw));
  if (!trimmed || trimmed === "-" || trimmed === "—") {
    return { minor: null, uncertain: false, formula: false };
  }
  if (trimmed.startsWith("=")) return { minor: null, uncertain: true, formula: true };

  let body = trimmed.replace(/\s/g, "");
  let negative = false;
  if (/^\(.*\)$/.test(body)) {
    negative = true;
    body = body.slice(1, -1);
  }
  if (body.startsWith("-") || body.startsWith("−")) {
    negative = !negative;
    body = body.slice(1);
  }
  if (!body) return { minor: null, uncertain: true, formula: false };
  if (!/^[\d.,]+$/.test(body)) return { minor: null, uncertain: true, formula: false };

  const lastComma = body.lastIndexOf(",");
  const lastDot = body.lastIndexOf(".");
  let decSep: "," | "." | null = null;
  let uncertain = false;

  if (lastComma >= 0 && lastDot >= 0) {
    decSep = lastComma > lastDot ? "," : ".";
  } else if (decimal === "comma" && lastComma >= 0) {
    decSep = ",";
  } else if (decimal === "point" && lastDot >= 0) {
    decSep = ".";
  } else if (decimal === "auto") {
    const sep = lastComma >= 0 ? "," : lastDot >= 0 ? "." : null;
    const idx = sep === "," ? lastComma : lastDot;
    if (sep && idx >= 0) {
      const fracLen = body.length - idx - 1;
      const thousand = new RegExp(`\\${sep}\\d{3}(\\${sep}\\d{3})+$`);
      if (thousand.test(body)) decSep = null;
      else if (fracLen === 3 && !body.slice(0, idx).includes(sep)) {
        decSep = sep;
        uncertain = true;
      } else decSep = sep;
    }
  } else {
    const sep = decimal === "comma" ? "," : ".";
    if (body.includes(sep)) decSep = sep;
  }

  let whole = body;
  let frac = "";
  if (decSep) {
    const idx = body.lastIndexOf(decSep);
    whole = body.slice(0, idx);
    frac = body.slice(idx + 1);
    const thou = decSep === "," ? "." : ",";
    whole = whole.split(thou).join("");
  } else {
    whole = body.replace(/[.,]/g, "");
  }

  if (!/^\d+$/.test(whole) || (frac && !/^\d+$/.test(frac))) {
    return { minor: null, uncertain: true, formula: false };
  }
  const fracPadded = (frac + "0000").slice(0, 4);
  let minor = BigInt(whole) * MINOR + BigInt(fracPadded || "0");
  if (negative) minor = -minor;
  return { minor, uncertain, formula: false };
}

export function toMinor(raw: string | null | undefined, scale: VcScale, decimal: DecimalMode = "auto"): ParsedAmount {
  const parsed = parseAmount(raw, decimal);
  if (parsed.minor == null) return parsed;
  return { ...parsed, minor: parsed.minor * SCALE[scale] };
}

export function minorToAmountString(minor: bigint): string {
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const whole = abs / MINOR;
  const frac = (abs % MINOR).toString().padStart(4, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole.toString()}${frac ? "." + frac : ""}`;
}

export function formatMinor(minor: bigint, currency?: string): string {
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const whole = (abs / MINOR).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const frac = (abs % MINOR).toString().padStart(4, "0").slice(0, 2);
  const body = `${neg ? "−" : ""}${whole},${frac}`;
  return currency ? `${body} ${currency}` : body;
}

function lineMinor(line: CostLine): ParsedAmount {
  return toMinor(line.amount, line.scale, "point");
}

function bucketKey(line: Pick<CostLine, "entityKey" | "currency" | "periodKey" | "figureType">): string {
  return [line.entityKey, line.currency, line.periodKey, line.figureType].join("|");
}

function countsInTotal(line: CostLine): boolean {
  return line.kind === "detail" && line.status !== "excluded" && line.status !== "uncertain";
}

export function reconcile(lines: readonly CostLine[], allocations: readonly AllocationLine[]): ReconcileBucket[] {
  const groups = new Map<string, CostLine[]>();
  for (const line of lines) {
    const key = bucketKey(line);
    const list = groups.get(key) ?? [];
    list.push(line);
    groups.set(key, list);
  }

  const buckets: ReconcileBucket[] = [];
  for (const [key, group] of groups) {
    const head = group[0]!;
    let knownSource = 0n;
    let unknownCount = 0;
    let outOfScope = 0n;
    let outUnknown = 0;
    let detailSumKnown = 0n;
    let detailUnknown = false;

    for (const line of group) {
      if (!countsInTotal(line)) continue;
      const parsed = lineMinor(line);
      if (parsed.minor == null || parsed.uncertain || parsed.formula) {
        detailUnknown = true;
        if (line.inScope) unknownCount += 1;
        else outUnknown += 1;
        continue;
      }
      detailSumKnown += parsed.minor;
      if (line.inScope) knownSource += parsed.minor;
      else outOfScope += parsed.minor;
    }

    const inScopeIds = new Set(group.filter((l) => l.inScope && countsInTotal(l)).map((l) => l.id));
    let assignedConfirmed = 0n;
    let assignedProposed = 0n;
    for (const alloc of allocations) {
      if (!inScopeIds.has(alloc.lineId) || alloc.amount == null) continue;
      const line = group.find((l) => l.id === alloc.lineId);
      if (!line) continue;
      const parsed = toMinor(alloc.amount, line.scale, "point");
      if (parsed.minor == null) continue;
      if (alloc.status === "confirmed") assignedConfirmed += parsed.minor;
      else assignedProposed += parsed.minor;
    }

    const totals = group.filter((l) => l.kind === "total" && l.status === "confirmed" && l.inScope);
    let documentTotal: bigint | null = null;
    let tie: bigint | null = null;
    if (totals.length === 1 && !detailUnknown) {
      const parsed = lineMinor(totals[0]!);
      if (parsed.minor != null && !parsed.uncertain && !parsed.formula) {
        documentTotal = parsed.minor;
        tie = documentTotal - detailSumKnown;
      }
    }

    const incomplete = unknownCount > 0;
    buckets.push({
      key,
      currency: head.currency,
      periodKey: head.periodKey,
      entityKey: head.entityKey,
      figureType: head.figureType,
      knownSourceMinor: knownSource,
      unknownCount,
      outOfScopeMinor: outOfScope,
      outOfScopeUnknown: outUnknown,
      assignedConfirmedMinor: assignedConfirmed,
      assignedProposedMinor: assignedProposed,
      unassignedMinor: incomplete ? null : knownSource - assignedConfirmed - assignedProposed,
      documentTotalMinor: documentTotal,
      tieDifferenceMinor: tie,
      incomplete,
    });
  }
  return buckets;
}

export type DriverSplit =
  | { ok: true; parts: { id: string; minor: bigint }[]; remainder: bigint; formula: string }
  | { ok: false; error: string };

/**
 * Verdeelt een bekend bronbedrag op een expliciete basis.
 * Ontbrekende basiswaarden leiden niet tot een gelijke verdeling.
 */
export function splitByDriver(
  sourceMinor: bigint,
  drivers: readonly { id: string; value: string | null }[],
  basisLabel: string,
): DriverSplit {
  if (drivers.length === 0) return { ok: false, error: "Kies minstens één activiteit om over te verdelen." };
  if (drivers.some((d) => d.value == null || d.value.trim() === "")) {
    return {
      ok: false,
      error: "De verdeelbasis is niet voor elke activiteit bekend. Er is geen automatische gelijke verdeling.",
    };
  }
  const parsed = drivers.map((d) => ({ id: d.id, minor: parseAmount(d.value, "point").minor }));
  if (parsed.some((p) => p.minor == null)) {
    return { ok: false, error: "Een basiswaarde is geen bruikbaar getal." };
  }
  const values = parsed.map((p) => p.minor!);
  if (values.some((v) => v < 0n)) return { ok: false, error: "Een verdeelbasis kan niet negatief zijn." };
  const sum = values.reduce((a, b) => a + b, 0n);
  if (sum === 0n) return { ok: false, error: "De verdeelbasis is nul, dus er is niets om op te verdelen." };

  const parts = values.map((v, i) => ({
    id: parsed[i]!.id,
    minor: (sourceMinor * v) / sum,
  }));
  const allocated = parts.reduce((a, p) => a + p.minor, 0n);
  const remainder = sourceMinor - allocated;
  const formula = `${formatMinor(sourceMinor)} verdeeld naar ${basisLabel}: ${values
    .map((v, i) => `${parsed[i]!.id} ${v.toString()}/${sum.toString()}`)
    .join(", ")}. Restant door afronding: ${formatMinor(remainder)}.`;
  return { ok: true, parts, remainder, formula };
}

export function splitByPercent(
  sourceMinor: bigint,
  parts: readonly { id: string; percent: string | null }[],
): DriverSplit {
  if (parts.length === 0) return { ok: false, error: "Kies minstens één activiteit." };
  if (parts.some((p) => p.percent == null || p.percent.trim() === "")) {
    return { ok: false, error: "Vul elk percentage expliciet in. Er is geen automatische gelijke verdeling." };
  }
  const parsed = parts.map((p) => parseAmount(p.percent, "point"));
  if (parsed.some((p) => p.minor == null || p.uncertain)) {
    return { ok: false, error: "Een percentage is niet eenduidig." };
  }
  const bps = parsed.map((p) => p.minor!);
  if (bps.some((b) => b < 0n)) return { ok: false, error: "Een percentage kan niet negatief zijn." };
  const sum = bps.reduce((a, b) => a + b, 0n);
  if (sum > 100n * MINOR) return { ok: false, error: "De percentages samen zijn meer dan 100." };

  const out = bps.map((b, i) => ({
    id: parts[i]!.id,
    minor: (sourceMinor * b) / (100n * MINOR),
  }));
  const allocated = out.reduce((a, p) => a + p.minor, 0n);
  const remainder = sourceMinor - allocated;
  const formula = `${formatMinor(sourceMinor)} × expliciete percentages (${bps
    .map((b) => minorToAmountString(b))
    .join(" + ")}). Niet-toegewezen restant: ${formatMinor(remainder)}.`;
  return { ok: true, parts: out, remainder, formula };
}

export type AllocationCheck =
  | { ok: true; remainder: bigint }
  | { ok: false; error: string };

/** Het toegewezen bedrag mag het bronbedrag niet overschrijden. Teken blijft behouden. */
export function checkAllocation(sourceMinor: bigint | null, allocated: readonly bigint[]): AllocationCheck {
  if (sourceMinor == null) {
    return { ok: false, error: "Een onbekend bedrag kan niet worden toegewezen en telt niet als nul." };
  }
  for (const part of allocated) {
    if (sourceMinor === 0n && part !== 0n) {
      return { ok: false, error: "Op een bron van nul kan niets worden toegewezen." };
    }
    if (sourceMinor > 0n && part < 0n) {
      return { ok: false, error: "Een positieve kost kan geen negatieve toewijzing krijgen." };
    }
    if (sourceMinor < 0n && part > 0n) {
      return { ok: false, error: "Een negatieve correctie blijft negatief en wordt geen gewone kost." };
    }
  }
  const sum = allocated.reduce((a, b) => a + b, 0n);
  if (sourceMinor >= 0n && sum > sourceMinor) {
    return { ok: false, error: "Er is meer toegewezen dan het beschikbare bedrag." };
  }
  if (sourceMinor < 0n && sum < sourceMinor) {
    return { ok: false, error: "De correctie is verder verdeeld dan het bronbedrag." };
  }
  return { ok: true, remainder: sourceMinor - sum };
}

export function marginView(lines: readonly CostLine[], allocations: readonly AllocationLine[]): MarginView {
  const usable = lines.filter((l) => countsInTotal(l) && l.inScope);
  if (usable.length === 0) return { kind: "insufficient" };

  const keys = new Set(usable.map(bucketKey));
  if (keys.size > 1) {
    return {
      kind: "blocked",
      reason: "Entiteit, valuta, periode of cijfertype verschillen. Die worden niet vermengd.",
    };
  }

  const buckets = reconcile(lines, allocations);
  const bucket = buckets[0];
  if (!bucket) return { kind: "insufficient" };

  const revenues = usable.filter((l) => l.isRevenue);
  const costs = usable.filter((l) => !l.isRevenue);

  if (revenues.length === 0) {
    const largest = costs
      .map((l) => ({ id: l.id, minor: lineMinor(l).minor }))
      .filter((l): l is { id: string; minor: bigint } => l.minor != null)
      .sort((a, b) => (a.minor > b.minor ? -1 : 1))
      .slice(0, 3);
    return {
      kind: "costs_only",
      currency: bucket.currency,
      periodKey: bucket.periodKey,
      knownSourceMinor: bucket.knownSourceMinor,
      unassignedMinor: bucket.unassignedMinor,
      incomplete: bucket.incomplete,
      largest,
    };
  }

  if (bucket.incomplete || revenues.some((l) => lineMinor(l).minor == null) || costs.some((l) => lineMinor(l).minor == null && l.status === "confirmed")) {
    return { kind: "blocked", reason: "Omzet of kosten zijn onvolledig. Er wordt geen marge berekend." };
  }

  const confirmedRevenue = revenues.filter((l) => l.status === "confirmed");
  const confirmedCost = costs.filter((l) => l.status === "confirmed");
  if (confirmedRevenue.length !== revenues.length || confirmedCost.length !== costs.length) {
    return { kind: "blocked", reason: "Onbevestigde financiële gegevens verschijnen niet als definitieve marge." };
  }

  const revenueMinor = confirmedRevenue.reduce((a, l) => a + (lineMinor(l).minor ?? 0n), 0n);
  const costMinor = confirmedCost.reduce((a, l) => a + (lineMinor(l).minor ?? 0n), 0n);
  return {
    kind: "margin",
    currency: bucket.currency,
    periodKey: bucket.periodKey,
    entityKey: bucket.entityKey,
    figureType: bucket.figureType,
    revenueMinor,
    costMinor,
    resultMinor: revenueMinor - costMinor,
    formula: `resultaat = bevestigde omzet (${formatMinor(revenueMinor, bucket.currency)}) − bevestigde kosten (${formatMinor(costMinor, bucket.currency)}), ${bucket.periodKey}, ${bucket.entityKey}, ${bucket.figureType}. Dit is geen cashflow.`,
  };
}

/** Marge per activiteit bestaat alleen met een bevestigde omzettoewijzing naar die activiteit. */
export function activityMargin(activityId: string, lines: readonly CostLine[], allocations: readonly AllocationLine[]): MarginView {
  const revenueAllocs = allocations.filter((a) => a.activityId === activityId && a.status === "confirmed");
  const revenueLineIds = new Set(
    revenueAllocs
      .filter((a) => lines.some((l) => l.id === a.lineId && l.isRevenue))
      .map((a) => a.lineId),
  );
  if (revenueLineIds.size === 0) {
    return { kind: "blocked", reason: "Geen verantwoorde omzettoewijzing naar deze activiteit, dus geen marge per activiteit." };
  }
  return marginView(
    lines.filter((l) => revenueLineIds.has(l.id) || (!l.isRevenue && revenueAllocs.some((a) => a.lineId === l.id && a.activityId === activityId))),
    revenueAllocs,
  );
}

export function timeToCost(
  timeValue: string | null,
  timeUnit: string,
  rate: string | null,
  rateUnit: string,
  rateConfirmed: boolean,
): { minor: bigint } | { error: string } {
  if (!rateConfirmed || rate == null || rate.trim() === "") {
    return { error: "Tijd wordt alleen omgezet met een expliciet bevestigde kostprijs." };
  }
  if (timeUnit !== rateUnit) {
    return { error: "De tijdseenheid en de kostprijs-eenheid komen niet overeen." };
  }
  const time = parseAmount(timeValue, "point");
  const price = parseAmount(rate, "point");
  if (time.minor == null) return { error: "Tijdsbesteding is onbekend en telt niet als nul." };
  if (price.minor == null) return { error: "Kostprijs is onbekend." };
  return { minor: (time.minor * price.minor) / MINOR };
}

export function parseCsv(text: string): { delimiter: string; rows: string[][] } {
  const sample = text.slice(0, 2000);
  const delimiter = [";", "\t", ","].sort(
    (a, b) => (sample.split(b).length) - (sample.split(a).length),
  )[0] ?? ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  return { delimiter, rows: rows.filter((r) => r.some((c) => c.trim() !== "")) };
}

export type MappedLine = {
  rowIndex: number;
  code: string;
  description: string;
  amountRaw: string;
  amount: string | null;
  uncertain: boolean;
  formula: boolean;
  kind: VcLineKind;
  possibleDuplicate: boolean;
};

export function mapCsvLines(
  rows: readonly (readonly string[])[],
  columns: { description: number; amount: number; code?: number },
  decimal: DecimalMode,
): MappedLine[] {
  const body = rows.slice(1);
  const seen = new Set<string>();
  return body.map((row, index) => {
    const description = (row[columns.description] ?? "").trim();
    const amountRaw = (row[columns.amount] ?? "").trim();
    const code = columns.code == null ? "" : (row[columns.code] ?? "").trim();
    const parsed = parseAmount(amountRaw, decimal);
    const lower = description.toLowerCase();
    let kind: VcLineKind = "detail";
    if (/\bsubtotaal\b|\bsubtotal\b/.test(lower)) kind = "subtotal";
    else if (/\btotaal\b|\btotal\b|\bsom\b/.test(lower)) kind = "total";
    const dupKey = `${code}|${description}|${amountRaw}`;
    const possibleDuplicate = seen.has(dupKey);
    seen.add(dupKey);
    return {
      rowIndex: index + 1,
      code,
      description,
      amountRaw,
      amount: parsed.minor == null ? null : minorToAmountString(parsed.minor),
      uncertain: parsed.uncertain || parsed.formula,
      formula: parsed.formula,
      kind,
      possibleDuplicate,
    };
  });
}
