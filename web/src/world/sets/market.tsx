"use client";

/**
 * Hun Min street in Pafogai Du, Dzego (ch. 2, 18): Realm. A street of one- and two-storey shops on the city's grid,
 * with concrete roofs, open fronts, stairways going under the pavement, a chip factory letting off steam, a sensor
 * shop beside a foil shop, cartoon animals on a wall, and a courier robot rolling by. Every launched token is a shop
 * sign here: busier launches shine bigger and brighter, quiet ones keep a floor of light. One shop is empty and dark,
 * with a "for launch" stand on the green circle in front of it: the place to launch your own.
 */
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { barkMaterial, foliageMaterial, stoneMaterial } from "../kit/materials";
import { fbm, rng, simplex2 } from "../kit/noise";
import { treeGeometry } from "../kit/vegetation";
import { labOff } from "../lab";
import { sunAt } from "../stage";
import { Courier, Robes, Steam, Wires } from "./market/life";
import { emptyTexture, iconTexture, interiorTexture, muralTexture, standTexture } from "./market/paint";
import { awningMaterial, glowMaterial, Pieces, plasterMaterial, solidMaterial, type Piece } from "./market/parts";
import { buildSigns, Signs, type Token } from "./market/signs";
import { EMPTY, FX, planStreet, ROAD } from "./market/street";
import type { SetModule, SetProps } from "./types";

/** the reserved colour: a green circle means "tap here", and nothing else in Meldan glows this green */
const TAP_GREEN = "#38ff86";
const HOUR = 16.7;
/**
 * The street is laid out along -z, then the whole set is turned so the low sun comes from up the street and to the
 * left of someone walking down it: long shadows towards the visitor, one side of shops in shade where the signs glow,
 * the other lit from the side.
 */
const TURN = 1.4;
const UP = new THREE.Vector3(0, 1, 0);
const turned = (p: [number, number, number]) => new THREE.Vector3(...p).applyAxisAngle(UP, TURN).toArray() as [number, number, number];

/** Made-up launches for when the world has no live board yet. */
const DEMO: Token[] = [
  { symbol: "LENSU", volume: 142 },
  { symbol: "VISION", volume: 96 },
  { symbol: "CALCPIG", volume: 71 },
  { symbol: "HAMVIAL", volume: 48 },
  { symbol: "FOIL", volume: 33 },
  { symbol: "DZEGO", volume: 26 },
  { symbol: "MINPENT", volume: 19 },
  { symbol: "SNOWMOON", volume: 14 },
  { symbol: "KUNGAU", volume: 9.5 },
  { symbol: "CHIPFAB", volume: 6.2 },
  { symbol: "ROBE", volume: 4.1 },
  { symbol: "TEN", volume: 2.6 },
  { symbol: "MIXNET", volume: 1.4 },
  { symbol: "BANSUN", volume: 0.8 },
  { symbol: "ZEI", volume: 0.35 },
  { symbol: "RAINMOON", volume: 0.12 },
];

/** Pictures on flat cards, all from one painted strip: each card shows cell `variant` of `cols`. */
function Cards({ items, map, cols, lit }: { items: { x: number; y: number; z: number; w: number; h: number; s: number; variant: number; tint?: string; k?: number }[]; map: THREE.Texture; cols: number; lit: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1);
    g.setAttribute("aVariant", new THREE.InstancedBufferAttribute(new Float32Array(items.map((i) => i.variant)), 1));
    return g;
  }, [items]);
  const material = useMemo(() => {
    const m = lit ? new THREE.MeshStandardMaterial({ map, roughness: 0.85 }) : new THREE.MeshBasicMaterial({ map });
    m.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aVariant;")
        .replace("#include <uv_vertex>", `#include <uv_vertex>\nvMapUv.x = (vMapUv.x + aVariant) / ${cols.toFixed(1)};`);
    };
    return m;
  }, [map, cols, lit]);
  useLayoutEffect(() => {
    const mesh = ref.current!;
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    items.forEach((it, i) => {
      m.compose(new THREE.Vector3(it.x, it.y, it.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (-it.s * Math.PI) / 2), new THREE.Vector3(it.w, it.h, 1));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.set(it.tint ?? "#ffffff").multiplyScalar(it.k ?? 1));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor!.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items]);
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} receiveShadow={lit} />;
}

/** Street trees, instanced: full leaves near the street, lighter crowns further out. */
function Trees({ spots }: { spots: [number, number, number][] }) {
  const sets = useMemo(
    () => [
      { spots: spots.filter(([x]) => Math.abs(x) < 20), tree: treeGeometry("broadleaf", 18, true) },
      { spots: spots.filter(([x]) => Math.abs(x) >= 20), tree: treeGeometry("broadleaf", 19, false) },
    ],
    [spots],
  );
  return (
    <>
      {sets.map((s, i) => (
        <TreeSet key={i} {...s} />
      ))}
    </>
  );
}

