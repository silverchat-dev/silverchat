/**
 * Ground: a height function, a path carved into it, and a mesh coloured by what the ground is (meadow, dry grass,
 * worn earth on the path, darker soil in hollows and on steep sides). Grass, trees and houses read the same height
 * function, so everything stands on the ground it was made for.
 */
import * as THREE from "three";

import { fbm, lerp, simplex2, smoothstep } from "./noise";

export type Land = {
  height: (x: number, z: number) => number;
  /** distance on the ground to the nearest point of the path */
  toPath: (x: number, z: number) => number;
  path: THREE.CatmullRomCurve3;
  size: number;
  /** the level of the flat summit, where a room can stand */
  summit: number;
};

/** Distance from (x, z) to a polyline, in the xz plane. */
function polylineDistance(points: THREE.Vector3[]) {
  return (x: number, z: number) => {
    let best = Infinity;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz)));
      const dx = x - (a.x + abx * t);
      const dz = z - (a.z + abz * t);
      best = Math.min(best, dx * dx + dz * dz);
    }
    return Math.sqrt(best);
  };
}

/**
 * Land around a hill: rolling meadow, a hill rising to a flat summit, and a path winding up to its foot.
 * `hill` is the summit centre and plateau, `path` the walk's points (heights are filled in from the ground).
 */
export function makeLand({
  seed,
  size,
  hill,
  path,
}: {
  seed: number;
  size: number;
  hill: { x: number; z: number; height: number; radius: number; plateau: number; room?: number };
  path: [number, number][];
}): Land {
  const n = simplex2(seed);
  const n2 = simplex2(seed + 7);

  const rolling = (x: number, z: number) => 2.4 * fbm(n, x / 70, z / 70, 4) + 0.5 * fbm(n2, x / 14, z / 14, 3);
  const summit = rolling(hill.x, hill.z) + hill.height * Math.exp(-(hill.plateau * hill.plateau) / (2 * hill.radius * hill.radius));
  const base = (x: number, z: number) => {
    const r = Math.hypot(x - hill.x, z - hill.z);
    const rise = hill.height * Math.exp(-(r * r) / (2 * hill.radius * hill.radius));
    // the slope is not a perfect bell: a few soft shoulders and folds
    const folds = 1.8 * fbm(n2, x / 22, z / 22, 3) * smoothstep(hill.plateau, hill.plateau * 1.6, r) * (1 - smoothstep(hill.radius * 1.5, hill.radius * 2.5, r));
    const slope = rolling(x, z) + rise + folds;
    // the summit is levelled exactly, so a room stands flat on it; its edge rounds off into the slope
    const level = lerp(slope, summit, 1 - smoothstep(hill.plateau * 0.75, hill.plateau * 1.2, r));
    if (!hill.room) return level;
    // a ring of earth around the room: it sits in the hill, only its rim showing, "a hill that looks like nature"
    const R = hill.room;
    const berm = 1.5 * smoothstep(R - 0.1, R + 1.2, r) * (1 - smoothstep(R + 2.2, R + 6, r));
    // under the room the ground drops away, so it never shows through the floor
    const under = 0.6 * (1 - smoothstep(R - 1.2, R - 0.4, r));
    return level + berm - under;
  };

  const curve = new THREE.CatmullRomCurve3(
    path.map(([x, z]) => new THREE.Vector3(x, base(x, z), z)),
    false,
    "centripetal",
  );
  const samples = curve.getSpacedPoints(240);
  const toPath = polylineDistance(samples);

  // the path is cut into the ground: worn a little lower and levelled across its width
  const height = (x: number, z: number) => {
    const h = base(x, z);
    const d = toPath(x, z);
    const cut = 1 - smoothstep(1.2, 4.5, d);
    return h - cut * 0.22;
  };

  return { height, toPath, path: curve, size, summit };
}

const C = {
  meadow: new THREE.Color("#5b8740"),
  lush: new THREE.Color("#446f32"),
  sun: new THREE.Color("#93ad5c"),
  dry: new THREE.Color("#b0a468"),
  soil: new THREE.Color("#5a4a33"),
  path: new THREE.Color("#c2a77a"),
  pathEdge: new THREE.Color("#8d7a4f"),
};

/** The ground mesh for a Land, `segments` quads a side, coloured per vertex. */
export function landGeometry(land: Land, segments: number, seed = 3) {
  const g = new THREE.PlaneGeometry(land.size, land.size, segments, segments);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const n = simplex2(seed);
  const c = new THREE.Color();
  const e = land.size / segments;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = land.height(x, z);
    pos.setY(i, y);

    const slope = Math.hypot(land.height(x + e, z) - land.height(x - e, z), land.height(x, z + e) - land.height(x, z - e)) / (2 * e);
    const patch = fbm(n, x / 18, z / 18, 3);
    const fine = n(x / 3, z / 3);

    c.copy(C.meadow).lerp(C.lush, smoothstep(-0.2, 0.5, patch)).lerp(C.sun, smoothstep(0.25, 0.7, -patch) * 0.7);
    c.lerp(C.dry, smoothstep(0.45, 0.8, fbm(n, x / 40 + 9, z / 40, 2)) * 0.55);
    c.lerp(C.soil, smoothstep(0.55, 1.1, slope) * 0.6);
    const d = land.toPath(x, z);
    c.lerp(C.pathEdge, 1 - smoothstep(2.2, 4.2, d + fine * 0.6));
    c.lerp(C.path, 1 - smoothstep(0.6, 2.4, d + fine * 0.5));
    c.multiplyScalar(0.92 + 0.12 * fine);

    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}
