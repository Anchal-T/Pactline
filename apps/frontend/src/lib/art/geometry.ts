export type Stroke = "ink" | "fine" | "leaf" | "leaf-fine" | "mark";

export type Item =
  | { t: "line"; d: string; s: Stroke; o: number }
  | { t: "plate"; d: string };

export interface Wash {
  d: string;
  fill: string;
  o: number;
}

export class Layer {
  items: Item[] = [];
  washes: Wash[] = [];

  line(path: Path | string, s: Stroke, o: number) {
    const d = String(path);
    if (d) this.items.push({ t: "line", d, s, o });
  }

  plate(path: Path | string) {
    const d = String(path);
    if (d) this.items.push({ t: "plate", d });
  }

  wash(d: string, fill: string, o: number) {
    this.washes.push({ d, fill, o });
  }
}

export type Rng = () => number;

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rand = (r: Rng, a: number, b: number) => a + (b - a) * r();
export const chance = (r: Rng, p: number) => r() < p;
export function pick<T>(r: Rng, list: readonly T[]): T {
  return list[Math.floor(r() * list.length) % list.length] as T;
}

const fmt = (v: number) => String(Math.round(v * 10) / 10);

export class Path {
  private parts: string[] = [];

  M(x: number, y: number) {
    this.parts.push(`M${fmt(x)} ${fmt(y)}`);
    return this;
  }
  L(x: number, y: number) {
    this.parts.push(`L${fmt(x)} ${fmt(y)}`);
    return this;
  }
  H(x: number) {
    this.parts.push(`H${fmt(x)}`);
    return this;
  }
  V(y: number) {
    this.parts.push(`V${fmt(y)}`);
    return this;
  }
  Q(cx: number, cy: number, x: number, y: number) {
    this.parts.push(`Q${fmt(cx)} ${fmt(cy)} ${fmt(x)} ${fmt(y)}`);
    return this;
  }
  Z() {
    this.parts.push("Z");
    return this;
  }
  seg(x1: number, y1: number, x2: number, y2: number) {
    return this.M(x1, y1).L(x2, y2);
  }
  rect(x: number, y: number, w: number, h: number) {
    return this.M(x, y).H(x + w).V(y + h).H(x).Z();
  }
  poly(pts: ReadonlyArray<readonly [number, number]>, close = false) {
    pts.forEach(([x, y], i) => (i === 0 ? this.M(x, y) : this.L(x, y)));
    return close ? this.Z() : this;
  }
  /** A slightly bowed line, the way a pen drifts over a long stroke. */
  wob(r: Rng, x1: number, y1: number, x2: number, y2: number, amt = 0.8) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const k = rand(r, -amt, amt);
    return this.M(x1, y1).Q((x1 + x2) / 2 - (dy / len) * k, (y1 + y2) / 2 + (dx / len) * k, x2, y2);
  }
  toString() {
    return this.parts.join("");
  }
}

/** Liang-Barsky clip of a segment to an axis-aligned box. */
function clip(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  [minX, minY, maxX, maxY]: readonly [number, number, number, number],
): [number, number, number, number] | null {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;
  const edges: Array<[number, number]> = [
    [-dx, x1 - minX],
    [dx, maxX - x1],
    [-dy, y1 - minY],
    [dy, maxY - y1],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return null;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return null;
      if (t < t1) t1 = t;
    }
  }
  return [x1 + t0 * dx, y1 + t0 * dy, x1 + t1 * dx, y1 + t1 * dy];
}

/* ------------------------------------------------------------------ */
/* Buildings                                                           */
/* ------------------------------------------------------------------ */

export type Facade = "mullion" | "punched" | "bands" | "diagrid" | "grid" | "none";
export type Crown = "flat" | "setback" | "stepped" | "slant" | "spire" | "mast";

export interface TowerSpec {
  x: number;
  w: number;
  h: number;
  facade: Facade;
  crown: Crown;
  hatch?: boolean;
  door?: boolean;
}

