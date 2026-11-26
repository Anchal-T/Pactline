import {
  Layer,
  birds,
  bush,
  crane,
  createRng,
  farSkyline,
  frame,
  grass,
  ground,
  lamp,
  pick,
  rand,
  softBlob,
  tower,
  tree,
  washRect,
  type CraneSpec,
  type FrameSpec,
  type TowerSpec,
  type TreeKind,
  type TreeShape,
} from "./geometry";

export interface Scene {
  w: number;
  h: number;
  back: Layer;
  mid: Layer;
  hook: Layer;
  front: Layer;
}

export type SceneName = "hero" | "panel" | "strip";

/** Draw order groups, so the pen moves ground, far city, buildings, site, cranes, trees, grass, mark. */
const O = { ground: 0, far: 1, building: 2, site: 3, crane: 4, tree: 5, grass: 6 } as const;

const FOLIAGE = ["var(--moss)", "var(--olive)", "var(--brand)", "var(--sage)"] as const;

function foliageWashes(r: () => number, shapes: TreeShape[], layer: Layer) {
  for (const s of shapes) {
    layer.wash(softBlob(r, s.cx + rand(r, -4, 4), s.cy + rand(r, -3, 5), s.rx, s.ry * 0.95, 8), pick(r, FOLIAGE), rand(r, 0.3, 0.46));
  }
}

function plant(
  r: () => number,
  g: number,
  trees: Array<[number, number, TreeKind]>,
  layer: Layer,
): TreeShape[] {
  return trees.map(([x, size, kind]) => tree(r, g, x, size, kind, layer, O.tree));
}

function hero(): Scene {
  const r = createRng(7341);
  const w = 1600;
  const h = 700;
  const g = 652;
  const back = new Layer();
  const mid = new Layer();
  const hook = new Layer();
  const front = new Layer();

  back.wash(softBlob(r, 1210, 390, 470, 220), "var(--sage)", 0.5);
  back.wash(softBlob(r, 1460, 250, 240, 170), "var(--sage)", 0.34);
  back.wash(softBlob(r, 760, 520, 400, 110), "var(--olive)", 0.24);
  back.wash(softBlob(r, 860, 615, 900, 55, 12), "var(--moss)", 0.16);

  farSkyline(r, g, -20, 420, 70, 150, back, O.far);
  farSkyline(r, g, 420, 1620, 150, 330, back, O.far);
  birds(r, [[880, 168], [906, 152], [926, 174], [956, 160]], back, O.grass);

  const towers: TowerSpec[] = [
    { x: 24, w: 76, h: 120, facade: "punched", crown: "flat", door: true },
    { x: 112, w: 92, h: 170, facade: "bands", crown: "slant" },
    { x: 216, w: 66, h: 134, facade: "punched", crown: "mast" },
    { x: 296, w: 114, h: 218, facade: "mullion", crown: "setback", hatch: true, door: true },
    { x: 424, w: 84, h: 160, facade: "bands", crown: "flat" },
    { x: 522, w: 120, h: 266, facade: "diagrid", crown: "stepped", hatch: true },
    { x: 656, w: 90, h: 304, facade: "grid", crown: "spire" },
    { x: 760, w: 130, h: 338, facade: "mullion", crown: "setback", hatch: true, door: true },
    { x: 904, w: 106, h: 410, facade: "bands", crown: "slant", hatch: true },
    { x: 1262, w: 118, h: 446, facade: "mullion", crown: "setback", hatch: true, door: true },
    { x: 1398, w: 84, h: 238, facade: "punched", crown: "flat" },
  ];
  for (const t of towers) tower(r, g, t, mid, O.building);

  const tints: Array<[number, string, number]> = [
    [3, "var(--sage)", 0.4],
    [5, "var(--olive)", 0.3],
    [7, "var(--sage)", 0.34],
    [8, "var(--pine)", 0.14],
    [9, "var(--pine)", 0.12],
    [10, "var(--olive)", 0.26],
  ];
  for (const [i, fill, o] of tints) {
    const t = towers[i]!;
    mid.wash(washRect(r, t.x + 3, g - t.h * 0.94, t.w - 5, t.h * 0.92), fill, o);
  }

  const site: FrameSpec = { x: 1030, w: 196, floors: 17, floorH: 18, clad: 0.5, hoist: "left" };
  frame(r, g, site, mid, O.site);
  frame(r, g, { x: 1492, w: 58, floors: 9, floorH: 18, clad: 0.35 }, mid, O.site);
  mid.wash(washRect(r, site.x + 2, g - site.floors * site.floorH * site.clad, site.w - 4, site.floors * site.floorH * site.clad - 2), "var(--moss)", 0.2);

  const main: CraneSpec = { x: 1234, base: g, mastH: 524, jib: 420, counter: 104, dir: -1, trolley: 0.9, drop: 96, load: "crate" };
  crane(r, main, mid, hook, O.crane);
  crane(r, { x: 1558, base: g, mastH: 362, jib: 214, counter: 62, dir: -1, trolley: 0.42, drop: 88, load: "beam" }, mid, mid, O.crane);

  ground(r, g, w, front, O.ground);
  const shapes = plant(
    r,
    g,
    [
      [46, 80, "round"],
      [128, 84, "poplar"],
      [198, 98, "round"],
      [268, 72, "conifer"],
      [352, 86, "round"],
      [420, 72, "poplar"],
      [482, 66, "round"],
      [606, 58, "round"],
      [704, 64, "poplar"],
      [850, 62, "round"],
      [986, 54, "conifer"],
      [1146, 56, "round"],
      [1214, 60, "poplar"],
      [1388, 64, "round"],
      [1536, 50, "round"],
    ],
    front,
  );
  for (const bx of [92, 240, 310, 448, 540, 660, 760, 920, 1060, 1180, 1300, 1450, 1580]) bush(r, g, bx + rand(r, -8, 8), rand(r, 7, 11), front, O.grass);
  for (const [lx, dir] of [[566, 1], [790, -1], [1100, 1], [1320, -1]] as const) lamp(g, lx, dir, front, O.grass);
  grass(r, g, 0, w, 1.1, front, O.grass);

  foliageWashes(r, shapes, front);
  front.wash(softBlob(r, 800, g + 8, 880, 22, 12), "var(--sage)", 0.36);

  return { w, h, back, mid, hook, front };
}

