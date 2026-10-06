"use client";

/**
 * The tunnel and its Y-fork (ch. 3, 6, 9, 10, 18). A sloped tunnel, "lit just enough that it was possible to
 * comfortably see and read", runs down from a portal in the hillside to a hall where it splits in two. Left, under
 * silver-blue light, black cars stop in a row and their cabins are swapped before they drive on: Cash. Right, under
 * gold, a sealed booth of foil with a private AI glowing inside: Zinc. Two lit lines run side by side down the
 * walkway and part at the fork, one to each way, each ending at its own green circle.
 */
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { barkMaterial, foliageMaterial, groundMaterial, stoneMaterial, weather } from "../kit/materials";
import { fbm, rng, simplex2, smoothstep } from "../kit/noise";
import { scatter, treeGeometry, type Kind } from "../kit/vegetation";
import { Booth } from "./tunnel/booth";
import {
  acrossBay,
  at,
  bake,
  bay,
  ENTRANCE,
  facingBack,
  floorY,
  gridGeometry,
  inside,
  ribGeometry,
  wallGeometry,
  type Lamp,
  underground,
  vault,
} from "./tunnel/plan";
import { GreenCircle, Poster, Sign } from "./tunnel/signs";
import { CabinSwap, CARS, FIRST, GAP, makeRoad, ROAD_U } from "./tunnel/swap";
import type { SetModule } from "./types";

const WARM = new THREE.Color("#ffc58a");
const COOL = new THREE.Color("#9cc0ff");
const GOLD = new THREE.Color("#ffc35a");

const main = bay("main");
const left = bay("left");
const right = bay("right");
const court = bay("court");

/** where the booth stands in the court, and the two green circles */
const BOOTH_S = 22;
const CASH_SPOT = { s: 7, u: 3.5 };
const ZINC_SPOT = { s: 6, u: 0 };

type Fixture = Lamp & { fixture: boolean };

/** Every lamp: the ones baked into the stone, and those with a fitting the eye can see. */
function useLamps() {
  return useMemo(() => {
    const lamps: Fixture[] = [];
    const add = (p: THREE.Vector3, colour: THREE.Color, reach: number, strength: number, fixture = true) =>
      lamps.push({ p, colour, reach, strength, fixture });
    for (let z = 48; z < ENTRANCE - 4; z += 14)
      for (const x of [-6.25, 6.25]) add(new THREE.Vector3(x, floorY(z) + 3.9, z + (x > 0 ? 7 : 0)), WARM, 10, 1.1);
    for (const z of [8, 22, 34]) {
      add(new THREE.Vector3(-13.75, floorY(z) + 3.9, z), WARM, 11, 0.8);
      add(new THREE.Vector3(11.75, floorY(z) + 3.9, z), WARM, 11, 0.8);
    }
    add(new THREE.Vector3(-1, floorY(11) + 6.4, 11), WARM, 20, 0.4, false);
    add(new THREE.Vector3(-0.1, 4.25, -5.75), WARM, 7, 0.9);
    // the left way: cool light from the rails over the row, then sparser lamps on into the dark
    for (let k = 0; k < CARS; k++) add(at(left, FIRST + k * GAP, ROAD_U, 5.4), COOL, 8, 0.7, false);
    for (let s = 76; s < 150; s += 14) add(at(left, s, -4.95, 3.9), COOL, 7, 0.5);
    for (const s of [6, 32]) add(at(left, s, 4.95, 3.9), COOL, 8, 0.7);
    // the right way: gold
    for (const s of [3, 12]) for (const u of [-4.25, 4.25]) add(at(right, s, u, 3.9), GOLD, 8, 0.85);
    for (const s of [14, 29]) for (const u of [-8.25, 8.25]) add(at(court, s, u, 3.9), GOLD, 9, 1.0);
    return lamps;
  }, []);
}