export function tower(r: Rng, g: number, t: TowerSpec, layer: Layer, o: number, detail = 1) {
  const { x, w, h } = t;
  const top = g - h;
  let pts: Array<[number, number]>;
  let bodyTop = top;

  switch (t.crown) {
    case "setback": {
      const s = h * 0.15;
      const i = w * 0.15;
      pts = [[x, g], [x, top + s], [x + i, top + s], [x + i, top], [x + w - i, top], [x + w - i, top + s], [x + w, top + s], [x + w, g]];
      bodyTop = top + s;
      break;
    }
    case "stepped": {
      const s1 = h * 0.1;
      const s2 = h * 0.2;
      const i1 = w * 0.12;
      const i2 = w * 0.26;
      pts = [[x, g], [x, top + s2], [x + i1, top + s2], [x + i1, top + s1], [x + i2, top + s1], [x + i2, top], [x + w - i2, top], [x + w - i2, top + s1], [x + w - i1, top + s1], [x + w - i1, top + s2], [x + w, top + s2], [x + w, g]];
      bodyTop = top + s2;
      break;
    }
    case "slant": {
      const s = h * 0.1;
      const leftHigh = chance(r, 0.5);
      pts = [[x, g], [x, leftHigh ? top : top + s], [x + w, leftHigh ? top + s : top], [x + w, g]];
      bodyTop = top + s;
      break;
    }
    default:
      pts = [[x, g], [x, top], [x + w, top], [x + w, g]];
  }

  layer.plate(new Path().poly(pts, true));
  const outline = new Path();
  pts.forEach(([px, py], i) => {
    const prev = pts[i - 1];
    if (!prev) return;
    if (Math.abs(px - prev[0]) < 0.01 && Math.abs(py - prev[1]) > 60) outline.wob(r, prev[0], prev[1], px, py, 0.7);
    else outline.seg(prev[0], prev[1], px, py);
  });
  layer.line(outline, detail > 0.5 ? "ink" : "fine", o);

  const crown = new Path();
  if (t.crown === "flat" || t.crown === "spire" || t.crown === "mast") {
    crown.seg(x + 2, top + 4, x + w - 2, top + 4);
    if (t.crown === "flat" && w > 50) {
      const bw = w * 0.34;
      const bx = x + w * rand(r, 0.18, 0.5);
      layer.plate(new Path().rect(bx, top - 8, bw, 8));
      crown.rect(bx, top - 8, bw, 8);
    }
  }
  if (t.crown === "spire") {
    const sx = x + w / 2;
    layer.plate(new Path().rect(sx - w * 0.1, top - 7, w * 0.2, 7));
    crown.rect(sx - w * 0.1, top - 7, w * 0.2, 7).seg(sx, top - 7, sx, top - 7 - h * 0.14);
  }
  if (t.crown === "mast") {
    crown.seg(x + w * 0.3, top, x + w * 0.3, top - h * 0.12).seg(x + w * 0.62, top, x + w * 0.62, top - h * 0.07);
  }
  layer.line(crown, "ink", o);

  if (detail <= 0) return;

  const doorH = t.door ? 15 : 0;
  const box: [number, number, number, number] = [x + 4, bodyTop + 7, x + w - 4, g - doorH - 5];
  const [bx0, by0, bx1, by1] = box;
  const fac = new Path();
  const sparse = detail < 0.6;

  if (t.facade === "mullion" || t.facade === "grid") {
    const step = sparse ? 12 : rand(r, 6.5, 8.5);
    for (let mx = bx0; mx <= bx1; mx += step) fac.seg(mx, by0, mx, by1);
    const floor = t.facade === "grid" ? 10 : 30;
    for (let fy = by0; fy <= by1; fy += floor) fac.seg(bx0, fy, bx1, fy);
  } else if (t.facade === "bands") {
    let fy = by0;
    let k = 0;
    while (fy <= by1) {
      fac.seg(bx0, fy, bx1, fy);
      fy += k++ % 2 === 0 ? 5 : 9;
    }
  } else if (t.facade === "punched") {
    const cols = Math.max(2, Math.floor((bx1 - bx0) / 9));
    const cw = (bx1 - bx0) / cols;
    let count = 0;
    for (let fy = by0; fy + 6 <= by1 && count < 320; fy += 11) {
      for (let c = 0; c < cols; c++) {
        if (chance(r, 0.12)) continue;
        fac.rect(bx0 + c * cw + cw * 0.25, fy, cw * 0.5, 6);
        count++;
      }
    }
  } else if (t.facade === "diagrid") {
    const step = 16;
    const span = by1 - by0;
    for (let k = -span; k <= bx1 - bx0; k += step) {
      const a = clip(bx0 + k, by1, bx0 + k + span, by0, box);
      const b = clip(bx0 + k, by0, bx0 + k + span, by1, box);
      if (a) fac.seg(...a);
      if (b) fac.seg(...b);
    }
  }
  layer.line(fac, "fine", o);

  if (t.hatch && !sparse) {
    const sw = Math.min(w * 0.26, 26);
    const hb: [number, number, number, number] = [x + w - sw, bodyTop + 2, x + w - 1, g - 1];
    const hatch = new Path();
    for (let y0 = hb[1]; y0 <= hb[3] + sw; y0 += 4.5) {
      const c = clip(hb[0], y0, hb[2], y0 - sw, hb);
      if (c) hatch.seg(...c);
    }
    layer.line(hatch, "fine", o);
  }

  if (t.door) {
    const dw = w * 0.26;
    const dx = x + (w - dw) / 2;
    layer.line(
      new Path().rect(dx, g - doorH + 2, dw, doorH - 2).seg(dx - 6, g - doorH, dx + dw + 6, g - doorH).seg(dx + dw / 2, g - doorH + 2, dx + dw / 2, g),
      "ink",
      o,
    );
  }
}

