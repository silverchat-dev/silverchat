/**
 * The plan of Hun Min street, made from one seed: a straight street on the city's perfect grid (ch. 4), crossed by
 * side streets, lined on both sides with one- and two-storey shops under concrete roofs, stairways going down under
 * the pavement, and behind the shops more rows of low buildings and trees. It returns plain data: pieces by
 * material, shop fronts, the places a sign can hang, and where the special things stand.
 */
import { rng } from "../../kit/noise";
import type { Piece } from "./parts";
import type { Slot } from "./signs";

/** the front of the shops, the edge of the road, how deep a shop is */
export const FX = 8;
export const ROAD = 3.4;
export const DEPTH = 9;

/** the empty shop where a visitor launches their own token: its centre on the street */
export const EMPTY = { s: 1, z: -6, w: 6 };

type Kind = "shop" | "empty" | "mural" | "sensor" | "foil" | "factory";
type Lot = { s: number; z1: number; z0: number; floors: 1 | 2; colour: string; kind: Kind };

export type Front = { x: number; y: number; z: number; w: number; h: number; s: number; variant: number; tint: string; k: number };
export type Board = { x: number; y: number; z: number; size: number; s: number; variant: number };

const WALLS = ["#f1d7b0", "#e9b3a3", "#b9d3e3", "#f3e1a2", "#d6c3e6", "#e7a98a", "#f4efe6", "#d9c8b4", "#e8c6d0", "#c4d6e8", "#f0c88e"];
const AWNINGS = ["#d8443a", "#2f6fb5", "#e0902a", "#7a4fa8", "#c23d6e", "#3a8f9a"];
const CONCRETE = "#bdb7ab";

const BLOCKS: [number, number][] = [
  [68, 40],
  [30, -50],
  [-60, -150],
  [-160, -250],
];
/** the side streets crossing it */
const CROSS: [number, number][] = [
  [40, 30],
  [-50, -60],
  [-150, -160],
];
/** stairways under the pavement: side and the z where the steps start */
const STAIRS: [number, number][] = [
  [-1, 19],
  [1, 15],
  [-1, -33],
  [1, -78],
];