/** A strip laid along a curve (a road, a lit line, a curb top), `half` wide each side, `lift` above the floor. */
function ribbon(curve: THREE.Curve<THREE.Vector3>, length: number, half: (k: number) => number, lift: number, lamps?: Lamp[], step = 0.8) {
  const n = Math.max(2, Math.ceil(length / step));
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const p = new THREE.Vector3();
  const t = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    curve.getPointAt(k, p);
    curve.getTangentAt(k, t);
    const sx = -t.z;
    const sz = t.x;
    const l = Math.hypot(sx, sz) || 1;
    for (const side of [-1, 1]) {
      const x = p.x + (sx / l) * half(k) * side;
      const z = p.z + (sz / l) * half(k) * side;
      pos.push(x, floorY(z) + lift, z);
      if (lamps) bake(lamps, new THREE.Vector3(x, floorY(z), z), c);
      else c.setRGB(1, 1, 1);
      col.push(c.r, c.g, c.b);
    }
    if (i < n) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // the floor faces up, whichever way the curve runs
  if (g.attributes.normal.getY(0) < 0) {
    const flipped = Array.from(g.index!.array);
    for (let i = 0; i < flipped.length; i += 3) [flipped[i + 1], flipped[i + 2]] = [flipped[i + 2], flipped[i + 1]];
    g.setIndex(flipped);
    g.computeVertexNormals();
  }
  return g;
}