/** Distant skyline: silhouettes and the odd mullion, no ink weight. */
export function farSkyline(r: Rng, g: number, from: number, to: number, minH: number, maxH: number, layer: Layer, o: number) {
  const plates = new Path();
  const lines = new Path();
  let x = from;
  while (x < to) {
    const w = rand(r, 36, 88);
    const h = rand(r, minH, maxH) * (0.75 + 0.5 * ((x - from) / (to - from || 1)));
    const top = g - h;
    const notch = chance(r, 0.35) ? h * rand(r, 0.08, 0.16) : 0;
    const inset = w * 0.18;
    const pts: Array<[number, number]> = notch
      ? [[x, g], [x, top + notch], [x + inset, top + notch], [x + inset, top], [x + w - inset, top], [x + w - inset, top + notch], [x + w, top + notch], [x + w, g]]
      : [[x, g], [x, top], [x + w, top], [x + w, g]];
    plates.poly(pts, true);
    lines.poly(pts);
    if (chance(r, 0.6)) {
      for (let mx = x + 8; mx < x + w - 6; mx += rand(r, 10, 15)) lines.seg(mx, top + notch + 10, mx, g - 6);
    }
    if (chance(r, 0.2)) lines.seg(x + w / 2, top, x + w / 2, top - h * 0.1);
    x += w + rand(r, -14, 16);
  }
  layer.plate(plates);
  layer.line(lines, "fine", o);
}

/* ------------------------------------------------------------------ */
/* Construction                                                        */
/* ------------------------------------------------------------------ */

export interface FrameSpec {
  x: number;
  w: number;
  floors: number;
  floorH: number;
  clad: number;
  hoist?: "left" | "right";
}

