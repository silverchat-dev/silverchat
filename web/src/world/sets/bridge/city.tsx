"use client";

/**
 * What lies around and beyond the bridge: the tree-covered mountain with its fifteen-storey apartments shaped like
 * oversized castle towers (ch. 1), the woods on the banks, and far ranges closing the view.
 */
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { barkMaterial, foliageMaterial, grassMaterial } from "../../kit/materials";
import { fbm, rng, simplex2 } from "../../kit/noise";
import { bladeGeometry, scatter, treeGeometry, type Kind } from "../../kit/vegetation";
import { SPUR, STAIR, height, pathX } from "./land";

/** One storey of a tower's face: plaster with two tall windows, repeated around and up the tower. */
function facadeTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f2ede2";
  g.fillRect(0, 0, 128, 64);
  g.fillStyle = "#d9d2c3";
  g.fillRect(0, 58, 128, 6);
  for (const x of [22, 78]) {
    g.fillStyle = "#e4dccb";
    g.fillRect(x - 4, 10, 36, 44);
    g.fillStyle = "#33465a";
    g.fillRect(x, 14, 28, 36);
    g.fillStyle = "#4e6680";
    g.fillRect(x, 14, 28, 10);
    g.fillStyle = "#e4dccb";
    g.fillRect(x + 12, 14, 4, 36);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(9, 15);
  t.anisotropy = 8;
  return t;
}

const STOREYS = 15;
const STOREY = 3.1;

/** The apartment towers on the mountain: round, fifteen storeys, each crowned with a corbelled ring and a tall roof. */
export function CastleApartments() {
  const spots = useMemo(() => {
    const r = rng(15);
    // scattered over the slopes that face the bridge, at every height, never in a row
    return scatter(15, 11, [45, -270, 180, -105], 30, (x, z) => {
      const y = height(x, z);
      return y > 12 && y < 80 && Math.hypot(x - SPUR.x, z - SPUR.z) > 60;
    }).map(([x, z]) => ({ x, z, rad: 4.6 + r() * 2.6, y: height(x, z) - 3, turret: r() < 0.6, turn: r() * 6.28 }));
  }, []);
  const map = useMemo(() => facadeTexture(), []);
  const body = useRef<THREE.InstancedMesh>(null);
  const crown = useRef<THREE.InstancedMesh>(null);
  const roof = useRef<THREE.InstancedMesh>(null);
  const H = STOREYS * STOREY;
  useLayoutEffect(() => {
    const r = rng(16);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    let i = 0;
    const put = (x: number, y: number, z: number, rad: number, h: number, wall: string, rim: string, cap: string, tall: number) => {
      q.setFromAxisAngle(up, r() * 6.28);
      m.compose(new THREE.Vector3(x, y + h / 2, z), q, new THREE.Vector3(rad, h, rad));
      body.current!.setMatrixAt(i, m);
      body.current!.setColorAt(i, c.set(wall));
      m.compose(new THREE.Vector3(x, y + h + 1.1 * (rad / 6), z), q, new THREE.Vector3(rad * 1.14, 2.2 * (rad / 6), rad * 1.14));
      crown.current!.setMatrixAt(i, m);
      crown.current!.setColorAt(i, c.set(rim));
      const rh = rad * 1.16 * tall;
      m.compose(new THREE.Vector3(x, y + h + 2.2 * (rad / 6) + rh / 2, z), q, new THREE.Vector3(rad * 1.2, rh, rad * 1.2));
      roof.current!.setMatrixAt(i, m);
      roof.current!.setColorAt(i, c.set(cap));
      i++;
    };
    const walls = ["#f1e6d0", "#d6e3ec", "#e3e0da", "#ecdcc4", "#cfdde3"];
    const rims = ["#d8cbb0", "#c7cfd2", "#cdc4b6"];
    const caps = ["#4f6378", "#a8553a", "#5f8a80", "#4f6378", "#8e4a35"];
    spots.forEach((s, k) => {
      put(s.x, s.y, s.z, s.rad, H, walls[k % 5], rims[k % 3], caps[k % 5], 1.4 + r() * 0.7);
      // a slimmer turret clinging to one side, rising past the crown like a castle's stair tower
      if (s.turret) {
        const tr = s.rad * 0.38;
        const tx = s.x + Math.cos(s.turn) * (s.rad + tr * 0.4);
        const tz = s.z + Math.sin(s.turn) * (s.rad + tr * 0.4);
        put(tx, s.y + H * 0.45, tz, tr, H * 0.62, walls[(k + 2) % 5], rims[k % 3], caps[(k + 1) % 5], 2.2);
      }
    });
    for (const mesh of [body, crown, roof]) {
      mesh.current!.count = i;
      mesh.current!.instanceMatrix.needsUpdate = true;
      mesh.current!.instanceColor!.needsUpdate = true;
    }
  }, [spots, H]);
  const n = spots.length * 2;
  return (
    <>
      <instancedMesh ref={body} args={[undefined, undefined, n]} castShadow receiveShadow>
        <cylinderGeometry args={[1, 1, 1, 28, 1, true]} />
        <meshStandardMaterial map={map} roughness={0.85} />
      </instancedMesh>
      <instancedMesh ref={crown} args={[undefined, undefined, n]} castShadow receiveShadow>
        <cylinderGeometry args={[1, 0.88, 1, 28]} />
        <meshStandardMaterial roughness={0.85} />
      </instancedMesh>
      <instancedMesh ref={roof} args={[undefined, undefined, n]} castShadow>
        <coneGeometry args={[1, 1, 28]} />
        <meshStandardMaterial roughness={0.7} />
      </instancedMesh>
    </>
  );
}