/** The shell: walls, floor and vault of laid stone, ribs along the ways, and a framed arch at each mouth. */
function Shell({ lamps }: { lamps: Lamp[] }) {
  const geometry = useMemo(
    () => ({
      walls: wallGeometry(lamps),
      floor: gridGeometry(lamps, 0.8, false),
      vault: gridGeometry(lamps, 0.6, true),
    }),
    [lamps],
  );
  const mats = useMemo(() => {
    const wall = stoneMaterial({
      a: "#a3a19a",
      b: "#7a776f",
      mortar: "#45423d",
      brick: [1.25, 0.52],
      moss: 0.12,
    });
    wall.vertexColors = true;
    const vault = stoneMaterial({
      a: "#97948c",
      b: "#74716a",
      mortar: "#45423d",
      brick: [1.1, 0.48],
      moss: 0,
    });
    vault.vertexColors = true;
    const floor = stoneMaterial({
      a: "#b0aca2",
      b: "#8f8b81",
      mortar: "#57534b",
      brick: [1.3, 0.85],
      moss: 0.05,
    });
    floor.vertexColors = true;
    const rib = stoneMaterial({
      a: "#b4aea2",
      b: "#8c877c",
      mortar: "#45423d",
      brick: [0.6, 0.5],
      moss: 0.08,
    });
    return { wall, vault, floor, rib };
  }, []);
  // ribs every few metres along each way; each takes the light baked at its crown
  const ribs = useMemo(() => {
    const list: { w: number; m: THREE.Matrix4; c: THREE.Color }[] = [];
    const push = (b: typeof main, s: number) =>
      list.push({
        w: b.w,
        m: acrossBay(b, s),
        c: bake(lamps, at(b, s, 0, 6)).multiplyScalar(0.95),
      });
    for (let s = 46; s < ENTRANCE - 3; s += 9) push(main, s);
    for (let s = 14; s < 148; s += 9) push(left, s);
    push(right, 12);
    const groups = new Map<number, typeof list>();
    for (const r of list) groups.set(r.w, [...(groups.get(r.w) ?? []), r]);
    return [...groups].map(([w, items]) => ({
      geometry: ribGeometry(w, 0.32, 0.7),
      items,
    }));
  }, [lamps]);
  const mouths = useMemo(
    () =>
      [
        { b: left, colour: COOL },
        { b: right, colour: GOLD },
      ].map(({ b, colour }) => ({
        frame: ribGeometry(b.w, 0.55, 1.2),
        band: ribGeometry(b.w, 0.55, 1.26, 0.13),
        m: acrossBay(b, 3.2),
        colour,
      })),
    [],
  );
  return (
    <group>
      <mesh geometry={geometry.walls} material={mats.wall} />
      <mesh geometry={geometry.floor} material={mats.floor} />
      <mesh geometry={geometry.vault} material={mats.vault} />
      {ribs.map(({ geometry: g, items }, i) => (
        <instancedMesh
          key={i}
          args={[g, mats.rib, items.length]}
          receiveShadow
          ref={(mesh) => {
            if (!mesh) return;
            items.forEach((r, k) => {
              mesh.setMatrixAt(k, r.m);
              mesh.setColorAt(k, r.c);
            });
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
          }}
        />
      ))}
      {mouths.map(({ frame, band, m, colour }, i) => (
        <group key={i} matrix={m} matrixAutoUpdate={false}>
          <mesh geometry={frame} material={mats.rib} receiveShadow />
          <mesh geometry={band}>
            <meshStandardMaterial
              color={colour}
              emissive={colour}
              emissiveIntensity={0.45}
              metalness={0.6}
              roughness={0.35}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** The road the cars drive (dark setts), its curbs, the stop bays of the swap, and the two lit lines of the walkway. */
function Road({ lamps }: { lamps: Lamp[] }) {
  const { road, length, along } = useMemo(() => makeRoad(), []);
  const parts = useMemo(() => {
    const branchAt = along(0) / length;
    const half = (k: number) => 3 + 0.5 * smoothstep(branchAt - 0.04, branchAt, k);
    const surface = ribbon(road, length, half, 0.025, lamps);
    // curbs: a narrow raised edge along each side of the road
    const curbs = [-1, 1].map((side) => {
      const p = new THREE.Vector3();
      const t = new THREE.Vector3();
      const count = Math.ceil(length / 1.5);
      const points = Array.from({ length: count + 1 }, (_, i) => {
        const k = i / count;
        road.getPointAt(k, p);
        road.getTangentAt(k, t);
        const l = Math.hypot(t.x, t.z) || 1;
        const w = half(k) + 0.14;
        return new THREE.Vector3(p.x - (t.z / l) * w * side, p.y, p.z + (t.x / l) * w * side);
      });
      const edge = new THREE.CatmullRomCurve3(points);
      return ribbon(edge, length, () => 0.16, 0.13, lamps, 1.2);
    });
    // the stop bays: a cool line across the road between cars
    const bays: THREE.BufferGeometry[] = [];
    for (let k = 0; k <= CARS; k++) {
      const g = new THREE.PlaneGeometry(6.4, 0.12);
      g.rotateX(Math.PI / 2);
      g.applyMatrix4(acrossBay(left, FIRST + (k - 0.5) * GAP, ROAD_U, 0.035));
      bays.push(g.toNonIndexed());
    }
    const bayGeometry = new THREE.BufferGeometry();
    bayGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        bays.flatMap((b) => Array.from(b.attributes.position.array)),
        3,
      ),
    );
    bayGeometry.computeVertexNormals();
    // the two lines: side by side down the walkway, then one to each way's circle and on
    const v = (x: number, z: number) => new THREE.Vector3(x, floorY(z), z);
    const blue = new THREE.CatmullRomCurve3(
      [v(2.2, 124), v(2.2, 40), v(1.2, 16), at(left, -1, CASH_SPOT.u), at(left, CASH_SPOT.s, CASH_SPOT.u), at(left, 70, CASH_SPOT.u)],
      false,
      "centripetal",
    );
    const gold = new THREE.CatmullRomCurve3(
      [v(3.2, 124), v(3.2, 40), v(4.2, 16), at(right, -1, ZINC_SPOT.u), at(right, ZINC_SPOT.s, ZINC_SPOT.u), at(court, BOOTH_S - 4.6, 0)],
      false,
      "centripetal",
    );
    const line = (c: THREE.CatmullRomCurve3) => ribbon(c, c.getLength(), () => 0.065, 0.03, undefined, 0.6);
    return {
      surface,
      curbs,
      bays: bayGeometry,
      blue: line(blue),
      gold: line(gold),
    };
  }, [road, length, along, lamps]);
  const mats = useMemo(() => {
    const setts = stoneMaterial({
      a: "#4a4846",
      b: "#33312f",
      mortar: "#1d1c1a",
      brick: [0.34, 0.24],
      moss: 0,
    });
    setts.vertexColors = true;
    const curb = stoneMaterial({
      a: "#c9c0ae",
      b: "#a79e8c",
      mortar: "#6a6355",
      brick: [1.2, 0.5],
      moss: 0,
    });
    curb.vertexColors = true;
    return { setts, curb };
  }, []);
  return (
    <group>
      <mesh geometry={parts.surface} material={mats.setts} receiveShadow />
      {parts.curbs.map((g, i) => (
        <mesh key={i} geometry={g} material={mats.curb} receiveShadow />
      ))}
      <mesh geometry={parts.bays}>
        <meshStandardMaterial color="#b9cde6" roughness={0.5} polygonOffset polygonOffsetFactor={-2} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={parts.blue}>
        <meshBasicMaterial color={COOL.clone().multiplyScalar(1.3)} toneMapped={false} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
      <mesh geometry={parts.gold}>
        <meshBasicMaterial color={GOLD.clone().multiplyScalar(1.3)} toneMapped={false} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
    </group>
  );
}

/** The lamp fittings: small lanterns of dark iron with a glowing pane, in their way's colour. */
function Fittings({ lamps }: { lamps: Fixture[] }) {
  const shown = useMemo(() => lamps.filter((l) => l.fixture), [lamps]);
  const parts = useMemo(() => {
    const box = (w: number, h: number, d: number, y: number) => new THREE.BoxGeometry(w, h, d).translate(0, y, 0).toNonIndexed();
    const iron = mergeGeometries([
      box(0.4, 0.07, 0.4, 0.22),
      box(0.3, 0.05, 0.3, 0.28),
      box(0.36, 0.06, 0.36, -0.2),
      box(0.05, 0.42, 0.05, 0.0).translate(0.16, 0, 0.16),
      box(0.05, 0.42, 0.05, 0).translate(-0.16, 0, 0.16),
      box(0.05, 0.42, 0.05, 0).translate(0.16, 0, -0.16),
      box(0.05, 0.42, 0.05, 0).translate(-0.16, 0, -0.16),
    ]);
    return { iron, glass: new THREE.BoxGeometry(0.28, 0.36, 0.28) };
  }, []);
  const fill = (glow: boolean) => (mesh: THREE.InstancedMesh | null) => {
    if (!mesh) return;
    const m = new THREE.Matrix4();
    shown.forEach((l, i) => {
      mesh.setMatrixAt(i, m.makeTranslation(l.p.x, l.p.y, l.p.z));
      if (glow) mesh.setColorAt(i, l.colour.clone().multiplyScalar(1.5));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };
  return (
    <>
      <instancedMesh args={[parts.iron, undefined, shown.length]} ref={fill(false)}>
        <meshStandardMaterial color="#26221e" metalness={0.6} roughness={0.5} />
      </instancedMesh>
      <instancedMesh args={[parts.glass, undefined, shown.length]} ref={fill(true)}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </>
  );
}

/** the stone face the portal is cut in: its front, depth and height */
const FACE = { front: ENTRANCE + 1.6, depth: 10, half: 30, height: 15 };

/** One kind of tree on the ridge, instanced. */
function Trees({
  kind,
  spots,
  seed,
  height,
}: {
  kind: Kind;
  spots: [number, number][];
  seed: number;
  height: (x: number, z: number) => number;
}) {
  const tree = useMemo(() => treeGeometry(kind, seed, false), [kind, seed]);
  const mats = useMemo(
    () => ({ wood: barkMaterial(), leaves: foliageMaterial(tree.crownBase), cards: foliageMaterial(tree.crownBase, true) }),
    [tree],
  );
  const fill = (mesh: THREE.InstancedMesh | null) => {
    if (!mesh) return;
    const r = rng(seed);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    spots.forEach(([x, z], i) => {
      const k = 1.1 + r() * 0.7;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI * 2);
      m.compose(new THREE.Vector3(x, height(x, z) - 0.3, z), q, new THREE.Vector3(k, k * (0.9 + r() * 0.3), k));
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  return (
    <>
      <instancedMesh args={[tree.wood, mats.wood, spots.length]} ref={fill} castShadow />
      <instancedMesh args={[tree.leaves, mats.leaves, spots.length]} ref={fill} castShadow />
      {tree.cards && <instancedMesh args={[tree.cards, mats.cards, spots.length]} ref={fill} />}
    </>
  );
}

/** Outside: the wooded ridge the tunnel runs under, and the stone face with the portal where the walk comes in. */
function Hillside() {
  const n = useMemo(() => simplex2(33), []);
  const height = useMemo(() => {
    return (x: number, z: number) => {
      // a ridge over the whole tunnel, cut open in front of the portal, the cut rising to meet the face's ends
      const ridge = smoothstep(60, 12, inside(x, z));
      const cut = 1 - (1 - smoothstep(10, FACE.half + 4, Math.abs(x))) * smoothstep(FACE.front - FACE.depth + 1, FACE.front - 3, z);
      // the hill meets the top of the face, and rises behind it
      const rise = FACE.height - 1 + 12 * smoothstep(FACE.front - FACE.depth, FACE.front - FACE.depth - 35, z);
      const lumps = fbm(n, x / 40, z / 40, 4);
      const flat = smoothstep(5, 16, Math.abs(x + 1)) + (1 - smoothstep(FACE.front, FACE.front + 3, z));
      return floorY(ENTRANCE) - 0.08 + (rise + lumps * 5) * ridge * cut + lumps * 1.5 * Math.min(flat, 1);
    };
  }, [n]);
  const ground = useMemo(() => {
    const size: [number, number, number, number] = [-150, -200, 110, 300];
    const step = 2.5;
    const nx = Math.round((size[2] - size[0]) / step);
    const nz = Math.round((size[3] - size[1]) / step);
    const g = new THREE.PlaneGeometry(size[2] - size[0], size[3] - size[1], nx, nz);
    g.rotateX(-Math.PI / 2);
    g.translate((size[0] + size[2]) / 2, 0, (size[1] + size[3]) / 2);
    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const meadow = new THREE.Color("#5b8740");
    const lush = new THREE.Color("#3f6a30");
    const dry = new THREE.Color("#a99e66");
    const soil = new THREE.Color("#6a5a40");
    const path = new THREE.Color("#b49d76");
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = height(x, z);
      pos.setY(i, h);
      const lumps = fbm(n, x / 40, z / 40, 4);
      c.copy(meadow)
        .lerp(lush, smoothstep(-0.2, 0.5, lumps))
        .lerp(dry, smoothstep(0.3, 0.7, fbm(n, x / 25 + 9, z / 25, 2)) * 0.5);
      const slope = Math.abs(height(x + 1, z) - height(x - 1, z)) + Math.abs(height(x, z + 1) - height(x, z - 1));
      c.lerp(soil, smoothstep(0.8, 2.2, slope) * 0.7);
      // the walkway beside the road, worn into the grass on the way in
      if (z > FACE.front) c.lerp(path, 1 - smoothstep(3.5, 6, Math.abs(x - 3.2)));
      colors.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    // the face stands where the ground would cross the portal: no ground inside it
    const index = g.index!.array;
    const keep: number[] = [];
    for (let i = 0; i < index.length; i += 3) {
      const tri = [index[i], index[i + 1], index[i + 2]];
      const hidden = tri.every(
        (k) => Math.abs(pos.getX(k)) < FACE.half + 2.6 && pos.getZ(k) > FACE.front - FACE.depth - 2.6 && pos.getZ(k) < FACE.front + 0.2,
      );
      if (!hidden) keep.push(...tri);
    }
    g.setIndex(keep);
    g.computeVertexNormals();
    return g;
  }, [n, height]);
  const face = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-FACE.half, -1.5);
    s.lineTo(-FACE.half, FACE.height);
    s.lineTo(FACE.half, FACE.height);
    s.lineTo(FACE.half, -1.5);
    s.lineTo(-FACE.half, -1.5);
    // the opening, a little wider than the tunnel so the tunnel's own walls show through it
    const hole = new THREE.Path();
    const w = main.w + 0.1;
    hole.moveTo(-w, -1);
    for (let i = 0; i <= 32; i++) {
      const u = -w + (2 * w * i) / 32;
      hole.lineTo(u, 0.1 + vault(w - Math.abs(u)));
    }
    hole.lineTo(w, -1);
    hole.lineTo(-w, -1);
    s.holes.push(hole);
    return new THREE.ExtrudeGeometry(s, { depth: FACE.depth, bevelEnabled: false, curveSegments: 1 });
  }, []);
  const ring = useMemo(() => ribGeometry(main.w, -1.3, 1.6, 1.3), []);
  const trees = useMemo(() => {
    const ok = (x: number, z: number) =>
      smoothstep(60, 12, inside(x, z)) > 0.55 && z > -60 && !(Math.abs(x) < FACE.half + 6 && z > FACE.front - 16);
    return {
      broadleaf: scatter(61, 70, [-110, -60, 90, 160], 7, (x, z) => ok(x, z)),
      pine: scatter(62, 40, [-110, -60, 90, 160], 8, (x, z) => ok(x, z)),
    };
  }, []);
  const mats = useMemo(
    () => ({
      ground: groundMaterial(),
      face: stoneMaterial({ a: "#c2b49a", b: "#978a74", brick: [1.2, 0.55], moss: 0.6 }),
      ring: stoneMaterial({ a: "#d0c3a8", b: "#ab9d84", brick: [0.5, 0.9], moss: 0.3 }),
    }),
    [],
  );
  const y = floorY(ENTRANCE);
  return (
    <group>
      <mesh geometry={ground} material={mats.ground} receiveShadow castShadow />
      <mesh geometry={face} material={mats.face} position={[0, y, FACE.front - FACE.depth]} castShadow receiveShadow />
      {/* the coping along the top of the face, and the arch of dressed stones round the opening */}
      <mesh material={mats.ring} position={[0, y + FACE.height + 0.3, FACE.front - FACE.depth / 2 + 0.2]} castShadow receiveShadow>
        <boxGeometry args={[FACE.half * 2 + 0.8, 0.6, FACE.depth + 0.8]} />
      </mesh>
      <mesh geometry={ring} material={mats.ring} position={[0, y, FACE.front + 0.5]} castShadow receiveShadow />
      {[-1, 1].map((k) => (
        <group key={k} position={[k * 9.5, y, FACE.front + 1.6]}>
          <mesh position={[0, 1.4, 0]} castShadow>
            <cylinderGeometry args={[0.09, 0.12, 2.8, 8]} />
            <meshStandardMaterial color="#3b2c1f" roughness={0.9} />
          </mesh>
          <mesh position={[0, 2.95, 0]}>
            <boxGeometry args={[0.36, 0.44, 0.36]} />
            <meshBasicMaterial color={WARM.clone().multiplyScalar(2.4)} toneMapped={false} />
          </mesh>
        </group>
      ))}
      <Trees kind="broadleaf" spots={trees.broadleaf} seed={71} height={height} />
      <Trees kind="pine" spots={trees.pine} seed={72} height={height} />
    </group>
  );
}

const MOTES = 420;
/** where the hall's lantern hangs */
const LANTERN_Z = 11;

/** The hall's lantern on its chain, swaying a little, and dust drifting through the lamplight. */
function HallAir() {
  const lantern = useRef<THREE.Group>(null);
  const top = floorY(LANTERN_Z) + 8.6;
  const dust = useMemo(() => {
    const r = rng(9);
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(MOTES * 3);
    const seed = new Float32Array(MOTES);
    for (let i = 0; i < MOTES; i++) {
      const z = -4 + r() * 42;
      pos.set([-12 + r() * 22, floorY(z) + 0.4 + r() * 6.5, z], i * 3);
      seed[i] = r();
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: weather.time },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uTime;
        varying float vA;
        void main() {
          vec3 p = position;
          float t = uTime * (0.05 + aSeed * 0.06);
          p += vec3(sin(t * 3.0 + aSeed * 50.0), sin(t * 2.0 + aSeed * 20.0) * 0.6, cos(t * 2.5 + aSeed * 30.0)) * 0.9;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          // motes are faint low down, and fade out close to the eye so none passes the lens as a blur
          vA = (0.35 + 0.65 * aSeed) * smoothstep(0.0, 3.0, p.y) * (0.6 + 0.4 * sin(uTime * 0.7 + aSeed * 12.0));
          vA *= smoothstep(3.0, 9.0, -mv.z);
          gl_PointSize = (0.8 + aSeed * 1.0) * (30.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          gl_FragColor = vec4(vec3(1.0, 0.86, 0.66) * 0.4, smoothstep(0.5, 0.1, d) * vA);
        }`,
    });
    return { g, m };
  }, []);
  useFrame(() => {
    const t = weather.time.value;
    if (lantern.current) {
      lantern.current.rotation.z = Math.sin(t * 0.6) * 0.025;
      lantern.current.rotation.x = Math.sin(t * 0.43 + 1) * 0.02;
    }
  });
  return (
    <>
      <group ref={lantern} position={[-1, top, LANTERN_Z]}>
        <mesh position={[0, -0.6, 0]}>
          <cylinderGeometry args={[0.025, 0.025, 1.2, 5]} />
          <meshStandardMaterial color="#26221e" metalness={0.6} roughness={0.5} />
        </mesh>
        <mesh position={[0, -1.3, 0]}>
          <cylinderGeometry args={[0.12, 0.45, 0.3, 8]} />
          <meshStandardMaterial color="#26221e" metalness={0.6} roughness={0.5} />
        </mesh>
        <mesh position={[0, -1.85, 0]}>
          <cylinderGeometry args={[0.36, 0.3, 0.8, 8]} />
          <meshBasicMaterial color={WARM.clone().multiplyScalar(2.2)} toneMapped={false} />
        </mesh>
        <mesh position={[0, -2.3, 0]}>
          <cylinderGeometry args={[0.32, 0.12, 0.14, 8]} />
          <meshStandardMaterial color="#26221e" metalness={0.6} roughness={0.5} />
        </mesh>
      </group>
      <points geometry={dust.g} material={dust.m} frustumCulled={false} />
    </>
  );
}

function Tunnel() {
  const lamps = useLamps();
  const nose = useMemo(() => new THREE.Vector3(-0.1, 2.25, -5.93), []);
  const below = useRef<THREE.Group>(null);
  // everything under the hill is lit by its lamps alone
  useLayoutEffect(() => {
    const done = new Set<THREE.Material>();
    below.current?.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      for (const mat of Array.isArray(m) ? m : m ? [m] : []) {
        if (done.has(mat)) continue;
        done.add(mat);
        underground(mat);
        mat.needsUpdate = true;
      }
    });
  }, []);
  return (
    <group>
      <Hillside />
      <group ref={below}>
        <Shell lamps={lamps} />
        <Road lamps={lamps} />
        <Fittings lamps={lamps} />
        <HallAir />

        {/* the fork: the poster on the nose, a sign over each mouth, a green circle in each */}
        <group position={nose}>
          <Poster />
        </group>
        <group position={at(left, 0.6, 0, 6.3)} rotation-y={facingBack(left)}>
          <Sign kind="cash" />
        </group>
        <group position={at(right, 0.6, 0, 6.3)} rotation-y={facingBack(right)}>
          <Sign kind="zinc" />
        </group>
        <group position={at(left, CASH_SPOT.s, CASH_SPOT.u)} scale={1.25}>
          <GreenCircle />
        </group>
        <group position={at(right, ZINC_SPOT.s, ZINC_SPOT.u)} scale={1.25}>
          <GreenCircle phase={1.3} />
        </group>

        {/* left: the cabin swap */}
        <CabinSwap cool={COOL} />
        {/* right: the booth in its court, and a gold lamp over the court so its foil catches light */}
        <pointLight position={at(court, BOOTH_S - 8, 0, 5.5)} color={GOLD} intensity={18} distance={14} decay={1.5} />
        <group position={at(court, BOOTH_S, 0)} rotation-y={facingBack(court)}>
          <Booth />
        </group>

        {/* the few real lights: the hall's lantern, the poster's lamp, the cool rails, the gold mouth */}
        <pointLight position={[-1, floorY(LANTERN_Z) + 6.4, LANTERN_Z]} color={WARM} intensity={22} distance={30} decay={1.5} />
        <pointLight position={nose.clone().add(new THREE.Vector3(0, 2, 0.6))} color={WARM} intensity={8} distance={6} decay={1.6} />
        <pointLight position={at(left, 18, ROAD_U, 5)} color={COOL} intensity={45} distance={20} decay={1.5} />
        <pointLight position={at(left, 46, ROAD_U, 5)} color={COOL} intensity={40} distance={20} decay={1.5} />
        <pointLight position={at(right, 6, 0, 4.2)} color={GOLD} intensity={30} distance={14} decay={1.6} />
      </group>
    </group>
  );
}

/** Stop 5: the fork. Left is Cash, right is Zinc. */
export const tunnelSet: SetModule = {
  id: "tunnel",
  origin: [0, 0, -2100],
  hour: 17.5,
  poses: {
    arrive: { position: [1.5, floorY(64) + 3.8, 64], target: [0, 1.6, -6] },
    fork: { position: [0.6, floorY(29) + 3.2, 29], target: [6.2, 1.6, -10] },
  },
  Scene: Tunnel,
};