function panel(): Scene {
  const r = createRng(2207);
  const w = 800;
  const h = 1000;
  const g = 930;
  const back = new Layer();
  const mid = new Layer();
  const hook = new Layer();
  const front = new Layer();

  back.wash(softBlob(r, 520, 600, 360, 230), "var(--sage)", 0.46);
  back.wash(softBlob(r, 230, 760, 280, 140), "var(--olive)", 0.24);
  back.wash(softBlob(r, 700, 480, 170, 130), "var(--sage)", 0.3);

  farSkyline(r, g, -20, 820, 180, 380, back, O.far);
  birds(r, [[650, 330], [676, 316], [698, 338]], back, O.grass);

  const towers: TowerSpec[] = [
    { x: 20, w: 130, h: 290, facade: "mullion", crown: "setback", hatch: true, door: true },
    { x: 612, w: 150, h: 430, facade: "bands", crown: "slant", hatch: true, door: true },
  ];
  for (const t of towers) tower(r, g, t, mid, O.building);
  mid.wash(washRect(r, 615, g - 400, 146, 390), "var(--pine)", 0.13);
  mid.wash(washRect(r, 23, g - 270, 126, 260), "var(--olive)", 0.28);

  const site: FrameSpec = { x: 214, w: 270, floors: 21, floorH: 20, clad: 0.5, hoist: "left" };
  frame(r, g, site, mid, O.site);
  mid.wash(washRect(r, site.x + 2, g - 21 * 20 * 0.5, site.w - 4, 21 * 20 * 0.5 - 2), "var(--sage)", 0.3);

  crane(r, { x: 500, base: g, mastH: 474, jib: 380, counter: 104, dir: -1, trolley: 0.5, drop: 6, load: "crate" }, mid, hook, O.crane);

  ground(r, g, w, front, O.ground);
  const shapes = plant(
    r,
    g,
    [
      [60, 120, "round"],
      [168, 96, "poplar"],
      [300, 110, "round"],
      [420, 84, "conifer"],
      [530, 120, "round"],
      [690, 104, "round"],
      [772, 90, "poplar"],
    ],
    front,
  );
  for (const bx of [110, 240, 370, 470, 620, 740]) bush(r, g, bx, rand(r, 9, 13), front, O.grass);
  grass(r, g, 0, w, 1.3, front, O.grass);
  foliageWashes(r, shapes, front);
  front.wash(softBlob(r, 400, g + 10, 460, 28, 10), "var(--sage)", 0.36);

  return { w, h, back, mid, hook, front };
}

function strip(): Scene {
  const r = createRng(5113);
  const w = 1600;
  const h = 300;
  const g = 270;
  const back = new Layer();
  const mid = new Layer();
  const hook = new Layer();
  const front = new Layer();

  back.wash(softBlob(r, 1050, 170, 560, 110), "var(--sage)", 0.42);
  back.wash(softBlob(r, 420, 200, 380, 80), "var(--olive)", 0.22);
  farSkyline(r, g, -20, 1620, 60, 150, back, O.far);

  const towers: TowerSpec[] = [
    { x: 300, w: 80, h: 120, facade: "bands", crown: "flat" },
    { x: 392, w: 64, h: 156, facade: "mullion", crown: "spire" },
    { x: 700, w: 96, h: 140, facade: "punched", crown: "slant" },
    { x: 1180, w: 90, h: 170, facade: "grid", crown: "setback", hatch: true },
    { x: 1282, w: 70, h: 110, facade: "bands", crown: "flat" },
  ];
  for (const t of towers) tower(r, g, t, mid, O.building);
  mid.wash(washRect(r, 703, g - 132, 90, 128), "var(--olive)", 0.28);
  mid.wash(washRect(r, 1183, g - 150, 84, 146), "var(--sage)", 0.34);

  frame(r, g, { x: 930, w: 120, floors: 8, floorH: 16, clad: 0.4 }, mid, O.site);
  crane(r, { x: 1066, base: g, mastH: 230, jib: 180, counter: 54, dir: -1, trolley: 0.5, drop: 40, load: "crate" }, mid, hook, O.crane);

  ground(r, g, w, front, O.ground);
  const trees: Array<[number, number, TreeKind]> = [];
  for (let x = 30; x < w; x += rand(r, 70, 130)) {
    if (x > 900 && x < 1080) continue;
    trees.push([x, rand(r, 34, 56), pick(r, ["round", "round", "poplar", "conifer"] as const)]);
  }
  const shapes = plant(r, g, trees, front);
  grass(r, g, 0, w, 1.2, front, O.grass);
  foliageWashes(r, shapes, front);

  return { w, h, back, mid, hook, front };
}

const builders: Record<SceneName, () => Scene> = { hero, panel, strip };
const cache = new Map<SceneName, Scene>();

export function getScene(name: SceneName): Scene {
  let scene = cache.get(name);
  if (!scene) {
    scene = builders[name]();
    cache.set(name, scene);
  }
  return scene;
}
