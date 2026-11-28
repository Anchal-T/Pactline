import type { CanonicalPumpModel, PumpModelField } from "./pump-model.js";
import { jaroWinkler, trigramSimilarity } from "./similarity.js";

export type AgreementLevel = "EXACT" | "FUZZY" | "DISAGREE" | "MISSING";
export type MatchDecision = "MATCH" | "POSSIBLE" | "NON_MATCH";

/** P(level | true match) and P(level | non-match). A level without a pair contributes nothing. */
export type FieldWeights = Partial<Record<Exclude<AgreementLevel, "MISSING">, { m: number; u: number }>>;

export interface MatchConfig {
  fields: Readonly<Record<PumpModelField, FieldWeights>>;
  /** Jaro-Winkler at or above this on the model number counts as FUZZY agreement. */
  fuzzyModelThreshold: number;
  /** Two numeric sizes within this many inches agree. */
  sizeToleranceIn: number;
  thresholds: { match: number; possible: number };
  /** pg_trgm-equivalent similarity a candidate needs to be scored at all. */
  blockingThreshold: number;
}

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  fields: {
    manufacturer: { EXACT: { m: 0.98, u: 0.3 }, DISAGREE: { m: 0.02, u: 0.7 } },
    series: { EXACT: { m: 0.95, u: 0.1 }, DISAGREE: { m: 0.05, u: 0.9 } },
    model: { EXACT: { m: 0.9, u: 0.005 }, FUZZY: { m: 0.07, u: 0.03 }, DISAGREE: { m: 0.03, u: 0.965 } },
    suctionIn: { EXACT: { m: 0.95, u: 0.2 }, DISAGREE: { m: 0.05, u: 0.8 } },
    dischargeIn: { EXACT: { m: 0.95, u: 0.2 }, DISAGREE: { m: 0.05, u: 0.8 } },
    impellerIn: { EXACT: { m: 0.9, u: 0.05 }, DISAGREE: { m: 0.005, u: 0.95 } },
  },
  fuzzyModelThreshold: 0.92,
  sizeToleranceIn: 0.01,
  thresholds: { match: 15, possible: 5 },
  blockingThreshold: 0.3,
};

export interface FieldContribution {
  field: PumpModelField;
  level: AgreementLevel;
  left: string | number | null;
  right: string | number | null;
  /** log2(m / u); 0 when either side is missing. */
  weight: number;
  similarity?: number;
}

export interface MatchResult {
  score: number;
  decision: MatchDecision;
  contributions: FieldContribution[];
}

export interface ResolverRecord<Id extends string = string> {
  id: Id;
  model: CanonicalPumpModel;
}

export interface Candidate<Id extends string> extends MatchResult {
  id: Id;
  blockingSimilarity: number;
}

/** Fellegi-Sunter comparison of two canonical models: sum of per-field log-likelihood weights. */
export function matchPumpModels(left: CanonicalPumpModel, right: CanonicalPumpModel, config: MatchConfig = DEFAULT_MATCH_CONFIG): MatchResult {
  const contributions = (Object.keys(config.fields) as PumpModelField[]).map((field) => {
    const a = left[field];
    const b = right[field];
    let level: AgreementLevel;
    let similarity: number | undefined;
    if (a === null || b === null) level = "MISSING";
    else if (typeof a === "number" && typeof b === "number") level = Math.abs(a - b) <= config.sizeToleranceIn ? "EXACT" : "DISAGREE";
    else if (a === b) level = "EXACT";
    else if (field === "model") {
      similarity = jaroWinkler(String(a), String(b));
      level = similarity >= config.fuzzyModelThreshold ? "FUZZY" : "DISAGREE";
    } else level = "DISAGREE";
    const pair = level === "MISSING" ? undefined : config.fields[field][level];
    const weight = pair ? Math.log2(pair.m / pair.u) : 0;
    return { field, level, left: a, right: b, weight, ...(similarity === undefined ? {} : { similarity }) };
  });
  const score = contributions.reduce((sum, c) => sum + c.weight, 0);
  const decision = score >= config.thresholds.match ? "MATCH" : score >= config.thresholds.possible ? "POSSIBLE" : "NON_MATCH";
  return { score, decision, contributions };
}

/** Blocks candidates on trigram similarity of the model number (raw text when unparsed), then scores the survivors, best first. */
export function resolvePumpModel<Id extends string>(query: CanonicalPumpModel, candidates: readonly ResolverRecord<Id>[], config: MatchConfig = DEFAULT_MATCH_CONFIG): Candidate<Id>[] {
  const key = (m: CanonicalPumpModel) => m.model ?? m.raw;
  return candidates
    .map((c) => ({ c, blockingSimilarity: trigramSimilarity(key(query), key(c.model)) }))
    .filter(({ blockingSimilarity }) => blockingSimilarity >= config.blockingThreshold)
    .map(({ c, blockingSimilarity }) => ({ id: c.id, blockingSimilarity, ...matchPumpModels(query, c.model, config) }))
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
