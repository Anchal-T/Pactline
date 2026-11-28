export const PUMP_MANUFACTURERS = ["BELL_GOSSETT", "TACO"] as const;
export type PumpManufacturer = (typeof PUMP_MANUFACTURERS)[number];

export const PUMP_MODEL_FIELDS = ["manufacturer", "series", "model", "suctionIn", "dischargeIn", "impellerIn"] as const;
export type PumpModelField = (typeof PUMP_MODEL_FIELDS)[number];

/** `MFR/SERIES/MODEL/SUCTIONxDISCHARGExIMPELLER`, with `?` for every unresolved part. */
export type CanonicalModelKey = string & { readonly _brand: "CanonicalModelKey" };

export interface CanonicalPumpModel {
  raw: string;
  /** UNKNOWN: no manufacturer, series or model was recognised. COMPLETE: every field resolved without contradiction. */
  status: "COMPLETE" | "PARTIAL" | "UNKNOWN";
  manufacturer: PumpManufacturer | null;
  series: string | null;
  model: string | null;
  suctionIn: number | null;
  dischargeIn: number | null;
  impellerIn: number | null;
  /** Fields that are absent or contradictory, in PUMP_MODEL_FIELDS order. */
  unresolved: PumpModelField[];
  /** Fields whose sources disagreed; such a field is null rather than either value. */
  conflicts: PumpModelField[];
  key: CanonicalModelKey;
}

/** Facts held outside the model string, e.g. the configuration's trim or a dimension drawing's connection sizes. */
export interface PumpModelFacts {
  manufacturer?: string;
  series?: string;
  suctionIn?: number;
  dischargeIn?: number;
  impellerIn?: number;
}

const NUM = String.raw`\d+(?:\.\d+)?(?:(?:-|\s)\d+\/\d+)?`;
const TRIM = new RegExp(String.raw`(?:(${NUM})\s*(?:"|IN\.?|INCH(?:ES)?)?\s*(?:IMPELLER|IMP\.?|TRIM|DIA\.?)(?![A-Z]))|(?:(?:IMPELLER|TRIM)\s*(?:DIA\.?)?\s*[:=]?\s*(${NUM}))`);
const CONNECTIONS = new RegExp(String.raw`(${NUM})\s*(?:"|IN\.?)?\s*[X×]\s*(${NUM})(?!\s*[A-Z]{2}\b)`);
const BG_MODEL = new RegExp(String.raw`(?<![\d.])(${NUM})\s*([A-E]{2})(?![A-Z])`);
const TACO_FI = /\bFI\s*-?\s*(\d{2})(\d{2})([A-Z]?)(?![A-Z0-9])/;

/** Taco FI discharge size codes, read from the first two digits of the model number (FI1206D: 12 = 1-1/4 in). */
const TACO_DISCHARGE_IN: Readonly<Record<string, number>> = { "12": 1.25, "15": 1.5, "20": 2, "25": 2.5, "30": 3, "40": 4, "50": 5, "60": 6, "80": 8 };

/**
 * Canonicalises a centrifugal pump model string. Fields the text and facts do not state stay null and are
 * listed as unresolved; nothing is inferred from catalogue knowledge beyond the model number's own encoding.
 */
export function canonicalizePumpModel(raw: string, facts: PumpModelFacts = {}): CanonicalPumpModel {
  let text = normalize([facts.manufacturer, facts.series, raw].filter(Boolean).join(" "));
  const conflicts = new Set<PumpModelField>();
  const merge = (field: PumpModelField, ...values: Array<number | null | undefined>): number | null => {
    const known = [...new Set(values.filter((v): v is number => v !== null && v !== undefined))];
    if (known.length > 1) conflicts.add(field);
    return known.length === 1 ? known[0]! : null;
  };

  const manufacturer = /\bB\s*&\s*G\b|\bBELL\s*(?:&|AND)\s*GOSSETT\b|\bXYLEM\b/.test(text) ? "BELL_GOSSETT" : /\bTACO\b/.test(text) ? "TACO" : null;

  let trim: number | null = null;
  const trimMatch = TRIM.exec(text);
  if (trimMatch) {
    trim = parseSize(trimMatch[1] ?? trimMatch[2]!);
    text = text.replace(trimMatch[0], " ");
  }

  let series: string | null = null;
  let model: string | null = null;
  let modelDischarge: number | null = null;
  const fi = TACO_FI.exec(text);
  const e1510 = /\bE\s*-?\s*1510\b/.test(text);
  if (fi && manufacturer !== "BELL_GOSSETT") {
    series = "FI";
    model = `FI${fi[1]}${fi[2]}${fi[3]}`;
    modelDischarge = TACO_DISCHARGE_IN[fi[1]!] ?? null;
    text = text.replace(fi[0], " ");
  } else if (e1510 || manufacturer === "BELL_GOSSETT") {
    if (e1510) series = "e-1510";
    const bg = BG_MODEL.exec(text.replace(/\bE\s*-?\s*1510\b/, " "));
    if (bg) {
      modelDischarge = parseSize(bg[1]!);
      model = `${formatSize(modelDischarge)}${bg[2]}`;
      text = text.replace(bg[0], " ");
    }
  }

  const connections = CONNECTIONS.exec(text);
  const suctionIn = merge("suctionIn", connections ? parseSize(connections[1]!) : null, facts.suctionIn);
  const dischargeIn = merge("dischargeIn", modelDischarge, connections ? parseSize(connections[2]!) : null, facts.dischargeIn);
  const impellerIn = merge("impellerIn", trim, facts.impellerIn);

  const values: Record<PumpModelField, unknown> = { manufacturer, series, model, suctionIn, dischargeIn, impellerIn };
  const unresolved = PUMP_MODEL_FIELDS.filter((f) => values[f] === null);
  const status = manufacturer === null && series === null && model === null ? "UNKNOWN" : unresolved.length === 0 ? "COMPLETE" : "PARTIAL";
  const part = (v: string | number | null) => (v === null ? "?" : typeof v === "number" ? formatSize(v) : v);
  const key = `${part(manufacturer)}/${part(series)}/${part(model)}/${part(suctionIn)}x${part(dischargeIn)}x${part(impellerIn)}` as CanonicalModelKey;

  return { raw, status, manufacturer, series, model, suctionIn, dischargeIn, impellerIn, unresolved, conflicts: PUMP_MODEL_FIELDS.filter((f) => conflicts.has(f)), key };
}

function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[″“”]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** "1-1/4", "1 1/4" and "1.25" all read as 1.25. */
function parseSize(token: string): number {
  const mixed = /^(\d+)(?:-|\s)(\d+)\/(\d+)$/.exec(token.trim());
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  return Number(token);
}

function formatSize(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}