const paint = (g: THREE.BufferGeometry, f: (y: number) => THREE.Color) => {
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) col.set(f(p.getY(i)).toArray(), i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
};

/**
 * A far crown: a few lumps of leaves grown together (or a cone for a pine), cheap enough to cover a mountain. Drawn
 * close together, they merge into one rolling canopy.
 */
function farCrown(pine: boolean) {
  if (pine) {
    const g = new THREE.ConeGeometry(1, 2.8, 7, 2);
    g.translate(0, 1.4, 0);
    const lo = new THREE.Color("#183d24");
    const hi = new THREE.Color("#2f5f36");
    return paint(g, (y) => lo.clone().lerp(hi, y / 2.8));
  }
  const n = simplex2(5);
  const lumps = [
    [0, 0.9, 0, 1],
    [0.6, 0.65, 0.25, 0.78],
  ].map(([x, y, z, k]) => {
    const g = mergeVertices(new THREE.IcosahedronGeometry(k, 1).deleteAttribute("normal").deleteAttribute("uv"));
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const f = 1 + 0.16 * n(p.getX(i) * 2 + p.getZ(i) + x * 5, p.getY(i) * 2 + z * 5);
      p.setXYZ(i, p.getX(i) * f + x, p.getY(i) * f * 0.85 + y, p.getZ(i) * f + z);
    }
    g.computeVertexNormals();
    return g;
  });
  const g = mergeGeometries(lumps)!;
  const lo = new THREE.Color("#1f4220");
  const hi = new THREE.Color("#5c8a3a");
  return paint(g, (y) => lo.clone().lerp(hi, THREE.MathUtils.clamp((y - 0.1) / 1.8, 0, 1)));
}

/** True where a tree may stand: off the road's cutting, the path, the bridge, the stairs and the tower's top. */
export function wooded(x: number, z: number) {
  if (Math.abs(z) < 17) return false;
  if (z > 20 && Math.abs(x - pathX(z)) < 8) return false;
  if (Math.abs(x - STAIR.x) < 8 && z < -18 && z > STAIR.z1 - 4) return false;
  if (Math.hypot(x - SPUR.x, z - SPUR.z) < SPUR.plateau + 5) return false;
  return true;
}

