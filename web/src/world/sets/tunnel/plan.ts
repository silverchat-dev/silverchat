/**
 * The tunnel's plan and shell. The plan is a few straight bays (the sloped tunnel, the fork hall, the left way, the
 * right way and the booth court), each a rectangle on the ground; their union is the space inside. Walls are the
 * bays' edges where no other bay covers them, the vault is a field over the union (it rises with the distance to the
 * nearest wall, so the ways meet in a groin like real masonry), and the light is baked into the vertices: lamp pools,
 * and a dusk that grows deeper the further a way leads from the hall.
 */
import * as THREE from "three";

import { smoothstep } from "../../kit/noise";

/** straight wall height, the vault's rise above it, and how far from a wall the vault reaches its crown */
export const WALL = 5;
export const RISE = 3;
export const SPAN = 5;

/** The floor: level at the fork, rising towards the entrance (the tunnel slopes down to the fork, ch. 3). */
export const ENTRANCE = 129;
export const floorY = (z: number) => 0.07 * Math.min(Math.max(z, 0), ENTRANCE);

export type Bay = {
  name: string;
  /** a point on the bay's axis, and the axis' angle (0 is +z; the walk goes towards -z) */
  o: [number, number];
  a: number;
  /** half width, and where along the axis the bay starts and ends */
  w: number;
  s0: number;
  s1: number;
  /** leave the far end open (the entrance) */
  open?: boolean;
};

const TURN_L = 0.36;
const TURN_R = 0.33;

export const BAYS: Bay[] = [
  { name: "main", o: [0, 0], a: 0, w: 6.5, s0: -3, s1: ENTRANCE, open: true },
  { name: "hall", o: [-1, 0], a: 0, w: 13, s0: -6, s1: 40 },
  { name: "left", o: [-7.5, -6], a: Math.PI + TURN_L, w: 5.2, s0: -2, s1: 150 },
  { name: "right", o: [6.5, -6], a: Math.PI - TURN_R, w: 4.5, s0: -2, s1: 12 },
  { name: "court", o: [6.5, -6], a: Math.PI - TURN_R, w: 8.5, s0: 9, s1: 34 },
];

export const bay = (name: string) => BAYS.find((b) => b.name === name)!;

/** The axis direction and the side direction (to the right when looking along the axis). */
export const axes = (b: Bay) => {
  const d = new THREE.Vector2(Math.sin(b.a), Math.cos(b.a));
  return { d, n: new THREE.Vector2(-d.y, d.x) };
};

/** A point of a bay in its own terms (s along, u across, h above the floor), in the set's space. */
export function at(b: Bay, s: number, u: number, h = 0) {
  const { d, n } = axes(b);
  const x = b.o[0] + d.x * s + n.x * u;
  const z = b.o[1] + d.y * s + n.y * u;
  return new THREE.Vector3(x, floorY(z) + h, z);
}

/** The angle that turns an object's +z to look back along a bay's axis (towards the fork). */
export const facingBack = (b: Bay) => Math.atan2(-Math.sin(b.a), -Math.cos(b.a));

/** Signed distance from (x, z) to one bay: negative inside. */
function bayDistance(b: Bay, x: number, z: number, extend = 0) {
  const { d, n } = axes(b);
  const px = x - b.o[0];
  const pz = z - b.o[1];
  const s = px * d.x + pz * d.y;
  const u = px * n.x + pz * n.y;
  const s1 = b.s1 + (b.open ? extend : 0);
  const qx = Math.abs(s - (b.s0 + s1) / 2) - (s1 - b.s0) / 2;
  const qy = Math.abs(u) - b.w;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
}

/** Signed distance to the whole tunnel: negative inside. `extend` runs the open entrance on, so the vault does not close there. */
export function inside(x: number, z: number, extend = 0, skip?: Bay) {
  let best = Infinity;
  for (const b of BAYS) if (b !== skip) best = Math.min(best, bayDistance(b, x, z, extend));
  return best;
}

/** The vault's height above the floor at a distance `d` from the nearest wall: a quarter ellipse, then level. */
export const vault = (d: number) => {
  const t = Math.min(Math.max(d / SPAN, 0), 1);
  return WALL + RISE * Math.sqrt(1 - (1 - t) * (1 - t));
};

