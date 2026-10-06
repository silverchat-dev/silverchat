/**
 * The ground around the sky bridge: a low meadow on the near side rising to the Kalimar woods, the road along x between
 * stone walls, a rocky spur on the far side where the Order of Steering's tower stands, and behind it a tree-covered
 * mountain.
 * One height function, so the bridge, the stairs, the tower and every tree stand on the ground made for them.
 */
import * as THREE from "three";

import { fbm, simplex2, smoothstep } from "../../kit/noise";

/** the road runs along x; its walls stand at |z| = WALL.z, tall on the far side, low on the near side */
export const ROAD = { half: 7, length: 560 };
export const WALL = { z: 10.6, height: 3.4, near: 1.2 };
/** the bridge's long ramp on the near side ends here, where the path meets it */
export const RAMP = { end: 64, foot: 1.6 };
/** the tower's spur: centre and the level of its flat top */
export const SPUR = { x: 0, z: -80, top: 31, plateau: 13 };
/** the straight outdoor staircase: from the bridge's landing up to the spur's edge */
export const STAIR = { x: 0, z0: -27, y0: 9.1, z1: -66, y1: SPUR.top, width: 4 };
/** the mountain behind, with the apartment towers on its slopes */
export const PEAK = { x: 100, z: -205, height: 108, radius: 75 };

export const stairY = (z: number) => STAIR.y0 + (STAIR.y1 - STAIR.y0) * THREE.MathUtils.clamp((z - STAIR.z0) / (STAIR.z1 - STAIR.z0), 0, 1);

const n = simplex2(61);
const n2 = simplex2(62);

/** The walk's path on the near side: it winds a little through the meadow and comes straight onto the ramp. */
export const pathX = (z: number) => Math.sin(z * 0.03) * 6 * smoothstep(RAMP.end, RAMP.end + 50, z);

export function height(x: number, z: number) {
  const az = Math.abs(z);
  const rolling = 2.2 * fbm(n, x / 70, z / 70, 3) * smoothstep(26, 70, az) + 0.4 * fbm(n2, x / 12, z / 12, 2);
  // the near side lies low (the path climbs onto the bridge from it) and rises gently towards the woods; the far
  // side, the landing, sits level with the bridge
  let h = (z > 0 ? 1.1 + 7.4 * smoothstep(70, 170, z) : 9) + rolling;
  // the spur: a flat top for the tower, falling away in rough rocky shoulders
  const rs = Math.hypot(x - SPUR.x, z - SPUR.z);
  const rough = 6 * fbm(n2, x / 18, z / 18, 3) * smoothstep(SPUR.plateau, SPUR.plateau + 10, rs);
  h += (SPUR.top - 9) * Math.pow(1 - smoothstep(SPUR.plateau, 46, rs + rough), 0.6);
  // the mountain: a broad peak with ridges, and low hills rolling away on the left
  const rm = Math.hypot(x - PEAK.x, z - PEAK.z);
  const ridges = 1 + 0.22 * fbm(n, x / 40, z / 40, 4);
  h += PEAK.height * Math.pow(1 - smoothstep(0, PEAK.radius * 2, rm), 1.3) * ridges;
  const rl = Math.hypot(x + 150, z + 190);
  h += 48 * Math.pow(1 - smoothstep(0, 140, rl), 1.4) * (1 + 0.3 * fbm(n2, x / 30, z / 30, 3));
  // the spur's top is levelled exactly, so the tower stands flat
  h += (SPUR.top - h) * (1 - smoothstep(SPUR.plateau - 1, SPUR.plateau + 3, rs));
  // the road's cutting: flat between the walls, banks rising behind them
  const wall = z > 0 ? WALL.near : WALL.height;
  const bank = smoothstep(WALL.z + 0.2, z > 0 ? 18 : 24, az);
  h = az < WALL.z ? 0 : wall - 0.4 + (h - wall + 0.4) * bank;
  // the staircase is laid into the spur: the ground under it is cut to just below the steps
  const sx = Math.abs(x - STAIR.x);
  if (z < STAIR.z0 + 3 && z > STAIR.z1 - 4 && sx < 9) {
    const k = (1 - smoothstep(STAIR.width / 2 + 1, 9, sx)) * smoothstep(STAIR.z1 - 4, STAIR.z1, z);
    h += (stairY(z) - 0.7 - h) * k;
  }
  return h;
}

/** distance to the near-side path, for the ground's colour */
const toPath = (x: number, z: number) => (z < RAMP.end - 4 ? 99 : Math.abs(x - pathX(z)));

const C = {
  meadow: new THREE.Color("#5b8740"),
  lush: new THREE.Color("#446f32"),
  sun: new THREE.Color("#93ad5c"),
  dry: new THREE.Color("#b0a468"),
  forest: new THREE.Color("#355a2b"),
  soil: new THREE.Color("#5a4a33"),
  rock: new THREE.Color("#8d877a"),
  path: new THREE.Color("#c2a77a"),
  pathEdge: new THREE.Color("#8d7a4f"),
};

/** The ground mesh, `segments` quads a side over a square `size` wide, coloured per vertex. */
export function groundGeometry(size: number, segments: number) {
  const g = new THREE.PlaneGeometry(size, size, segments, segments);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const e = 1.5;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = height(x, z);
    pos.setY(i, y);
    const slope = Math.hypot(height(x + e, z) - height(x - e, z), height(x, z + e) - height(x, z - e)) / (2 * e);
    const patch = fbm(n, x / 18, z / 18, 3);
    const fine = n2(x / 3, z / 3);
    c.copy(C.meadow).lerp(C.lush, smoothstep(-0.2, 0.5, patch)).lerp(C.sun, smoothstep(0.25, 0.7, -patch) * 0.7);
    c.lerp(C.dry, smoothstep(0.45, 0.8, fbm(n, x / 40 + 9, z / 40, 2)) * 0.5);
    // under the mountain's woods the ground is dark
    c.lerp(C.forest, smoothstep(20, 45, y) * 0.8);
    c.lerp(C.soil, smoothstep(0.5, 1.0, slope) * 0.55);
    // the spur's shoulders are bare rock
    const rs = Math.hypot(x - SPUR.x, z - SPUR.z);
    c.lerp(C.rock, smoothstep(0.75, 1.3, slope) * (1 - smoothstep(30, 70, rs)) * 0.9);
    const d = toPath(x, z) + fine * 0.5;
    c.lerp(C.pathEdge, 1 - smoothstep(2.2, 4.2, d));
    c.lerp(C.path, 1 - smoothstep(0.6, 2.2, d));
    c.multiplyScalar(0.92 + 0.12 * fine);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}