/** The mountain's woods and the far banks: thousands of simple crowns, two draw calls. */
export function FarWoods({ near }: { near: (x: number, z: number) => boolean }) {
  const ball = useRef<THREE.InstancedMesh>(null);
  const cone = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => ({ ball: farCrown(false), cone: farCrown(true) }), []);
  const mats = useMemo(() => ({ ball: foliageMaterial(0.5), cone: foliageMaterial(0.5) }), []);
  const spots = useMemo(() => {
    const n = simplex2(81);
    const accept = (x: number, z: number, r: () => number) => {
      if (!wooded(x, z) || near(x, z)) return false;
      const d = Math.hypot(x, z);
      if (d > 285) return false;
      const y = height(x, z);
      // dense on the mountain and the hills, in drifts elsewhere
      const forest = THREE.MathUtils.smoothstep(y, 14, 30);
      return r() < 0.25 + 0.75 * Math.max(forest, THREE.MathUtils.smoothstep(fbm(n, x / 50, z / 50, 2), -0.1, 0.4));
    };
    return scatter(82, 2800, [-290, -290, 290, 290], 5.4, accept);
  }, [near]);
  useLayoutEffect(() => {
    const r = rng(83);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    let b = 0;
    let p = 0;
    for (const [x, z] of spots) {
      const y = height(x, z);
      const pine = y > 45 ? r() < 0.55 : r() < 0.15;
      const k = 2.6 + r() * 1.8 + (pine ? 0.3 : 0);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.28);
      m.compose(new THREE.Vector3(x, y - 0.6, z), q, new THREE.Vector3(k, k * (0.9 + r() * 0.4), k));
      // neighbouring crowns differ: some yellower, some bluer, some in shade
      c.setRGB(1, 1, 1).multiplyScalar(0.72 + r() * 0.4);
      c.offsetHSL((r() - 0.5) * 0.06, (r() - 0.5) * 0.1, 0);
      const mesh = pine ? cone.current! : ball.current!;
      const i = pine ? p++ : b++;
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c);
    }
    ball.current!.count = b;
    cone.current!.count = p;
    for (const mesh of [ball.current!, cone.current!]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }, [spots]);
  return (
    <>
      {/* far crowns cast no shadow: at this distance it would not show, and it would double their cost */}
      <instancedMesh ref={ball} args={[geo.ball, mats.ball, spots.length]} receiveShadow frustumCulled={false} />
      <instancedMesh ref={cone} args={[geo.cone, mats.cone, spots.length]} receiveShadow frustumCulled={false} />
    </>
  );
}

/** One kind of the kit's full trees, instanced at the given spots. */
function Trees({ kind, spots, seed }: { kind: Kind; spots: [number, number][]; seed: number }) {
  const wood = useRef<THREE.InstancedMesh>(null);
  const leaves = useRef<THREE.InstancedMesh>(null);
  const cards = useRef<THREE.InstancedMesh>(null);
  const tree = useMemo(() => treeGeometry(kind, seed, true), [kind, seed]);
  const mats = useMemo(() => ({ wood: barkMaterial(), leaves: foliageMaterial(tree.crownBase), cards: foliageMaterial(tree.crownBase, true) }), [tree]);
  useLayoutEffect(() => {
    const r = rng(seed * 13);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    spots.forEach(([x, z], i) => {
      const k = kind === "tall" ? 1.2 + r() * 0.6 : 1.05 + r() * 0.6;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI * 2);
      m.compose(new THREE.Vector3(x, height(x, z) - 0.15, z), q, new THREE.Vector3(k, k * (0.9 + r() * 0.25), k));
      wood.current!.setMatrixAt(i, m);
      leaves.current!.setMatrixAt(i, m);
      cards.current?.setMatrixAt(i, m);
      c.setRGB(1, 1, 1).multiplyScalar(0.85 + r() * 0.3);
      leaves.current!.setColorAt(i, c);
      cards.current?.setColorAt(i, c);
    });
    for (const mesh of [wood.current, leaves.current, cards.current]) {
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }, [spots, kind, seed]);
  return (
    <>
      <instancedMesh ref={wood} args={[tree.wood, mats.wood, spots.length]} castShadow receiveShadow />
      <instancedMesh ref={leaves} args={[tree.leaves, mats.leaves, spots.length]} castShadow receiveShadow />
      {tree.cards && <instancedMesh ref={cards} args={[tree.cards, mats.cards, spots.length]} receiveShadow />}
    </>
  );
}

/** Full trees close to the walk: the woods by the path, the banks of the cutting and the foot of the spur. */
export function NearWoods({ near }: { near: (x: number, z: number) => boolean }) {
  const spots = useMemo(() => {
    // the near verge stays open, so the road and its traffic are seen from the bridge's ramp
    const accept = (x: number, z: number) => wooded(x, z) && near(x, z) && !(z > 0 && z < 45 && x > -40 && x < 60);
    return {
      broadleaf: scatter(1, 50, [-90, -110, 90, 140], 9, accept),
      pine: scatter(2, 16, [-60, -120, 60, -30], 9, accept),
      blossom: scatter(4, 5, [-30, 30, 30, 90], 12, (x, z) => accept(x, z) && Math.abs(x - pathX(z)) < 18),
    };
  }, [near]);
  return (
    <>
      <Trees kind="broadleaf" spots={spots.broadleaf} seed={101} />
      <Trees kind="pine" spots={spots.pine} seed={202} />
      <Trees kind="blossom" spots={spots.blossom} seed={404} />
    </>
  );
}