export type Lamp = { p: THREE.Vector3; colour: THREE.Color; reach: number; strength: number };

/**
 * The baked light at a point: the hall's dim warm air, a dusk that deepens along each way (so a way reads as leading
 * on into the dark), daylight near the entrance, and each lamp's pool.
 */
export function bake(lamps: Lamp[], p: THREE.Vector3, out = new THREE.Color()) {
  const fromHall = Math.hypot(p.x + 1, p.z - 16);
  const air = 0.1 + 0.26 * Math.exp(-Math.max(0, fromHall - 24) / 30);
  const day = smoothstep(96, ENTRANCE, p.z);
  out.setRGB(air * 0.92 + day * 0.8, air * 0.95 + day * 0.62, air * 1.0 + day * 0.45);
  for (const l of lamps) {
    const k = Math.max(0, 1 - p.distanceTo(l.p) / l.reach);
    if (k > 0) {
      const f = k * k * l.strength;
      out.r += l.colour.r * f;
      out.g += l.colour.g * f;
      out.b += l.colour.b * f;
    }
  }
  return out;
}

/** Where `free` changes between a and b, by halving: the first free point if `opening`, else the last free one. */
function edgeBetween(free: (t: number) => boolean, a: number, b: number, opening: boolean) {
  let lo = a;
  let hi = b;
  for (let k = 0; k < 14; k++) {
    const mid = (lo + hi) / 2;
    if (free(mid) === opening) hi = mid;
    else lo = mid;
  }
  return opening ? hi : lo;
}

const ROWS = [-0.5, 0, 0.7, 1.5, 2.3, 3.1, 3.8, 4.4, 4.8, WALL + 0.5];

