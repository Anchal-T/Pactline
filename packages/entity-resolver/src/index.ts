// Deterministic entity resolution and conflict detection — pure TypeScript, zero LLM calls.
export {
  PUMP_MANUFACTURERS,
  PUMP_MODEL_FIELDS,
  canonicalizePumpModel,
  type CanonicalModelKey,
  type CanonicalPumpModel,
  type PumpManufacturer,
  type PumpModelFacts,
  type PumpModelField,
} from "./pump-model.js";
export { jaroWinkler, trigramSimilarity, trigrams } from "./similarity.js";
export {
  DEFAULT_MATCH_CONFIG,
  matchPumpModels,
  resolvePumpModel,
  type AgreementLevel,
  type Candidate,
  type FieldContribution,
  type FieldWeights,
  type MatchConfig,
  type MatchDecision,
  type MatchResult,
  type ResolverRecord,
} from "./matcher.js";
export { detectConflicts, type AssertionWitness, type DisagreementRaised } from "./conflicts.js";