/** Far ranges all round, paler and bluer with distance, so the valley has an edge. */
export function Ranges() {
  const layers = useMemo(
    () =>
      [
        { r: 296, h: 95, base: "#87a2ad", top: "#b3c7cf", seed: 93 },
        { r: 282, h: 55, base: "#6c8c84", top: "#98b1ab", seed: 92 },
      ].map(({ r, h, base, top, seed }) => {
        const n = simplex2(seed);
        const g = new THREE.CylinderGeometry(1, 1, 1, 360, 6, true);
        const pos = g.attributes.position;
        const colors = new Float32Array(pos.count * 3);
        const lo = new THREE.Color(base);
        const hi = new THREE.Color(top);
        for (let i = 0; i < pos.count; i++) {
          const a = Math.atan2(pos.getZ(i), pos.getX(i));
          const v = pos.getY(i) + 0.5;
          const ridge = Math.pow(0.5 + 0.5 * fbm(n, Math.cos(a) * 2.2, Math.sin(a) * 2.2, 5), 1.5);
          pos.setXYZ(i, Math.cos(a) * r, (h * 0.2 + ridge * h) * v - 8, Math.sin(a) * r);
          colors.set(lo.clone().lerp(hi, Math.pow(v, 0.7)).toArray(), i * 3);
        }
        g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        return g;
      }),
    [],
  );
  return (
    <>
      {layers.map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshBasicMaterial vertexColors side={THREE.DoubleSide} fog={false} />
        </mesh>
      ))}
    </>
  );
}

/** Grey rock breaking through the spur's steep shoulders and the banks, so the slopes read as stone under turf. */
export function Rocks() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => {
    // a weathered boulder: a sphere pushed in and out by smooth noise, flattened, with a flat-ish base
    const g = mergeVertices(new THREE.IcosahedronGeometry(1, 1).deleteAttribute("normal").deleteAttribute("uv"));
    const n = simplex2(70);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const k = 1 + 0.22 * n(x * 1.3 + 3, z * 1.3 + y) + 0.08 * n(x * 4, y * 4 + z);
      p.setXYZ(i, x * k * 1.1, Math.max(y * k * 0.7, -0.25), z * k * 0.9);
    }
    // faceted, like split stone
    const flat = g.toNonIndexed();
    flat.computeVertexNormals();
    return flat;
  }, []);
  const spots = useMemo(() => {
    const slope = (x: number, z: number) => Math.hypot(height(x + 1.5, z) - height(x - 1.5, z), height(x, z + 1.5) - height(x, z - 1.5)) / 3;
    return scatter(71, 260, [-80, -150, 80, 40], 2.6, (x, z, r) => {
      if (!wooded(x, z) && Math.abs(z) < 17) return false;
      if (Math.abs(x - STAIR.x) < 4 && z < -20 && z > STAIR.z1 - 2) return false;
      if (Math.hypot(x - SPUR.x, z - SPUR.z) < SPUR.plateau + 1) return false;
      return r() < THREE.MathUtils.smoothstep(slope(x, z), 0.45, 1.0);
    });
  }, []);
  useLayoutEffect(() => {
    const r = rng(77);
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    spots.forEach(([x, z], i) => {
      const k = 0.8 + r() * r() * 3.2;
      m.compose(
        new THREE.Vector3(x, height(x, z) - k * 0.2, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 0.4, r() * 6.28, (r() - 0.5) * 0.4)),
        new THREE.Vector3(k, k * (0.7 + r() * 0.6), k),
      );
      ref.current!.setMatrixAt(i, m);
      ref.current!.setColorAt(i, c.set(["#9a9283", "#8b8577", "#a39a86"][i % 3]).multiplyScalar(0.85 + r() * 0.25));
    });
    ref.current!.instanceMatrix.needsUpdate = true;
    ref.current!.instanceColor!.needsUpdate = true;
  }, [spots]);
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, spots.length]} castShadow receiveShadow>
      <meshStandardMaterial roughness={0.95} />
    </instancedMesh>
  );
}