export function frame(r: Rng, g: number, f: FrameSpec, layer: Layer, o: number) {
  const top = g - f.floors * f.floorH;
  const bays = Math.max(2, Math.round(f.w / 24));
  const bw = f.w / bays;
  const cladTop = g - Math.round(f.floors * f.clad) * f.floorH;

  layer.plate(new Path().rect(f.x, cladTop, f.w, g - cladTop));

  const cols = new Path();
  for (let c = 0; c <= bays; c++) {
    const cx = f.x + c * bw;
    cols.seg(cx, g, cx, top - (c % 2 ? 9 : 5));
  }
  layer.line(cols, "ink", o);

  const slabs = new Path();
  const under = new Path();
  for (let k = 1; k <= f.floors; k++) {
    const y = g - k * f.floorH;
    slabs.seg(f.x - 3, y, f.x + f.w + 3, y);
    under.seg(f.x - 1, y + 2, f.x + f.w + 1, y + 2);
  }
  layer.line(slabs, "ink", o);
  layer.line(under, "fine", o);

  const glazing = new Path();
  for (let y = cladTop + 4; y < g - 4; y += f.floorH) {
    for (let c = 0; c < bays; c++) {
      const x0 = f.x + c * bw;
      for (let mx = x0 + bw / 4; mx < x0 + bw - 1; mx += bw / 4) glazing.seg(mx, y, mx, Math.min(y + f.floorH - 6, g - 2));
    }
  }
  layer.line(glazing, "fine", o);

  const bracing = new Path();
  for (let k = Math.round(f.floors * f.clad); k < f.floors; k++) {
    const y0 = g - k * f.floorH;
    const y1 = y0 - f.floorH;
    for (let c = 0; c < bays; c++) {
      if (!chance(r, 0.3)) continue;
      const x0 = f.x + c * bw;
      bracing.seg(x0, y0, x0 + bw, y1 + 2).seg(x0 + bw, y0, x0, y1 + 2);
    }
  }
  const props = new Path();
  const yTop = top;
  for (let px = f.x + 3; px < f.x + f.w - 2; px += 5) props.seg(px, yTop + 2, px, yTop + f.floorH - 1);
  layer.line(bracing, "fine", o);
  layer.line(props, "fine", o);

  if (f.hoist) {
    const hx = f.hoist === "left" ? f.x - 10 : f.x + f.w + 4;
    const hoist = new Path().seg(hx, g, hx, top + f.floorH).seg(hx + 5, g, hx + 5, top + f.floorH);
    for (let y = g - f.floorH * 2; y > top + f.floorH; y -= f.floorH * 3) {
      hoist.seg(f.hoist === "left" ? hx + 5 : hx, y, f.hoist === "left" ? f.x : f.x + f.w, y);
    }
    const cy = g - (g - top) * rand(r, 0.35, 0.55);
    hoist.rect(hx - 3, cy, 11, 14);
    layer.line(hoist, "ink", o);
  }
}

export interface CraneSpec {
  x: number;
  base: number;
  mastH: number;
  jib: number;
  counter: number;
  dir: 1 | -1;
  trolley: number;
  drop: number;
  load: "crate" | "beam";
}

