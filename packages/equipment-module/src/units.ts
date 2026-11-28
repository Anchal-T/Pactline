/** Unit conversion for the quantities the equipment modules compare. Unknown pairs return undefined (→ UNKNOWN). */
const FACTORS: Record<string, { dim: string; toBase: number }> = {
  ft: { dim: "length", toBase: 0.3048 },
  m: { dim: "length", toBase: 1 },
  in: { dim: "length", toBase: 0.0254 },
  mm: { dim: "length", toBase: 0.001 },
  gpm: { dim: "flow", toBase: 0.227124707 }, // US gallons per minute → m³/h
  "m3/h": { dim: "flow", toBase: 1 },
  "m³/h": { dim: "flow", toBase: 1 },
  hp: { dim: "power", toBase: 0.745699872 },
  kW: { dim: "power", toBase: 1 },
  "%": { dim: "ratio", toBase: 1 },
  V: { dim: "voltage", toBase: 1 },
  Hz: { dim: "frequency", toBase: 1 },
  rpm: { dim: "speed", toBase: 1 },
};

export function convert(value: number, from: string, to: string): number | undefined {
  if (from === to) return value;
  const a = FACTORS[from];
  const b = FACTORS[to];
  if (!a || !b || a.dim !== b.dim) return undefined;
  return (value * a.toBase) / b.toBase;
}