/** Low shrubs over the open ground near the walk, so the meadow and the slopes have texture at every distance. */
export function Bushes() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => {
    const g = mergeVertices(new THREE.IcosahedronGeometry(1, 1).deleteAttribute("normal").deleteAttribute("uv"));
    const n = simplex2(90);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = 1 + 0.2 * n(p.getX(i) * 2 + p.getZ(i), p.getY(i) * 2);
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k + 0.45, p.getZ(i) * k);
    }
    g.computeVertexNormals();
    const lo = new THREE.Color("#2f5a26");
    const hi = new THREE.Color("#7aa04a");
    return paint(g, (y) => lo.clone().lerp(hi, THREE.MathUtils.clamp(y / 0.95, 0, 1)));
  }, []);
  const material = useMemo(() => foliageMaterial(0.2), []);
  const spots = useMemo(() => {
    const n = simplex2(91);
    return scatter(92, 800, [-150, -150, 150, 160], 2.6, (x, z, r) => {
      if (!wooded(x, z) || Math.hypot(x - SPUR.x, z - SPUR.z) < SPUR.plateau + 2) return false;
      // in drifts, thicker along the foot of walls and slopes
      return r() < THREE.MathUtils.smoothstep(fbm(n, x / 25, z / 25, 2), -0.15, 0.35);
    });
  }, []);
  useLayoutEffect(() => {
    const r = rng(93);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    spots.forEach(([x, z], i) => {
      const k = 0.6 + r() * 1.1;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.28);
      m.compose(new THREE.Vector3(x, height(x, z) - 0.1, z), q, new THREE.Vector3(k * (1 + r() * 0.5), k, k));
      ref.current!.setMatrixAt(i, m);
      c.setRGB(1, 1, 1).multiplyScalar(0.75 + r() * 0.4);
      c.offsetHSL((r() - 0.5) * 0.06, 0, 0);
      ref.current!.setColorAt(i, c);
    });
    ref.current!.instanceMatrix.needsUpdate = true;
    ref.current!.instanceColor!.needsUpdate = true;
  }, [spots]);
  return <instancedMesh ref={ref} args={[geometry, material, spots.length]} castShadow receiveShadow />;
}

/** Tufts of grass over the near meadow, where the camera looks down from the ramp. */
export function Grass({ count }: { count: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => bladeGeometry(), []);
  const material = useMemo(() => grassMaterial(), []);
  useLayoutEffect(() => {
    const mesh = ref.current!;
    const r = rng(11);
    const n = simplex2(5);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const sc = new THREE.Vector3();
    const p = new THREE.Vector3();
    const c = new THREE.Color();
    let i = 0;
    let guard = 0;
    while (i < count && guard < count * 4) {
      guard++;
      const cx = -80 + r() * 160;
      const cz = 13 + r() * 100;
      if (Math.abs(cx - pathX(cz)) < 3.2 + r()) continue;
      // thick near the ramp, where the camera is, thinning away from it
      if (r() > 1 - THREE.MathUtils.smoothstep(Math.hypot(cx, cz - 50), 20, 75)) continue;
      const patch = fbm(n, cx / 12, cz / 12, 2);
      if (r() > 0.35 + 0.65 * THREE.MathUtils.smoothstep(patch, -0.4, 0.3)) continue;
      const blades = 6 + Math.floor(r() * 5);
      const tall = 0.6 + r() * 0.7;
      const hue = 0.22 + r() * 0.05 + patch * 0.02;
      for (let k = 0; k < blades && i < count; k++) {
        const a = r() * Math.PI * 2;
        const rr = r() * 0.25;
        const x = cx + Math.cos(a) * rr;
        const z = cz + Math.sin(a) * rr;
        p.set(x, height(x, z) - 0.04, z);
        q.setFromEuler(e.set((r() - 0.5) * 0.35, a + Math.PI / 2 + (r() - 0.5) * 0.6, (r() - 0.5) * 0.5));
        sc.set(0.8 + r() * 0.6, tall * (0.6 + r() * 0.6), 1);
        mesh.setMatrixAt(i, m.compose(p, q, sc));
        mesh.setColorAt(i, c.setHSL(hue + (r() - 0.5) * 0.02, 0.3 + r() * 0.15, 0.42 + r() * 0.18));
        i++;
      }
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor!.needsUpdate = true;
  }, [count]);
  return <instancedMesh ref={ref} args={[geometry, material, count]} receiveShadow frustumCulled={false} />;
}