/** Tower crane: lattice mast, slewing unit, A-frame head, trussed jib and counter-jib. */
export function crane(r: Rng, c: CraneSpec, layer: Layer, hook: Layer, o: number) {
  const mw = 9;
  const top = c.base - c.mastH;
  const cx = c.x + mw / 2;
  const d = c.dir;

  const mast = new Path().seg(c.x, c.base, c.x, top).seg(c.x + mw, c.base, c.x + mw, top);
  mast.rect(c.x - 7, c.base - 4, mw + 14, 4);
  layer.line(mast, "ink", o);

  const lattice = new Path().M(c.x, c.base);
  let left = true;
  for (let y = c.base - mw; y >= top + 2; y -= mw) {
    lattice.L(left ? c.x + mw : c.x, y);
    left = !left;
  }
  for (let y = c.base - mw * 2; y > top; y -= mw * 2) lattice.seg(c.x, y, c.x + mw, y);
  layer.line(lattice, "fine", o);

  const jy = top - 3;
  const apexY = jy - 46;
  const tip = cx + d * c.jib;
  const cEnd = cx - d * c.counter;
  const head = new Path()
    .seg(c.x - 5, top, c.x + mw + 5, top)
    .seg(c.x - 3, top - 3, c.x + mw + 3, top - 3)
    .seg(c.x, jy - 9, cx, apexY)
    .seg(c.x + mw, jy - 9, cx, apexY)
    .seg(c.x + 2, jy - 26, c.x + mw - 2, jy - 26);
  const cabX = d === 1 ? c.x + mw : c.x - 11;
  head.rect(cabX, top + 1, 11, 10).seg(cabX + 2, top + 4, cabX + 9, top + 4);
  layer.line(head, "ink", o);

  const jib = new Path().seg(cx - (d * mw) / 2, jy, tip, jy).seg(cx, jy - 9, tip, jy - 4).seg(tip, jy, tip, jy - 4);
  const counter = new Path().seg(cx + (d * mw) / 2, jy, cEnd, jy).seg(cx, jy - 7, cEnd, jy - 6).seg(cEnd, jy, cEnd, jy - 6);
  layer.line(jib, "ink", o);
  layer.line(counter, "ink", o);

  const web = new Path().M(cx, jy);
  const steps = Math.floor(c.jib / 9);
  for (let i = 1; i <= steps; i++) {
    const px = cx + d * i * 9;
    const topY = jy - 9 + 5 * ((i * 9) / c.jib);
    web.L(px, i % 2 ? topY : jy);
  }
  const cweb = new Path().M(cx, jy);
  const csteps = Math.floor(c.counter / 12);
  for (let i = 1; i <= csteps; i++) cweb.L(cx - d * i * 12, i % 2 ? jy - 6.5 : jy);
  layer.line(web, "fine", o);
  layer.line(cweb, "fine", o);

  const weights = new Path();
  for (let k = 0; k < 3; k++) {
    const wx = d === 1 ? cEnd + 2 : cEnd - 16;
    weights.rect(wx, jy + 1 + k * 5, 14, 5);
  }
  const pendants = new Path()
    .seg(cx, apexY, cx + d * c.jib * 0.62, jy - 9 + 5 * 0.62)
    .seg(cx, apexY, cx + d * c.jib * 0.3, jy - 9 + 5 * 0.3)
    .seg(cx, apexY, cEnd + d * 3, jy - 6.5);
  layer.line(weights, "ink", o);
  layer.line(pendants, "fine", o);

  const tx = cx + d * c.jib * c.trolley;
  layer.line(new Path().rect(tx - 4, jy, 8, 4), "ink", o);

  const hy = jy + 4 + c.drop;
  hook.line(new Path().seg(tx - 1, jy + 4, tx - 1, hy).seg(tx + 1, jy + 4, tx + 1, hy), "fine", o);
  hook.line(new Path().rect(tx - 3.5, hy, 7, 8).M(tx, hy + 8).V(hy + 12).Q(tx, hy + 15, tx - 3, hy + 14), "ink", o);
  const ly = hy + 30;
  if (c.load === "crate") {
    hook.line(new Path().seg(tx, hy + 14, tx - 13, ly).seg(tx, hy + 14, tx + 13, ly), "fine", o);
    hook.plate(new Path().rect(tx - 15, ly, 30, 21));
    hook.line(new Path().rect(tx - 15, ly, 30, 21).seg(tx - 15, ly, tx + 15, ly + 21).seg(tx + 15, ly, tx - 15, ly + 21).seg(tx - 15, ly + 4, tx + 15, ly + 4), "mark", o + 3);
  } else {
    hook.line(new Path().seg(tx, hy + 14, tx - 20, ly).seg(tx, hy + 14, tx + 20, ly), "fine", o);
    hook.plate(new Path().rect(tx - 28, ly, 56, 6));
    hook.line(new Path().rect(tx - 28, ly, 56, 6).seg(tx - 28, ly + 3, tx + 28, ly + 3), "ink", o);
  }
}

/* ------------------------------------------------------------------ */
/* Greenery                                                            */
/* ------------------------------------------------------------------ */

/** A scalloped clump of foliage: points on a jittered ring joined by outward bulges. */
export function clump(r: Rng, cx: number, cy: number, rad: number, bumps: number) {
  const pts: Array<[number, number, number]> = [];
  const off = rand(r, 0, Math.PI * 2);
  for (let i = 0; i < bumps; i++) {
    const a = off + (i / bumps) * Math.PI * 2 + rand(r, -0.18, 0.18);
    const k = rand(r, 0.84, 1.04);
    pts.push([cx + Math.cos(a) * rad * k, cy + Math.sin(a) * rad * k * 0.86, a]);
  }
  const p = new Path();
  pts.forEach(([x, y], i) => {
    if (i === 0) p.M(x, y);
    const next = pts[(i + 1) % pts.length]!;
    let a2 = next[2];
    if (a2 < pts[i]![2]) a2 += Math.PI * 2;
    const am = (pts[i]![2] + a2) / 2;
    const bulge = rad * rand(r, 1.22, 1.38);
    p.Q(cx + Math.cos(am) * bulge, cy + Math.sin(am) * bulge * 0.86, next[0], next[1]);
  });
  return p.Z();
}

