/**
 * Grass and trees, built from code. A blade is a curved, tapering strip; a tree is a trunk with branches and a crown
 * of leaf clumps whose normals point out from the crown's centre, so the crown shades like one soft volume and its
 * silhouette stays lumpy and alive. Kinds share materials, so a forest is a handful of draw calls.
 */
import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { rng } from "./noise";

/** A smooth bump field: shared corners of a mesh move together, so its faces never tear apart. */
const lump = (x: number, y: number, z: number, seed: number) =>
  Math.sin(x * 2.3 + seed) * 0.5 + Math.sin(y * 3.1 + seed * 1.7) * 0.3 + Math.sin(z * 2.7 + seed * 2.3) * 0.4 + Math.sin((x + z) * 4.9 + y * 1.3 + seed) * 0.2;

/** One closed surface: seams welded so a deformation moves shared corners together. */
const welded = (g: THREE.BufferGeometry) => {
  g.deleteAttribute("uv");
  g.deleteAttribute("normal");
  return mergeVertices(g);
};

const paint = (g: THREE.BufferGeometry, f: (y: number, i: number) => THREE.Color) => {
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const c = f(pos.getY(i), i);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
};

/** One blade, 0.8 tall: dark at the root, light at the tip, slightly curved. */
export function bladeGeometry() {
  const segs = 3;
  const w = 0.13;
  const h = 0.8;
  const verts: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const half = (w / 2) * (1 - t * 0.92);
    const lean = t * t * 0.18;
    verts.push(-half, t * h, lean, half, t * h, lean);
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  g.setIndex(idx);
  const root = new THREE.Color("#4b6a37");
  const tip = new THREE.Color("#b4c97e");
  paint(g, (y) => root.clone().lerp(tip, Math.pow(y / h, 0.8)));
  g.computeVertexNormals();
  return g;
}

export type Kind = "broadleaf" | "tall" | "pine" | "blossom";

const LEAVES: Record<Kind, string[]> = {
  broadleaf: ["#4a7a35", "#5a8a3c", "#6b9646", "#3f6b30", "#7a9a48"],
  tall: ["#36633a", "#43733f", "#507f47", "#2f5734"],
  pine: ["#1f4d2e", "#2a5d35", "#24553a"],
  blossom: ["#f2b8c6", "#f7d0da", "#e99ab0", "#fbe3ea"],
};

/** A crown made of leaf clumps around `centre`, with outward normals and a darker underside. */
function crown(r: () => number, centre: THREE.Vector3, size: THREE.Vector3, clumps: number, palette: string[]) {
  const parts: THREE.BufferGeometry[] = [];
  const colours = palette.map((p) => new THREE.Color(p));
  for (let i = 0; i < clumps; i++) {
    const rad = (0.34 + r() * 0.22) * Math.min(size.x, size.y, size.z);
    const g = welded(new THREE.IcosahedronGeometry(rad, 1));
    // a clump is never a perfect ball
    const pos = g.attributes.position;
    const sd = r() * 100;
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v) / rad;
      const y = pos.getY(v) / rad;
      const z = pos.getZ(v) / rad;
      const k = 1 + lump(x, y, z, sd) * 0.13;
      pos.setXYZ(v, pos.getX(v) * k, pos.getY(v) * k * 0.82, pos.getZ(v) * k);
    }
    g.computeVertexNormals();
    const a = r() * Math.PI * 2;
    const u = r() * 2 - 1;
    const d = Math.sqrt(r());
    const off = new THREE.Vector3(Math.cos(a) * Math.sqrt(1 - u * u), u * 0.8, Math.sin(a) * Math.sqrt(1 - u * u))
      .multiply(size)
      .multiplyScalar(d * 0.62);
    g.translate(centre.x + off.x, centre.y + off.y, centre.z + off.z);
    const base = colours[Math.floor(r() * colours.length)];
    paint(g, (y) => base.clone().multiplyScalar(0.55 + 0.6 * THREE.MathUtils.smoothstep(y, centre.y - size.y, centre.y + size.y)));
    parts.push(g);
  }
  const merged = mergeGeometries(parts)!;
  // normals out from the crown's centre: one soft volume instead of many shiny balls
  const pos = merged.attributes.position;
  const nrm = merged.attributes.normal;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i) - centre.x, (pos.getY(i) - centre.y) * 1.2, pos.getZ(i) - centre.z).normalize();
    const own = new THREE.Vector3(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
    v.lerp(own, 0.25).normalize();
    nrm.setXYZ(i, v.x, v.y, v.z);
  }
  return merged;
}