export function planStreet(seed = 18) {
  const r = rng(seed);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const box: Record<"plaster" | "trim" | "stone" | "metal" | "dark" | "glass" | "cloth" | "paving" | "kerb" | "white" | "foil" | "glow", Piece[]> = {
    plaster: [], trim: [], stone: [], metal: [], dark: [], glass: [], cloth: [], paving: [], kerb: [], white: [], foil: [], glow: [],
  };
  const cyl: Record<"plaster" | "metal" | "foil", Piece[]> = { plaster: [], metal: [], foil: [] };
  const ball: Record<"leaf" | "glow" | "metal", Piece[]> = { leaf: [], glow: [], metal: [] };
  const fronts: Front[] = [];
  const boards: Board[] = [];
  const candidates: { slot: Slot; z: number; s: number; board?: Board }[] = [];
  const trees: [number, number, number][] = [];
  const special: Record<string, { s: number; z1: number; z0: number; H: number }> = {};

  // ---- the lots: walk each block down the street, one shop after another
  const lots: Lot[] = [];
  for (const [top, bottom] of BLOCKS) {
    for (const s of [-1, 1]) {
      let z = top;
      while (z > bottom + 0.5) {
        // the empty shop and its neighbours are placed by hand, so the stop always looks the same
        if (s === EMPTY.s && top === 30 && z > EMPTY.z + EMPTY.w / 2 && z - (EMPTY.z + EMPTY.w / 2) < 11) {
          const gap = z - (EMPTY.z + EMPTY.w / 2);
          if (gap > 7.5) {
            lots.push({ s, z1: z, z0: z - gap / 2, floors: 2, colour: pick(WALLS), kind: "shop" });
            lots.push({ s, z1: z - gap / 2, z0: z - gap, floors: 1, colour: pick(WALLS), kind: "shop" });
          } else lots.push({ s, z1: z, z0: z - gap, floors: 2, colour: pick(WALLS), kind: "shop" });
          z -= gap;
          lots.push({ s, z1: z, z0: z - EMPTY.w, floors: 1, colour: "#e2ddd3", kind: "empty" });
          z -= EMPTY.w;
          lots.push({ s, z1: z, z0: z - 6.5, floors: 2, colour: "#f3e1a2", kind: "mural" });
          z -= 6.5;
          continue;
        }
        // across the street, the sensor shop beside the anti-transmission-foil shop (ch. 2)
        if (s === -1 && top === 30 && z < -12 && !lots.some((l) => l.kind === "sensor")) {
          lots.push({ s, z1: z, z0: z - 5.4, floors: 1, colour: "#c4d6e8", kind: "sensor" });
          lots.push({ s, z1: z - 5.4, z0: z - 10.8, floors: 1, colour: "#d9dde2", kind: "foil" });
          z -= 10.8;
          continue;
        }
        let w = 5 + r() * 2.5;
        if (z - w < bottom + 4) w = z - bottom;
        const factory = s === -1 && top === 30 && z < 12 && !lots.some((l) => l.kind === "factory");
        lots.push({ s, z1: z, z0: z - w, floors: factory || r() < 0.55 ? 2 : 1, colour: pick(WALLS), kind: factory ? "factory" : "shop" });
        z -= w;
      }
    }
  }

  // ---- each lot: a recessed shop front under a concrete roof, windows above, things on the roof
  for (const lot of lots) {
    const { s, z1, z0, floors, colour, kind } = lot;
    const w = z1 - z0;
    const zc = (z1 + z0) / 2;
    const H = floors === 2 ? 7.6 : 4.3;
    const X = (d: number) => s * (FX + d);
    const far = z0 < -150;
    special[kind] ??= { s, z1, z0, H };
    box.plaster.push({ p: [X(1.2 + (DEPTH - 1.2) / 2), 1.75, zc], s: [DEPTH - 1.2, 3.5, w - 0.02], c: colour });
    box.plaster.push({ p: [X(DEPTH / 2), (3.5 + H) / 2, zc], s: [DEPTH, H - 3.5, w - 0.02], c: colour });
    // the piers between the shops are clad in polished stone (Dzego's polished stone, ch. 2)
    for (const zz of [z1 - 0.2, z0 + 0.2]) box.stone.push({ p: [X(0.58), 1.75, zz], s: [1.24, 3.5, 0.42], c: "#ffffff" });
    box.paving.push({ p: [X(0.6), 0.08, zc], s: [1.2, 0.16, w - 0.8], c: "#cfc6b8" });
    // the roof: a concrete slab with a little overhang and a parapet
    box.plaster.push({ p: [X(DEPTH / 2), H + 0.11, zc], s: [DEPTH, 0.22, w - 0.03], c: CONCRETE });
    box.plaster.push({ p: [X(0.1), H + 0.42, zc], s: [0.2, 0.42, w - 0.03], c: CONCRETE });
    // thin trim casts no shadow: its shadow would be only a few texels of the shadow map, and look jagged
    box.trim.push({ p: [X(-0.08), 3.55, zc], s: [0.2, 0.12, w - 0.03], c: CONCRETE });
    if (r() < 0.75) cyl.plaster.push({ p: [X(DEPTH * (0.45 + r() * 0.35)), H + 0.95, zc + (r() - 0.5) * (w - 2)], s: [1.15, 1.45, 1.15], c: pick(["#d9d2c4", "#a9b6c2", "#c9b9a0"]) });
    if (r() < 0.6) box.metal.push({ p: [X(DEPTH * (0.3 + r() * 0.5)), H + 0.5, zc + (r() - 0.5) * (w - 2)], s: [1.1, 0.6, 0.8], r: r() * 0.2, c: "#d4d2cc" });
    if (r() < 0.35) cyl.metal.push({ p: [X(DEPTH * 0.7), H + 1.6, zc + (r() - 0.5) * w], s: [0.06, 3, 0.06], c: "#55524d" });

    // the shop inside, seen through the open front
    const variant = kind === "sensor" ? 2 : kind === "factory" ? 1 : Math.floor(r() * 4);
    if (kind !== "empty")
      fronts.push({
        x: X(1.19), y: 1.75, z: zc, w: w - 0.8, h: 3.5, s, variant,
        tint: kind === "factory" ? "#c9a6ff" : pick(["#fff2dc", "#ffe7c4", "#f6f0ff", "#fff8ee"]),
        k: far ? 0.9 : 1.15 + r() * 0.3,
      });
    // the rolled-up shutter, sometimes half down
    box.metal.push({ p: [X(1.02), 3.32, zc], s: [0.32, 0.34, w - 0.8], c: "#8d8a84" });
    const half = kind === "empty" ? 0.95 : r() < 0.25 ? 0.4 + r() * 0.7 : 0;
    if (half) box.metal.push({ p: [X(1.1), 3.15 - half / 2, zc], s: [0.05, half, w - 0.8], c: "#a7a49c" });

    // an awning over some fronts
    if (kind !== "empty" && kind !== "foil" && r() < 0.55) {
      const c = pick(AWNINGS);
      box.cloth.push({ p: [X(-0.85), 3.12, zc], s: [1.8, 0.05, w - 0.9], rz: s * 0.31, c });
      box.cloth.push({ p: [X(-1.72), 2.71, zc], s: [0.04, 0.3, w - 0.9], c });
    }
    // windows on the upper floor, some lit, an air conditioner hanging under some
    if (floors === 2) {
      const n = w > 6.2 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const zz = z0 + (w * (k + 1)) / (n + 1);
        const ww = Math.min(1.7, w / (n + 0.8));
        const lit = r() < 0.25;
        (lit ? box.glow : box.glass).push({ p: [X(-0.02), 5.6, zz], s: [0.06, 1.7, ww], c: lit ? "#ffd9a0" : pick(["#5d7590", "#6b7f96", "#8a6a5a", "#4f6680"]), k: lit ? 0.9 : 1 });
        box.white.push({ p: [X(-0.05), 6.5, zz], s: [0.12, 0.12, ww + 0.24], c: "#f2ede4" });
        box.white.push({ p: [X(-0.1), 4.7, zz], s: [0.26, 0.1, ww + 0.34], c: "#f2ede4" });
        for (const e of [-1, 0, 1]) box.white.push({ p: [X(-0.05), 5.6, zz + (e * ww) / 2], s: [0.12, 1.8, 0.1], c: "#f2ede4" });
        const below = r();
        if (below < 0.4) box.metal.push({ p: [X(-0.32), 4.35, zz + (r() - 0.5) * 0.6], s: [0.55, 0.55, 0.85], c: "#dcdad4" });
        else if (below < 0.7) {
          // a box of flowers under the window
          box.trim.push({ p: [X(-0.25), 4.82, zz], s: [0.36, 0.26, ww], c: "#8a6440" });
          for (let f = 0; f < 4; f++) ball.leaf.push({ p: [X(-0.25), 5.02, zz + (f / 3 - 0.5) * (ww - 0.3)], s: [0.3, 0.26, 0.3], c: pick(["#e8475f", "#f4c542", "#d95fa6", "#5f8a3f", "#f7f2e8"]) });
        }
      }
    }
    if (floors === 2 && r() < 0.5) cyl.metal.push({ p: [X(-0.14), H / 2, z0 + 0.12], s: [0.14, H, 0.14], c: "#8d8a84" });
    // pots of plants and stacks of white boxes at the door (ch. 18: couriers swap trays of white boxes)
    if (!far && kind !== "empty" && r() < 0.45) {
      const zz = r() < 0.5 ? z1 - 0.55 : z0 + 0.55;
      cyl.plaster.push({ p: [X(-0.45), 0.4, zz], s: [0.62, 0.5, 0.62], c: "#b5603e" });
      ball.leaf.push({ p: [X(-0.45), 0.98, zz], s: [0.95, 0.85, 0.95], c: pick(["#4f7d3a", "#3f6e35", "#5f8a3f"]) });
    }
    if (!far && kind === "shop" && r() < 0.3) {
      const zz = zc + (r() - 0.5) * (w - 2);
      for (let k = 0; k < 2 + Math.floor(r() * 4); k++)
        box.white.push({ p: [X(-0.5), 0.29 + k * 0.27, zz], s: [0.62, 0.25, 0.8], r: (r() - 0.5) * 0.15, c: "#f4f2ee" });
    }

    // where a launch's sign can hang; the empty shop keeps only an empty frame
    if (kind === "shop" || kind === "mural")
      candidates.push({
        s,
        z: zc,
        slot: floors === 2 ? { kind: "blade", s, z: z1 - 0.7, base: 4.25 } : { kind: "roof", s, z: zc, y: H + 0.22 },
        board: { x: X(-0.04), y: 3.95, z: zc, size: 0.72, s, variant: 2 + Math.floor(r() * 4) },
      });
    else if (kind !== "empty") boards.push({ x: X(-0.04), y: 3.95, z: zc, size: 0.72, s, variant: { sensor: 0, foil: 1, factory: 2 }[kind] ?? 3 });
  }

  // ---- the empty shop: an empty bracket where its sign will hang
  {
    const e = special.empty;
    const z = e.z1 - 0.7;
    box.dark.push({ p: [e.s * (FX - 0.75), 4.05, z], s: [1.5, 0.07, 0.07], c: "#3a3530" });
    box.dark.push({ p: [e.s * (FX - 0.45), 3.8, z], s: [0.07, 0.5, 0.07], rz: e.s * 0.8, c: "#3a3530" });
    for (const d of [0.55, 1.35]) box.dark.push({ p: [e.s * (FX - d), 3.92, z], s: [0.03, 0.22, 0.03], c: "#6a6560" });
  }

  // ---- the chip factory: a stack on the roof, steam from it
  const f = special.factory;
  const steam: [number, number, number] = [f.s * (FX + DEPTH * 0.55), f.H + 4.4, (f.z1 + f.z0) / 2 + 1];
  cyl.metal.push({ p: [steam[0], f.H + 2.2, steam[2]], s: [0.55, 4.2, 0.55], c: "#8e8a84" });
  cyl.metal.push({ p: [steam[0], f.H + 4.3, steam[2]], s: [0.72, 0.22, 0.72], c: "#5c5853" });
  cyl.metal.push({ p: [f.s * (FX + DEPTH * 0.3), f.H + 1, (f.z1 + f.z0) / 2 - 1.2], s: [0.35, 1.8, 0.35], c: "#9a958d" });

  // ---- the sensor shop: dishes and eyes on a rack; the foil shop: rolls and hanging sheets of silver foil
  {
    const e = special.sensor;
    const z = (e.z1 + e.z0) / 2;
    box.metal.push({ p: [e.s * (FX - 0.55), 0.85, z], s: [0.5, 1.7, 2.4], c: "#6a6660" });
    for (let k = 0; k < 4; k++) {
      ball.metal.push({ p: [e.s * (FX - 0.8), 1.95 + (k % 2) * 0.05, z - 0.9 + k * 0.6], s: [0.42, 0.42, 0.18], r: Math.PI / 2, c: "#e6e3dc" });
      cyl.metal.push({ p: [e.s * (FX - 0.6), 0.6 + k * 0.35, z - 0.9 + k * 0.6], s: [0.2, 0.18, 0.2], c: "#2b2b30" });
    }
    const o = special.foil;
    const zf = (o.z1 + o.z0) / 2;
    for (let k = 0; k < 5; k++) box.foil.push({ p: [o.s * (FX + 0.75), 1.9, zf - 2 + k * 1], s: [0.03, 2.6 - (k % 2) * 0.4, 0.85], r: (k - 2) * 0.12, c: "#e8ecf0" });
    for (let k = 0; k < 6; k++) cyl.foil.push({ p: [o.s * (FX - 0.55), 0.35 + (k % 3) * 0.32, zf - 1.4 + Math.floor(k / 3) * 2.6], s: [0.3, 1.1, 0.3], rx: Math.PI / 2, c: "#dfe5ea" });
  }

  // ---- the pavements, with holes where stairways go down
  const holes = STAIRS.map(([s, z]) => ({ s, z1: z, z0: z - 4.6 }));
  const pave = (s: number, z1: number, z0: number, x0: number, x1: number) => {
    if (z1 - z0 < 0.01) return;
    box.paving.push({ p: [s * (x0 + x1) / 2, -0.22, (z1 + z0) / 2], s: [x1 - x0, 0.76, z1 - z0], c: "#d6cfc2" });
  };
  for (const [top, bottom] of BLOCKS) {
    for (const s of [-1, 1]) {
      let z = top;
      for (const h of holes.filter((h) => h.s === s && h.z1 <= top && h.z0 >= bottom)) {
        pave(s, z, h.z1, ROAD + 0.25, FX);
        pave(s, h.z1, h.z0, ROAD + 0.25, 5.1);
        pave(s, h.z1, h.z0, 6.9, FX);
        z = h.z0;
      }
      pave(s, z, bottom, ROAD + 0.25, FX);
      box.kerb.push({ p: [s * (ROAD + 0.125), -0.21, (top + bottom) / 2], s: [0.25, 0.78, top - bottom], c: "#9c968c" });
      // a tree in a square pit at each corner of the block
      for (const tz of [top - 2.2, bottom + 2.2]) {
        trees.push([s * 6.3, tz, 0.75]);
        box.kerb.push({ p: [s * 6.3, 0.18, tz], s: [1.3, 0.06, 1.3], c: "#8d877d" });
      }
    }
  }
  // the stairways: walls of polished stone, steps going down into the dark, a frame on top to carry a sign
  for (const { s, z1, z0 } of holes) {
    const xc = s * 6;
    for (const xw of [5.0, 7.0]) box.paving.push({ p: [s * xw, -1.25, (z1 + z0) / 2], s: [0.2, 4.7, z1 - z0], c: "#cbbfae" });
    box.paving.push({ p: [xc, -1.25, z0 - 0.1], s: [2.2, 4.7, 0.2], c: "#cbbfae" });
    for (const xw of [5.0, 7.0]) box.metal.push({ p: [s * xw, 1.15, (z1 + z0) / 2], s: [0.06, 0.06, z1 - z0], c: "#c9a65a" });
    for (let k = 0; k < 12; k++) box.paving.push({ p: [xc, 0.16 - (k + 1) * 0.28 - 0.54, z1 - k * 0.38 - 0.19], s: [1.8, 1.08, 0.38], c: "#b9ad9a" });
    box.dark.push({ p: [xc, -3.7, (z1 + z0) / 2], s: [1.8, 0.2, z1 - z0], c: "#0d0b0a" });
    box.glow.push({ p: [s * 5.12, -1.6, z0 + 1.2], s: [0.04, 0.25, 0.6], c: "#ffe2b0", k: 1.4 });
    for (const xw of [5.1, 6.9]) box.dark.push({ p: [s * xw, 1.55, z1 - 0.3], s: [0.12, 2.9, 0.12], c: "#2f2b28" });
    box.dark.push({ p: [xc, 2.98, z1 - 0.3], s: [2.0, 0.12, 0.12], c: "#2f2b28" });
    candidates.push({ s, z: z1, slot: { kind: "stair", x: xc, z: z1 - 0.3, y: 3.08 } });
  }

  // ---- the rows behind the shops: more low buildings on the grid, trees between them, lights coming on
  for (const s of [-1, 1]) {
    for (const [cx, depth, hi] of [[FX + DEPTH + 9, 10, 2], [FX + DEPTH + 33, 16, 3]] as const) {
      let z = 72;
      while (z > -260) {
        const w = 7 + r() * 6;
        const cross = CROSS.find(([t, b]) => z > b && z - w < t);
        if (cross) {
          z = Math.min(z, cross[1]);
          continue;
        }
        {
          const H = 3.6 * (1 + Math.floor(r() * hi)) + 0.4;
          const zc = z - w / 2;
          box.plaster.push({ p: [s * cx, H / 2, zc], s: [depth, H, w - 0.6], c: pick(WALLS) });
          box.plaster.push({ p: [s * cx, H + 0.1, zc], s: [depth + 0.3, 0.2, w - 0.3], c: CONCRETE });
          if (r() < 0.6) cyl.plaster.push({ p: [s * (cx + (r() - 0.5) * depth * 0.6), H + 0.9, zc], s: [1.2, 1.4, 1.2], c: "#cfc8ba" });
          for (let k = 0; k < 3; k++) {
            if (r() < 0.45) box.glow.push({ p: [s * (cx - depth / 2 - 0.02), 1.8 + 3.6 * Math.floor(r() * (H / 3.6)), zc + (r() - 0.5) * (w - 2)], s: [0.05, 1.1, 1.1], c: pick(["#ffd9a0", "#ffe9c2", "#ffc58a"]), k: 1.1 });
          }
        }
        z -= w;
      }
    }
    for (let z = 66; z > -255; z -= 7 + r() * 4) trees.push([s * (FX + DEPTH + 18.5), z, 0.9 + r() * 0.3]);
  }
  // the side streets, lined with trees
  for (const [t, b] of CROSS) {
    const z = (t + b) / 2;
    for (let x = 14; x < 120; x += 8 + r() * 3) {
      trees.push([x, z + 3.6, 0.8 + r() * 0.3]);
      trees.push([-x, z - 3.6, 0.8 + r() * 0.3]);
    }
  }

  // ---- strings of bulbs across the street, and power lines high above
  const strings: { a: [number, number, number]; b: [number, number, number]; sag: number; bulbs: boolean }[] = [];
  for (const z of [18, 2, -20, -36, -70, -100]) strings.push({ a: [-FX + 0.1, 4.55, z], b: [FX - 0.1, 4.55, z - 2.5], sag: 0.75, bulbs: true });
  for (const z of [-12, -44, -90]) strings.push({ a: [-FX - 2, 7.9, z], b: [FX + 2, 7.9, z + 4], sag: 0.9, bulbs: false });
  for (const st of strings.filter((s) => s.bulbs)) {
    for (let k = 1; k < 18; k++) {
      const t = k / 18;
      const p = catenary(st, t);
      ball.glow.push({ p: [p[0], p[1] - 0.1, p[2]], s: [0.12, 0.15, 0.12], c: k % 3 === 0 ? "#ffb36b" : "#ffe3a8", k: 2.2 });
    }
  }

  // hand carts at the kerb under striped parasols, selling what the shops do not
  const cone: Piece[] = [];
  for (const [s, z] of [[-1, 27], [1, 24], [-1, -30], [1, -24], [-1, -48], [1, -88]] as const) {
    const x = s * (ROAD - 0.75);
    const c = pick(AWNINGS);
    box.cloth.push({ p: [x, 0.75, z], s: [0.95, 0.5, 1.6], c: "#8a6440" });
    for (const dz of [-0.5, 0.5]) cyl.metal.push({ p: [x - s * 0.5, 0.32, z + dz], s: [0.6, 0.06, 0.6], rz: Math.PI / 2, c: "#2b2a2e" });
    for (let k = 0; k < 6; k++) ball.leaf.push({ p: [x + ((k % 2) - 0.5) * 0.4, 1.08, z - 0.6 + Math.floor(k / 2) * 0.6], s: [0.32, 0.26, 0.32], c: pick(["#f4c542", "#e8475f", "#ff8a3d", "#f7f2e8"]) });
    cyl.metal.push({ p: [x, 1.75, z], s: [0.05, 2.2, 0.05], c: "#6a6660" });
    cone.push({ p: [x, 2.95, z], s: [2.3, 0.55, 2.3], c });
  }

  // people in robes: most stroll up and down the pavements, some stand at a shop front; the stretch of pavement
  // around the empty shop is left clear, so nobody stands between the visitor and the green circle
  const walkers = Array.from({ length: 30 }, (_, i) => {
    const s = i % 2 ? 1 : -1;
    const still = i % 3 === 0;
    const [zA, zB] = s === EMPTY.s ? (i % 4 === 1 ? [62, 11] : [-15, -70]) : [60, -70];
    let z = zB + r() * (zA - zB);
    if (still && s === EMPTY.s && z > -15 && z < 11) z -= 28;
    return {
      x: s * (still ? FX - 0.9 : ROAD + 0.65 + (i % 4 < 2 ? 0 : 0.5)),
      zA: still ? z : zA,
      zB: still ? z : zB,
      speed: 0.9 + r() * 0.5,
      colour: pick(["#3b2a4f", "#4a3560", "#2f2a45", "#563f6e", "#45306a", "#2e3a5c", "#5b3f78"]),
      tall: 0.92 + r() * 0.16,
      still,
      phase: r() * 2,
    };
  });
  // the signs go to the places nearest the empty shop first, so the busiest launches are its neighbours
  const near = (c: { z: number; s: number }) => Math.abs(c.z - EMPTY.z) + (c.s === EMPTY.s ? 0 : 9);
  candidates.sort((a, b) => near(a) - near(b));
  return { box, cyl, ball, cone, fronts, boards, candidates, walkers, trees, steam, strings, mural: special.mural, empty: special.empty };
}

/** A point along a hanging wire, 0 to 1 from end a to end b. */
export function catenary(s: { a: [number, number, number]; b: [number, number, number]; sag: number }, t: number): [number, number, number] {
  return [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t - s.sag * 4 * t * (1 - t), s.a[2] + (s.b[2] - s.a[2]) * t];
}