function TreeSet({ spots, tree }: { spots: [number, number, number][]; tree: ReturnType<typeof treeGeometry> }) {
  const wood = useRef<THREE.InstancedMesh>(null);
  const leaves = useRef<THREE.InstancedMesh>(null);
  const cards = useRef<THREE.InstancedMesh>(null);
  const mats = useMemo(() => ({ wood: barkMaterial(), leaves: foliageMaterial(tree.crownBase), cards: foliageMaterial(tree.crownBase, true) }), [tree]);
  useLayoutEffect(() => {
    const r = rng(5);
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    spots.forEach(([x, z, k], i) => {
      m.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.28), new THREE.Vector3(k, k * (0.9 + r() * 0.2), k));
      for (const mesh of [wood.current, leaves.current, cards.current]) mesh?.setMatrixAt(i, m);
      c.setRGB(1, 1, 1).multiplyScalar(0.85 + r() * 0.3);
      leaves.current!.setColorAt(i, c);
      cards.current?.setColorAt(i, c);
    });
    for (const mesh of [wood.current, leaves.current, cards.current]) {
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [spots]);
  return (
    <>
      <instancedMesh ref={wood} args={[tree.wood, mats.wood, spots.length]} castShadow receiveShadow />
      <instancedMesh ref={leaves} args={[tree.leaves, mats.leaves, spots.length]} castShadow receiveShadow />
      {tree.cards && !labOff("cards") && <instancedMesh ref={cards} args={[tree.cards, mats.cards, spots.length]} receiveShadow />}
    </>
  );
}

/** The green circle on the pavement in front of the empty shop, and the chalk stand on it. */
function LaunchSpot({ x, z, s }: { x: number; z: number; s: number }) {
  const circle = useRef<THREE.MeshStandardMaterial>(null);
  const map = useMemo(() => standTexture(), []);
  useFrame(({ clock }) => {
    if (circle.current) circle.current.emissiveIntensity = 2.4 + Math.sin(clock.elapsedTime * 2.2) * 0.6;
  });
  // the stand faces people coming up the street and across it
  const turn = -s * (Math.PI / 2 - 0.6);
  return (
    <group position={[x, 0.17, z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <ringGeometry args={[1.0, 1.25, 96]} />
        <meshStandardMaterial ref={circle} color="#0f2a18" emissive={TAP_GREEN} emissiveIntensity={2.4} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]}>
        <circleGeometry args={[1.0, 64]} />
        <meshStandardMaterial color="#13261a" emissive={TAP_GREEN} emissiveIntensity={0.08} roughness={0.4} />
      </mesh>
      <group rotation={[0, turn, 0]}>
        {[1, -1].map((side) => (
          <group key={side} rotation={[0, side < 0 ? Math.PI : 0, 0]}>
            <group rotation={[-0.2, 0, 0]}>
              <mesh position={[0, 0.6, 0.26]} castShadow>
                <boxGeometry args={[0.66, 1.2, 0.04]} />
                <meshStandardMaterial color="#8a6440" roughness={0.8} />
              </mesh>
              <mesh position={[0, 0.72, 0.285]}>
                <planeGeometry args={[0.58, 0.72]} />
                <meshStandardMaterial map={map} roughness={0.95} />
              </mesh>
            </group>
          </group>
        ))}
      </group>
    </group>
  );
}

/**
 * Far away at the end of the street, the mountain the Dzegojans re-clad as a pyramid (ch. 4), and low hazy ranges:
 * painted in the colours of the air, so they sit behind everything.
 */