/** A trunk that tapers and leans a little, with a few branches reaching into the crown. */
function trunk(r: () => number, height: number, radius: number, branches: number) {
  const bark = new THREE.Color("#5b4632");
  const parts: THREE.BufferGeometry[] = [];
  const lean = new THREE.Vector3((r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.5);
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.3, 0),
    new THREE.Vector3(lean.x * 0.3, height * 0.4, lean.z * 0.3),
    new THREE.Vector3(lean.x, height, lean.z),
  ]);
  const tube = new THREE.TubeGeometry(path, 8, radius, 7, false);
  // taper: thinner towards the top
  const p = tube.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const t = THREE.MathUtils.clamp(y / height, 0, 1);
    const c = path.getPointAt(t);
    const k = 1 - t * 0.55 + (y < 0.4 ? (0.4 - y) * 0.6 : 0);
    p.setXYZ(i, c.x + (p.getX(i) - c.x) * k, y, c.z + (p.getZ(i) - c.z) * k);
  }
  parts.push(tube);
  for (let b = 0; b < branches; b++) {
    const a = r() * Math.PI * 2;
    const from = path.getPointAt(0.55 + r() * 0.35);
    const len = height * (0.25 + r() * 0.2);
    const to = from.clone().add(new THREE.Vector3(Math.cos(a) * len, len * 0.6, Math.sin(a) * len));
    parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([from, from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, len * 0.15, 0)), to]), 4, radius * 0.35, 5, false));
  }
  const g = mergeGeometries(parts.map((x) => x.toNonIndexed()))!;
  return paint(g, (y) => bark.clone().multiplyScalar(0.7 + 0.4 * Math.min(1, y / height)));
}

/** A pine: stacked, drooping cones of needles over a straight trunk. */
function pineCrown(r: () => number, height: number, palette: string[]) {
  const parts: THREE.BufferGeometry[] = [];
  const colours = palette.map((p) => new THREE.Color(p));
  const tiers = 5;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const radius = (1 - t) * height * 0.26 + 0.4;
    const g = welded(new THREE.ConeGeometry(radius, height * 0.32, 11, 3, true));
    const pos = g.attributes.position;
    const sd = r() * 100;
    for (let v = 0; v < pos.count; v++) {
      const k = 1 + lump(pos.getX(v), pos.getY(v), pos.getZ(v), sd) * 0.14;
      // the lower edge of each tier droops, like branches heavy with needles
      const droop = pos.getY(v) < 0 ? -0.25 * radius * 0.2 : 0;
      pos.setXYZ(v, pos.getX(v) * k, pos.getY(v) + droop, pos.getZ(v) * k);
    }
    g.computeVertexNormals();
    g.translate(0, height * (0.32 + t * 0.62), 0);
    const base = colours[i % colours.length];
    paint(g, (y) => base.clone().multiplyScalar(0.6 + 0.5 * ((y / height) % 1)));
    parts.push(g.toNonIndexed());
  }
  return mergeGeometries(parts)!;
}

/**
 * Leaves: small sprays spread over the crown's surface, each two pointed leaves of solid triangles (no cut-out
 * textures: those make the GPU shade every hidden layer). Their normals point out from the crown like the clumps', so
 * they light as part of one soft crown, while their points give it a leafy outline against the sky.
 */
