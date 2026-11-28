/**
 * Monotone piecewise cubic Hermite interpolation (Fritsch–Carlson). Preserves the monotonicity of the
 * digitized points, so an interpolated head never overshoots between two read points.
 *
 * No extrapolation: outside [x_min, x_max] the result is undefined and callers must report UNKNOWN.
 */
export interface Pchip {
  readonly lo: number;
  readonly hi: number;
  at(x: number): number | undefined;
}

export function pchip(xs: readonly number[], ys: readonly number[]): Pchip {
  if (xs.length !== ys.length) throw new Error("pchip: xs and ys differ in length");
  if (xs.length < 2) throw new Error("pchip: need at least two points");
  for (let i = 1; i < xs.length; i++) if (!(xs[i]! > xs[i - 1]!)) throw new Error("pchip: xs must be strictly increasing");

  const n = xs.length;
  const h = Array.from({ length: n - 1 }, (_, i) => xs[i + 1]! - xs[i]!);
  const delta = Array.from({ length: n - 1 }, (_, i) => (ys[i + 1]! - ys[i]!) / h[i]!);
  const m = new Array<number>(n).fill(0);

  if (n === 2) {
    m[0] = m[1] = delta[0]!;
  } else {
    for (let i = 1; i < n - 1; i++) {
      const d0 = delta[i - 1]!;
      const d1 = delta[i]!;
      if (d0 === 0 || d1 === 0 || Math.sign(d0) !== Math.sign(d1)) m[i] = 0;
      else {
        const w1 = 2 * h[i]! + h[i - 1]!;
        const w2 = h[i]! + 2 * h[i - 1]!;
        m[i] = (w1 + w2) / (w1 / d0 + w2 / d1);
      }
    }
    m[0] = endSlope(h[0]!, h[1]!, delta[0]!, delta[1]!);
    m[n - 1] = endSlope(h[n - 2]!, h[n - 3]!, delta[n - 2]!, delta[n - 3]!);
  }

  return {
    lo: xs[0]!,
    hi: xs[n - 1]!,
    at(x: number) {
      if (!Number.isFinite(x) || x < xs[0]! || x > xs[n - 1]!) return undefined;
      let i = 0;
      while (i < n - 2 && x > xs[i + 1]!) i++;
      const t = (x - xs[i]!) / h[i]!;
      const t2 = t * t;
      const t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * ys[i]! + (t3 - 2 * t2 + t) * h[i]! * m[i]! + (-2 * t3 + 3 * t2) * ys[i + 1]! + (t3 - t2) * h[i]! * m[i + 1]!;
    },
  };
}

/** Three-point end slope, clamped so the end segment stays monotone. */
function endSlope(h0: number, h1: number, d0: number, d1: number): number {
  let s = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
  if (Math.sign(s) !== Math.sign(d0)) s = 0;
  else if (Math.sign(d0) !== Math.sign(d1) && Math.abs(s) > Math.abs(3 * d0)) s = 3 * d0;
  return s;
}