function Far() {
  const { pyramid, ranges } = useMemo(() => {
    const sun = sunAt(HOUR).applyAxisAngle(UP, -TURN);
    const haze = new THREE.Color("#e9cfa6");
    const p = new THREE.ConeGeometry(110, 95, 4, 1, true).toNonIndexed();
    p.rotateY(Math.PI / 4);
    p.translate(0, 47.5, 0);
    p.computeVertexNormals();
    const pos = p.attributes.position;
    const nrm = p.attributes.normal;
    const col = new Float32Array(pos.count * 3);
    const lit = new THREE.Color("#f0d6b0");
    const shade = new THREE.Color("#9c9aae");
    for (let i = 0; i < pos.count; i++) {
      const d = Math.max(0, nrm.getX(i) * sun.x + nrm.getY(i) * sun.y + nrm.getZ(i) * sun.z);
      const c = shade.clone().lerp(lit, Math.min(1, d * 1.4)).lerp(haze, 0.5 + 0.2 * (1 - pos.getY(i) / 95));
      col.set([c.r, c.g, c.b], i * 3);
    }
    p.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const n = simplex2(181);
    const g = new THREE.CylinderGeometry(1, 1, 1, 360, 4, true);
    const rp = g.attributes.position;
    const rc = new Float32Array(rp.count * 3);
    const lo = new THREE.Color("#a99aa2");
    const hi = new THREE.Color("#d9c3ad");
    for (let i = 0; i < rp.count; i++) {
      const a = Math.atan2(rp.getZ(i), rp.getX(i));
      const v = rp.getY(i) + 0.5;
      const ridge = 0.5 + 0.5 * fbm(n, Math.cos(a) * 2.5, Math.sin(a) * 2.5, 5);
      rp.setXYZ(i, Math.cos(a) * 330, (14 + ridge * 46) * v - 4, Math.sin(a) * 330);
      const c = lo.clone().lerp(hi, v);
      rc.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(rc, 3));
    return { pyramid: p, ranges: g };
  }, []);
  return (
    <>
      <mesh geometry={pyramid} position={[38, -2, -315]}>
        <meshBasicMaterial vertexColors fog={false} />
      </mesh>
      <mesh geometry={ranges}>
        <meshBasicMaterial vertexColors side={THREE.DoubleSide} fog={false} />
      </mesh>
    </>
  );
}

/**
 * The late sun, made warmer and stronger here than the stage's: a second light from the same side with its own
 * shadows over the shops near the stop, so the sunlit fronts go gold and the long shadows read clearly.
 */