function leafSprays(r: () => number, centre: THREE.Vector3, size: THREE.Vector3, count: number, palette: string[]) {
  const colours = palette.map((p) => new THREE.Color(p));
  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const sd = r() * 100;
  const out = new THREE.Vector3();
  const along = new THREE.Vector3();
  const across = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2;
    // more leaves on top and around, fewer underneath
    const u = 1 - Math.pow(r(), 0.7) * 1.7;
    const s = Math.sqrt(Math.max(0, 1 - u * u));
    out.set(Math.cos(a) * s, u, Math.sin(a) * s);
    const k = 1.0 + lump(out.x, out.y, out.z, sd) * 0.14 + r() * 0.1;
    const p = new THREE.Vector3(out.x * size.x * 0.5 * k, out.y * size.y * 0.5 * k, out.z * size.z * 0.5 * k).add(centre);
    const n = out.clone().normalize();
    const base = colours[Math.floor(r() * colours.length)].clone().multiplyScalar(0.8 + 0.45 * (0.5 + out.y * 0.5) + (r() - 0.5) * 0.18);
    const len = 0.22 + r() * 0.18;
    const spin = r() * Math.PI * 2;
    for (const turn of [-0.6, 0.55]) {
      // a leaf lies roughly across the crown's surface, pointing outward a little
      along.set(-n.z, 0, n.x);
      if (along.lengthSq() < 1e-4) along.set(1, 0, 0);
      along.normalize().applyAxisAngle(n, spin + turn);
      along.addScaledVector(n, 0.35).normalize();
      across.crossVectors(n, along).normalize();
      const w = len * 0.28;
      const pts = [
        p.clone(),
        p.clone().addScaledVector(along, len * 0.45).addScaledVector(across, w),
        p.clone().addScaledVector(along, len),
        p.clone().addScaledVector(along, len * 0.45).addScaledVector(across, -w),
        p.clone().addScaledVector(along, len * 0.5).addScaledVector(n, 0.04),
      ];
      const v0 = pos.length / 3;
      for (const q of pts) {
        pos.push(q.x, q.y, q.z);
        const nn = q.clone().sub(centre).normalize().lerp(n, 0.5).normalize();
        nrm.push(nn.x, nn.y, nn.z);
        col.push(base.r, base.g, base.b);
      }
      // a fan around the raised midrib: four faces, a little fold down the middle
      idx.push(v0 + 4, v0, v0 + 1, v0 + 4, v0 + 1, v0 + 2, v0 + 4, v0 + 2, v0 + 3, v0 + 4, v0 + 3, v0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

/** Geometry for one kind of tree, in two parts so trunk and leaves get their own material. */
export function treeGeometry(kind: Kind, seed: number, near = true) {
  const r = rng(seed);
  if (kind === "pine") {
    const h = 9;
    return { wood: trunk(r, h * 0.5, 0.22, 0), leaves: pineCrown(r, h, LEAVES.pine), cards: null, crownBase: h * 0.25 };
  }
  const h = kind === "tall" ? 7.5 : 3.6;
  const size = kind === "tall" ? new THREE.Vector3(2.4, 4, 2.4) : new THREE.Vector3(3.2, 2.4, 3.2);
  const centre = new THREE.Vector3(0, h + size.y * 0.45, 0);
  // the solid crown sits a little inside the cards and a shade darker: the shadowed inner leaves
  const inner = LEAVES[kind].map((c) => "#" + new THREE.Color(c).multiplyScalar(0.55).getHexString());
  return {
    wood: trunk(r, h + size.y * 0.3, kind === "tall" ? 0.28 : 0.32, kind === "tall" ? 3 : 4),
    leaves: crown(r, centre, size.clone().multiplyScalar(0.7), kind === "tall" ? 9 : 11, inner),
    cards: leafSprays(r, centre, size, (kind === "tall" ? 300 : 380) * (near ? 1 : 0.2), LEAVES[kind]),
    crownBase: h * 0.6,
  };
}

/**
 * Scatter `count` points over an area with a minimum spacing, keeping only those `accept` allows (a rough Poisson
 * disc by rejection: enough for a forest that never stacks two trees in one spot).
 */
export function scatter(seed: number, count: number, box: [number, number, number, number], spacing: number, accept: (x: number, z: number, r: () => number) => boolean) {
  const r = rng(seed);
  const out: [number, number][] = [];
  const cell = spacing;
  const grid = new Map<string, [number, number][]>();
  const key = (x: number, z: number) => `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
  let tries = 0;
  while (out.length < count && tries < count * 40) {
    tries++;
    const x = box[0] + r() * (box[2] - box[0]);
    const z = box[1] + r() * (box[3] - box[1]);
    if (!accept(x, z, r)) continue;
    let close = false;
    for (let i = -1; i <= 1 && !close; i++)
      for (let j = -1; j <= 1 && !close; j++)
        for (const [px, pz] of grid.get(`${Math.floor(x / cell) + i},${Math.floor(z / cell) + j}`) ?? [])
          if ((px - x) ** 2 + (pz - z) ** 2 < spacing * spacing) close = true;
    if (close) continue;
    out.push([x, z]);
    const k = key(x, z);
    grid.set(k, [...(grid.get(k) ?? []), [x, z]]);
  }
  return out;
}
