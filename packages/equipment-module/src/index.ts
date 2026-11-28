// EquipmentModule seam: deterministic compliance evaluation per equipment category.
// Missing evidence -> UNKNOWN (never PASS). No extrapolation beyond validated data.
export * from "./types.js";
export { convert } from "./units.js";
export { evaluateGeneric, overallStatus } from "./evaluate.js";
export * from "./pump/index.js";