function GoldenSun() {
  const target = useMemo(() => new THREE.Object3D(), []);
  const at = useMemo(() => sunAt(HOUR).applyAxisAngle(UP, -TURN).multiplyScalar(90), []);
  return (
    <>
      <primitive object={target} />
      <directionalLight
        position={at}
        target={target}
        color="#ff9d4d"
        intensity={2.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-camera-left={-45}
        shadow-camera-right={45}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
        shadow-camera-near={10}
        shadow-camera-far={200}
      />
    </>
  );
}

function HunMinStreet({ live }: SetProps) {
  const plan = useMemo(() => planStreet(), []);
  const mats = useMemo(() => {
    const m = {
      plaster: plasterMaterial(),
      metal: solidMaterial({ metalness: 0.55, roughness: 0.42 }),
      dark: solidMaterial({ roughness: 0.7 }),
      glass: solidMaterial({ metalness: 0.2, roughness: 0.06, envMapIntensity: 2.2 }),
      cloth: awningMaterial(),
      white: solidMaterial({ roughness: 0.55 }),
      foil: solidMaterial({ metalness: 0.65, roughness: 0.32, envMapIntensity: 2.6 }),
      leaf: solidMaterial({ roughness: 0.9 }),
      glow: glowMaterial(0.1),
      paving: stoneMaterial({ a: "#ddd5c7", b: "#bfb5a5", mortar: "#8f877b", brick: [0.92, 0.46], moss: 0.05 }),
      stone: stoneMaterial({ a: "#efe8dc", b: "#d6cbbb", mortar: "#b5aa9a", brick: [0.75, 1.15], moss: 0 }),
      kerb: stoneMaterial({ a: "#a59f95", b: "#8c867d", mortar: "#6b665e", brick: [1.2, 0.8], moss: 0.02 }),
      road: stoneMaterial({ a: "#8f8a84", b: "#716c67", mortar: "#4c4844", brick: [0.5, 0.26], moss: 0.03 }),
    };
    // softer sky fill on walls and stone, so the shaded side of the street reads darker than the sunlit one
    for (const k of ["plaster", "paving", "kerb", "road", "stone"] as const) m[k].envMapIntensity = 0.38;
    return m;
  }, []);
  const tex = useMemo(() => ({ interior: interiorTexture(), empty: emptyTexture(), mural: muralTexture(), icons: iconTexture() }), []);

  // the launches: the live board if there is one, made-up ones if not
  const tokens = live.tokens?.length ? live.tokens : DEMO;
  const key = tokens.map((t) => `${t.symbol}:${t.volume}`).join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const signs = useMemo(() => buildSigns(tokens, plan.candidates.map((c) => c.slot)), [key, plan]);
  // places no launch has taken show a painted board instead
  const boards = useMemo(
    () =>
      [...plan.boards, ...plan.candidates.slice(Math.min(tokens.length, plan.candidates.length)).flatMap((c) => (c.board ? [c.board] : []))].map((b) => ({ ...b, w: b.size, h: b.size })),
    [plan, tokens.length],
  );
  // the brightest signs near the stop light the pavement around them
  const lights = useMemo(() => signs.lights.filter((l) => Math.abs(l.p.z - EMPTY.z) < 22).sort((a, b) => b.level - a.level).slice(0, 4), [signs]);

  const road = useMemo<Piece[]>(
    () => [{ p: [0, -0.25, -95], s: [ROAD * 2, 0.5, 330], c: "#ffffff" }, ...[35, -55, -155].map((z): Piece => ({ p: [0, -0.24, z], s: [400, 0.5, 10], c: "#ffffff" }))],
    [],
  );
  const e = plan.empty;
  const ez = (e.z1 + e.z0) / 2;
  const m = plan.mural;

  return (
    <group rotation-y={TURN}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, -90]} receiveShadow>
        <planeGeometry args={[700, 700]} />
        <meshStandardMaterial color="#8a847b" roughness={0.95} />
      </mesh>
      <Pieces shape="box" pieces={road} material={mats.road} shadow={false} />
      <Pieces shape="box" pieces={plan.box.paving} material={mats.paving} />
      <Pieces shape="box" pieces={plan.box.kerb} material={mats.kerb} />
      <Pieces shape="box" pieces={plan.box.plaster} material={mats.plaster} />
      <Pieces shape="box" pieces={plan.box.trim} material={mats.plaster} shadow={false} />
      <Pieces shape="box" pieces={plan.box.stone} material={mats.stone} />
      <Pieces shape="box" pieces={plan.box.metal} material={mats.metal} />
      <Pieces shape="box" pieces={[...plan.box.dark, ...signs.pieces]} material={mats.dark} />
      <Pieces shape="box" pieces={plan.box.glass} material={mats.glass} shadow={false} />
      <Pieces shape="box" pieces={plan.box.cloth} material={mats.cloth} />
      <Pieces shape="box" pieces={plan.box.white} material={mats.white} />
      <Pieces shape="box" pieces={plan.box.foil} material={mats.foil} />
      <Pieces shape="box" pieces={plan.box.glow} material={mats.glow} shadow={false} />
      <Pieces shape="cyl" pieces={plan.cyl.plaster} material={mats.plaster} />
      <Pieces shape="cyl" pieces={plan.cyl.metal} material={mats.metal} />
      <Pieces shape="cyl" pieces={plan.cyl.foil} material={mats.foil} />
      <Pieces shape="ball" pieces={plan.ball.leaf} material={mats.leaf} />
      <Pieces shape="cone" pieces={plan.cone} material={mats.cloth} />
      <Pieces shape="ball" pieces={plan.ball.metal} material={mats.metal} />
      <Pieces shape="ball" pieces={plan.ball.glow} material={mats.glow} shadow={false} />
      <Cards items={plan.fronts} map={tex.interior} cols={4} lit={false} />
      <Cards items={boards} map={tex.icons} cols={6} lit />
      {/* the empty shop: bare and dark behind its half-closed shutter */}
      <mesh position={[e.s * (FX + 1.19), 1.75, ez]} rotation={[0, (-e.s * Math.PI) / 2, 0]}>
        <planeGeometry args={[e.z1 - e.z0 - 0.8, 3.5]} />
        <meshBasicMaterial map={tex.empty} />
      </mesh>
      {/* the cartoon animals on the side wall above the empty shop */}
      <mesh position={[m.s * (FX + 3.3), (4.75 + m.H) / 2, m.z1 + 0.012]}>
        <planeGeometry args={[6, m.H - 4.85]} />
        <meshStandardMaterial map={tex.mural} roughness={0.9} />
      </mesh>
      <GoldenSun />
      <Signs geometry={signs.geometry} map={signs.map} />
      {lights.map((l, i) => (
        <pointLight key={i} position={l.p} color={l.colour} intensity={6 * l.level} distance={10} decay={1.6} />
      ))}
      <LaunchSpot x={e.s * 6.2} z={ez} s={e.s} />
      <Trees spots={plan.trees} />
      <Wires wires={plan.strings} />
      <Steam at={plan.steam} />
      <Courier x={-1.6} z0={-62} z1={-16} />
      <Robes walkers={plan.walkers} />
      <Far />
    </group>
  );
}

/** Stop 4: Realm. */
export const marketSet: SetModule = {
  id: "market",
  origin: [0, 0, -1400],
  hour: HOUR,
  poses: {
    arrive: { position: turned([0.6, 6.2, 39]), target: turned([0, 2.6, -40]) },
    realm: { position: turned([-3.3, 2.2, 14]), target: turned([6.5, 4.4, -1]) },
  },
  Scene: HunMinStreet,
};