function leafTicks(r: Rng, cx: number, cy: number, rad: number, n: number) {
  const p = new Path();
  for (let i = 0; i < n; i++) {
    const a = rand(r, 0, Math.PI * 2);
    const dist = rand(r, 0, rad * 0.6);
    const x = cx + Math.cos(a) * dist;
    const y = cy + Math.sin(a) * dist;
    const s = rand(r, 2, 3.6);
    p.M(x - s, y).Q(x, y - s * 0.9, x + s, y);
  }
  return p;
}

export type TreeKind = "round" | "poplar" | "conifer";

export interface TreeShape {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export function tree(r: Rng, g: number, x: number, size: number, kind: TreeKind, layer: Layer, o: number): TreeShape {
  if (kind === "conifer") {
    const apex = g - size * 1.55;
    const tiers = 6;
    const tierH = (size * 1.3) / tiers;
    const baseHalf = size * 0.44;
    const trunk = new Path().seg(x - 1.5, g, x - 1, g - size * 0.3).seg(x + 1.5, g, x + 1, g - size * 0.3);
    layer.line(trunk, "ink", o);
    layer.plate(new Path().poly([[x, apex], [x - baseHalf, g - size * 0.22], [x + baseHalf, g - size * 0.22]], true));
    for (let k = 0; k < tiers; k++) {
      const y = apex + (k + 1) * tierH;
      const half = size * 0.1 + (k / (tiers - 1)) * (baseHalf - size * 0.1);
      const tier = new Path().M(x, y - tierH * 1.45).Q(x - half * 0.45, y - tierH * 0.55, x - half, y);
      let tx = x - half;
      let up = true;
      while (tx < x + half) {
        tx += 3;
        tier.L(Math.min(tx, x + half), y + (up ? -2 : 0.5));
        up = !up;
      }
      tier.M(x, y - tierH * 1.45).Q(x + half * 0.45, y - tierH * 0.55, x + half, y);
      layer.plate(new Path().poly([[x, y - tierH * 1.45], [x - half, y], [x + half, y]], true));
      layer.line(tier, "leaf", o);
    }
    return { cx: x, cy: g - size * 0.85, rx: baseHalf, ry: size * 0.7 };
  }

  const poplar = kind === "poplar";
  const cy = g - size * (poplar ? 1.12 : 1.02);
  const rx = size * (poplar ? 0.24 : 0.62);
  const ry = size * (poplar ? 0.74 : 0.46);
  const trunkTop = cy + ry * 0.3;

  const trunk = new Path()
    .M(x - 2.4, g)
    .Q(x - 1.8, (g + trunkTop) / 2, x - 0.9, trunkTop)
    .M(x + 2.4, g)
    .Q(x + 1.6, (g + trunkTop) / 2, x + 0.9, trunkTop)
    .M(x - 2.6, g)
    .Q(x - 4.5, g + 0.4, x - 6.5, g + 0.6)
    .M(x + 2.6, g)
    .Q(x + 4.4, g + 0.3, x + 6, g + 0.6);
  if (!poplar) {
    trunk
      .M(x - 0.8, trunkTop + 4)
      .Q(x - rx * 0.25, trunkTop - ry * 0.25, x - rx * 0.45, trunkTop - ry * 0.55)
      .M(x + 0.8, trunkTop + 2)
      .Q(x + rx * 0.22, trunkTop - ry * 0.3, x + rx * 0.4, trunkTop - ry * 0.62)
      .M(x, trunkTop)
      .Q(x + 1, trunkTop - ry * 0.4, x - rx * 0.05, trunkTop - ry * 0.8);
  }
  layer.line(trunk, "ink", o);

