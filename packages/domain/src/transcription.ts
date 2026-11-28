/*
 * Canonical one-line transcriptions of the authentic reference data (data/specs/pump-reference.json).
 * The seed stores these exact strings as document blocks and specialists cite them as excerpts, so the
 * envelope validator can check every excerpt verbatim. Change a format here and both sides move together.
 */

type Rec = Record<string, unknown>;

export function criterionText(c: Rec): string {
  const p = c.predicate as { field: string; operator: string; value: unknown; unit?: string };
  return `${c.id as string}: ${p.field} ${p.operator} ${String(p.value)}${p.unit ? ` ${p.unit}` : ""}${c.mandatory ? " (mandatory)" : ""}`;
}

export function curvePointText(configId: string, p: Rec): string {
  return `${configId} at ${String(p.flow_gpm)} gpm: head ${String(p.head_ft)} ft, efficiency ${String(p.pump_efficiency_pct)} %, NPSHr ${String(p.npshr_ft)} ft`;
}

export function configText(c: Rec): string {
  return `${c.id as string}: ${c.manufacturer as string} ${c.family as string} ${c.model as string}, ${String(c.pump_type)}, ${String(c.impeller_diameter_in)} in impeller, ${String(c.curve_speed_rpm)} rpm, ${String(c.market_frequency_hz)} Hz, motor ${c.motor ? "listed" : "not listed"}`;
}