/** The walls: every bay edge that no other bay covers, as vertical strips that follow the sloping floor. */
export function wallGeometry(lamps: Lamp[]) {
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const c = new THREE.Color();
  const v = new THREE.Vector3();
  for (const b of BAYS) {
    const { d, n } = axes(b);
    const corner = (s: number, u: number) => new THREE.Vector2(b.o[0] + d.x * s + n.x * u, b.o[1] + d.y * s + n.y * u);
    const edges: [THREE.Vector2, THREE.Vector2, THREE.Vector2][] = [
      [corner(b.s0, b.w), corner(b.s1, b.w), n.clone().negate()],
      [corner(b.s1, -b.w), corner(b.s0, -b.w), n.clone()],
      [corner(b.s0, -b.w), corner(b.s0, b.w), d.clone()],
    ];
    if (!b.open) edges.push([corner(b.s1, b.w), corner(b.s1, -b.w), d.clone().negate()]);
    for (const [A, B, inward] of edges) {
      const len = A.distanceTo(B);
      const point = (t: number) => A.clone().lerp(B, t / len);
      const free = (t: number) => {
        const p = point(t);
        return inside(p.x, p.y, 0, b) > -1e-3;
      };
      // walk the edge, find the stretches no other bay covers, and sharpen their ends
      const runs: [number, number][] = [];
      const step = 0.25;
      let start = free(0) ? 0 : -1;
      for (let t = step; t <= len + 1e-6; t += step) {
        const tt = Math.min(t, len);
        const f = free(tt);
        if (f && start < 0) {
          start = edgeBetween(free, tt - step, tt, true);
        } else if (!f && start >= 0) {
          runs.push([start, edgeBetween(free, tt - step, tt, false)]);
          start = -1;
        }
      }
      if (start >= 0) runs.push([start, len]);
      for (const [t0, t1] of runs) {
        if (t1 - t0 < 0.05) continue;
        const cols = Math.max(1, Math.ceil(t1 - t0));
        const base = pos.length / 3;
        for (let i = 0; i <= cols; i++) {
          const p = point(t0 + ((t1 - t0) * i) / cols);
          const fy = floorY(p.y);
          for (const r of ROWS) {
            v.set(p.x, fy + r, p.y);
            pos.push(v.x, v.y, v.z);
            nor.push(inward.x, 0, inward.y);
            // lamps light the wall they hang on a little less than the floor below them
            bake(lamps, v.set(p.x + inward.x * 0.6, v.y, p.y + inward.y * 0.6), c);
            col.push(c.r, c.g, c.b);
          }
        }
        const R = ROWS.length;
        for (let i = 0; i < cols; i++) {
          for (let j = 0; j < R - 1; j++) {
            const a = base + i * R + j;
            const e = a + R;
            // faces turn towards the inside
            idx.push(a, a + 1, e, e, a + 1, e + 1);
          }
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  // the strips were laid without knowing which way each edge runs: turn any face that looks away from its normal
  fixWinding(g);
  return g;
}

/** Make every triangle's winding agree with its vertices' normals, so single-sided faces show from the inside. */
function fixWinding(g: THREE.BufferGeometry) {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const index = g.index!.array as Uint32Array | Uint16Array | number[];
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const face = new THREE.Vector3();
  const want = new THREE.Vector3();
  const out = Array.from(index);
  for (let i = 0; i < out.length; i += 3) {
    const [a, b, c] = [out[i], out[i + 1], out[i + 2]];
    ab.set(p.getX(b) - p.getX(a), p.getY(b) - p.getY(a), p.getZ(b) - p.getZ(a));
    ac.set(p.getX(c) - p.getX(a), p.getY(c) - p.getY(a), p.getZ(c) - p.getZ(a));
    face.crossVectors(ab, ac);
    want.set(n.getX(a), n.getY(a), n.getZ(a));
    if (face.dot(want) < 0) [out[i + 1], out[i + 2]] = [c, b];
  }
  g.setIndex(out);
}

/** The bounding rectangle of the plan, with a margin. */
function bounds(margin: number) {
  const box = new THREE.Box2();
  for (const b of BAYS) {
    const { d, n } = axes(b);
    for (const s of [b.s0, b.s1])
      for (const u of [-b.w, b.w]) box.expandByPoint(new THREE.Vector2(b.o[0] + d.x * s + n.x * u, b.o[1] + d.y * s + n.y * u));
  }
  return box.expandByScalar(margin);
}

/**
 * A grid over the plan, kept where it is inside: the floor (`ceiling` false) or the vault. Vault points on or past a
 * wall are pulled onto the wall line at wall height, so the vault meets every wall in one clean line.
 */
export function gridGeometry(lamps: Lamp[], cell: number, ceiling: boolean) {
  const box = bounds(2);
  const nx = Math.ceil((box.max.x - box.min.x) / cell);
  const nz = Math.ceil((box.max.y - box.min.y) / cell);
  const pos = new Float32Array((nx + 1) * (nz + 1) * 3);
  const col = new Float32Array((nx + 1) * (nz + 1) * 3);
  const sd = new Float32Array((nx + 1) * (nz + 1));
  const c = new THREE.Color();
  const v = new THREE.Vector3();
  const extend = ceiling ? 30 : 0;
  const e = 0.05;
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const k = j * (nx + 1) + i;
      let x = box.min.x + i * cell;
      let z = box.min.y + j * cell;
      const dist = inside(x, z, extend);
      sd[k] = dist;
      let y: number;
      if (ceiling) {
        if (dist > -cell * 0.45 && dist < cell * 2) {
          // pull onto the wall line along the field's slope
          const gx = (inside(x + e, z, extend) - inside(x - e, z, extend)) / (2 * e);
          const gz = (inside(x, z + e, extend) - inside(x, z - e, extend)) / (2 * e);
          const gl = Math.hypot(gx, gz) || 1;
          x -= (gx / gl) * dist;
          z -= (gz / gl) * dist;
          y = floorY(z) + WALL;
        } else y = floorY(z) + vault(-dist);
      } else y = floorY(z);
      pos.set([x, y, z], k * 3);
      bake(lamps, v.set(x, ceiling ? y - 0.5 : y, z), c);
      if (ceiling) c.multiplyScalar(0.62);
      col.set([c.r, c.g, c.b], k * 3);
    }
  }
  const idx: number[] = [];
  const keep = (k: number) => sd[k] < (ceiling ? 0 : 0.6);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      const b = a + 1;
      const cc = a + nx + 1;
      const d = cc + 1;
      // nothing past the entrance: outside belongs to the hillside
      if (pos[a * 3 + 2] > ENTRANCE + 0.5 && pos[d * 3 + 2] > ENTRANCE + 0.5) continue;
      if (keep(a) || keep(b) || keep(cc)) idx.push(a, cc, b);
      if (keep(b) || keep(cc) || keep(d)) idx.push(b, cc, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setIndex(ceiling ? idx.map((_, i) => idx[i - (i % 3) + [0, 2, 1][i % 3]]) : idx);
  g.computeVertexNormals();
  return g;
}

/**
 * A rib across a bay: an arch of stone standing proud of the wall and vault by `inset`, `depth` thick. The shape runs
 * past the walls into the rock, so it never shows a gap.
 */
export function ribGeometry(w: number, inset: number, depth: number, band = 0) {
  const shape = new THREE.Shape();
  const edge = (u: number) => vault(w - Math.abs(u)) - inset;
  const inner = w - inset;
  const steps = 28;
  if (band > 0) {
    // a thin band that lines the inside of the arch: up one side, over, down the other, and back a little further in
    const outer = (u: number) => vault(w - Math.abs(u)) - inset;
    const deeper = (u: number) => vault(w - Math.abs(u)) - inset - band;
    shape.moveTo(-inner, 0);
    for (let i = 0; i <= steps; i++) {
      const u = -inner + (2 * inner * i) / steps;
      shape.lineTo(u, outer(u));
    }
    shape.lineTo(inner, 0);
    shape.lineTo(inner - band, 0);
    for (let i = steps; i >= 0; i--) {
      const u = -(inner - band) + (2 * (inner - band) * i) / steps;
      shape.lineTo(u, deeper(u));
    }
    shape.lineTo(-(inner - band), 0);
  } else {
    shape.moveTo(-w - 1, -0.4);
    shape.lineTo(-w - 1, WALL + RISE + 1);
    shape.lineTo(w + 1, WALL + RISE + 1);
    shape.lineTo(w + 1, -0.4);
    shape.lineTo(inner, -0.4);
    for (let i = steps; i >= 0; i--) {
      const u = -inner + (2 * inner * i) / steps;
      shape.lineTo(u, Math.max(edge(u), 0));
    }
    shape.lineTo(-inner, -0.4);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** A matrix that stands a rib (built across x, up y) at a point of a bay, square to its axis. */
export function acrossBay(b: Bay, s: number, u = 0, h = 0, k = 1) {
  const { d, n } = axes(b);
  const p = at(b, s, u, h);
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(n.x, 0, n.y), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-d.x, 0, -d.y));
  m.scale(new THREE.Vector3(k, k, k));
  return m.setPosition(p);
}

/**
 * Underground, the sun does not reach: this keeps a material lit by lamps, the sky's soft bounce and nothing else, so
 * the inside stays dim wherever the world puts the set and however the sun's shadows fall.
 */
export function underground<M extends THREE.Material>(m: M): M {
  const before = m.onBeforeCompile.bind(m);
  // the shader is told apart by what it was before, so materials that differ keep their own programs
  const key = m.customProgramCacheKey() + "|underground";
  m.onBeforeCompile = (s, r) => {
    before(s, r);
    // the light loop with the sun and the sky's coloured bounce switched off; what is left of the sky (the soft
    // light of the image around) is made grey, so inside only the lamps give colour
    s.fragmentShader = s.fragmentShader
      .replace(
        "#include <lights_fragment_begin>",
        THREE.ShaderChunk.lights_fragment_begin
          .replace("#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )", "#if 0")
          .replace("#if ( NUM_HEMI_LIGHTS > 0 )", "#if 0"),
      )
      .replace(
        "#include <lights_fragment_maps>",
        `#include <lights_fragment_maps>
        iblIrradiance = vec3(dot(iblIrradiance, vec3(0.3333)));
        #if defined( RE_IndirectSpecular )
          radiance = vec3(dot(radiance, vec3(0.3333)));
        #endif`,
      );
  };
  m.customProgramCacheKey = () => key;
  return m;
}