  const count = poplar ? Math.round(rand(r, 11, 14)) : Math.round(rand(r, 8, 12));
  const blobs: Array<[number, number, number]> = [];
  for (let i = 0; i < count; i++) {
    const a = rand(r, 0, Math.PI * 2);
    const dist = Math.sqrt(r()) * 0.72;
    const rad = size * (poplar ? rand(r, 0.11, 0.16) : rand(r, 0.17, 0.27));
    blobs.push([x + Math.cos(a) * rx * dist, cy + Math.sin(a) * ry * dist, rad]);
  }
  blobs.sort((a, b) => a[1] - b[1]);
  for (const [bx, by, rad] of blobs) {
    const shape = clump(r, bx, by, rad, Math.round(rand(r, 6, 9)));
    layer.plate(shape);
    layer.line(shape, "leaf", o);
    layer.line(leafTicks(r, bx, by, rad, Math.round(rand(r, 2, 4))), "leaf-fine", o);
  }
  return { cx: x, cy, rx: rx * 1.15, ry: ry * 1.15 };
}

export function bush(r: Rng, g: number, x: number, size: number, layer: Layer, o: number) {
  const n = Math.round(rand(r, 2, 4));
  for (let i = 0; i < n; i++) {
    const rad = size * rand(r, 0.6, 1);
    const shape = clump(r, x + (i - n / 2) * size * 0.9 + rand(r, -2, 2), g - rad * 0.62, rad, Math.round(rand(r, 5, 7)));
    layer.plate(shape);
    layer.line(shape, "leaf", o);
  }
}

export function grass(r: Rng, g: number, from: number, to: number, density: number, layer: Layer, o: number) {
  let p = new Path();
  let start = from;
  let x = from;
  while (x < to) {
    const blades = Math.round(rand(r, 2, 4));
    for (let b = 0; b < blades; b++) {
      const h = rand(r, 3, 9);
      const lean = rand(r, -4, 4);
      const x0 = x + rand(r, -1.5, 1.5);
      p.M(x0, g).Q(x0 + lean * 0.3, g - h * 0.6, x0 + lean, g - h);
    }
    x += rand(r, 3, 12) / density;
    if (x - start > 180) {
      layer.line(p, chance(r, 0.5) ? "leaf" : "leaf-fine", o);
      p = new Path();
      start = x;
    }
  }
  layer.line(p, "leaf-fine", o);
}

export function ground(r: Rng, g: number, w: number, layer: Layer, o: number) {
  const main = new Path();
  let x = 0;
  while (x < w) {
    const len = rand(r, 80, 260);
    main.wob(r, x, g, Math.min(x + len, w), g + rand(r, -0.4, 0.4), 0.5);
    x += len + rand(r, 2, 6);
  }
  layer.line(main, "ink", o);
  const kerb = new Path();
  for (let k = rand(r, 0, 20); k < w; k += rand(r, 26, 46)) kerb.seg(k, g + 7, k + rand(r, 10, 22), g + 7);
  for (let k = rand(r, 0, 40); k < w; k += rand(r, 60, 120)) kerb.seg(k, g + 14, k + rand(r, 6, 14), g + 14);
  layer.line(kerb, "fine", o);
}

export function lamp(g: number, x: number, dir: 1 | -1, layer: Layer, o: number) {
  layer.line(
    new Path().M(x, g).V(g - 34).Q(x, g - 39, x + dir * 6, g - 39).seg(x + dir * 4, g - 39, x + dir * 9, g - 39).seg(x - 2, g, x + 2, g),
    "fine",
    o,
  );
}

export function birds(r: Rng, pts: ReadonlyArray<readonly [number, number]>, layer: Layer, o: number) {
  const p = new Path();
  for (const [x, y] of pts) {
    const s = rand(r, 3, 5);
    p.M(x - s, y - s * 0.4).Q(x - s * 0.4, y - s * 0.5, x, y).Q(x + s * 0.4, y - s * 0.5, x + s, y - s * 0.4);
  }
  layer.line(p, "fine", o);
}

/* ------------------------------------------------------------------ */
/* Watercolor shapes                                                   */
/* ------------------------------------------------------------------ */

export function softBlob(r: Rng, cx: number, cy: number, rx: number, ry: number, n = 9) {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand(r, -0.2, 0.2);
    const k = rand(r, 0.8, 1.08);
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  const mid = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const last = pts[pts.length - 1]!;
  const first = pts[0]!;
  const p = new Path();
  const s = mid(last, first);
  p.M(s[0], s[1]);
  pts.forEach((pt, i) => {
    const m = mid(pt, pts[(i + 1) % pts.length]!);
    p.Q(pt[0], pt[1], m[0], m[1]);
  });
  return p.Z().toString();
}

export function washRect(r: Rng, x: number, y: number, w: number, h: number) {
  const j = () => rand(r, -3, 3);
  return new Path()
    .poly([[x + j(), y + j()], [x + w + j(), y + j()], [x + w + j(), y + h + j()], [x + j(), y + h + j()]], true)
    .toString();
}
