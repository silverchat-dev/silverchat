"use client";

/**
 * Dzego's mountain pyramid at night (ch4, 12, 18, 19): a half-kilometre mountain clad in smooth stone, a ring of trees
 * where people walk at half its height, a stair climbing its face, and at its foot an arched brick door marked with
 * clashing fists. A paved walk lined with trees leads to it, lamps in the paving lighting up one after another towards
 * the door, as the path lit up in the arena. The door is the riddle: sealed, open or solved, with a plaque along the
 * walk for every riddle solved so far.
 */
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { barkMaterial, foliageMaterial, grassMaterial, groundMaterial, stoneMaterial, weather } from "../kit/materials";
import { fbm, rng, simplex2, smoothstep } from "../kit/noise";
import { landGeometry, type Land } from "../kit/terrain";
import { bladeGeometry, scatter, treeGeometry, type Kind } from "../kit/vegetation";
import { Brazier, GreenCircle, Plaques, Portal, PORTAL, Sconce, type RiddleState } from "./pyramid/door";
import { Fireflies, PathLights } from "./pyramid/life";
import { moonlit, polished } from "./pyramid/polish";
import type { SetModule, SetProps } from "./types";

/** The pyramid: centre (z), half width at the ground, the terrace at half height and how far the top steps in. */
const P = { z: -190, base: 180, terrace: 110, inset: 10, slope: 1.28 };
/** the front face meets the ground here */
const FRONT = P.z + P.base;
/** the walk: half width, how far out it runs, and the depth of the plaza before the gate */
const WALK = { half: 3.6, end: 270, plaza: 26 };
/** where the visitor stands to act: in front of the door */
const CIRCLE: [number, number] = [0, 9];

/** Level ground for the plaza and the walk, rolling meadow beyond, rising to wooded slopes on both sides. */
function useLand(): Land {
  return useMemo(() => {
    const n = simplex2(44);
    const n2 = simplex2(45);
    const toPath = (x: number, z: number) => Math.hypot(x, z - THREE.MathUtils.clamp(z, 0, WALK.end));
    const height = (x: number, z: number) => {
      const d = Math.min(toPath(x, z), Math.hypot(Math.max(Math.abs(x) - 18, 0), Math.max(z - WALK.plaza, -z, 0)));
      const roll = 2.6 * fbm(n, x / 60, z / 60, 4) + 0.45 * fbm(n2, x / 11, z / 11, 3);
      const rise = 22 * smoothstep(70, 270, Math.abs(x)) * smoothstep(-60, 40, z);
      return (roll + rise) * smoothstep(8, 40, d) - 0.04;
    };
    const path = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, WALK.end), new THREE.Vector3(0, 0, 0)]);
    return { height, toPath, path, size: 600, summit: 0 };
  }, []);
}

function Ground({ land }: { land: Land }) {
  const geometry = useMemo(() => landGeometry(land, 220, 9), [land]);
  // night: the stage's image light is made for day, so the ground takes less of it
  const material = useMemo(() => moonlit(groundMaterial(), 0.5), []);
  return <mesh geometry={geometry} material={material} receiveShadow />;
}

/** Tufts of grass on both sides of the walk, thick near it and thinning away. */
function Grass({ land, count }: { land: Land; count: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => bladeGeometry(), []);
  const material = useMemo(() => moonlit(grassMaterial(), 0.5), []);
  useLayoutEffect(() => {
    const mesh = ref.current!;
    const r = rng(12);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const c = new THREE.Color();
    let i = 0;
    let guard = 0;
    while (i < count && guard < count * 6) {
      guard++;
      const cx = (r() - 0.5) * 120;
      const cz = WALK.plaza - 2 + r() * 240;
      const d = Math.abs(cx);
      if (d < WALK.half + 0.9 + r() * 0.6) continue;
      if (r() > 1 - smoothstep(8, 55, d) * 0.9) continue;
      const blades = 5 + Math.floor(r() * 5);
      const tall = 0.55 + r() * 0.6;
      for (let k = 0; k < blades && i < count; k++) {
        const a = r() * Math.PI * 2;
        const rr = r() * 0.22;
        const x = cx + Math.cos(a) * rr;
        const z = cz + Math.sin(a) * rr;
        p.set(x, land.height(x, z) - 0.04, z);
        q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.35, a + Math.PI / 2 + (r() - 0.5) * 0.6, (r() - 0.5) * 0.5));
        s.set(0.8 + r() * 0.6, tall * (0.6 + r() * 0.6), 1);
        mesh.setMatrixAt(i, m.compose(p, q, s));
        c.setHSL(0.24 + r() * 0.05, 0.28 + r() * 0.12, 0.4 + r() * 0.16);
        mesh.setColorAt(i, c);
        i++;
      }
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor!.needsUpdate = true;
  }, [land, count]);
  return <instancedMesh ref={ref} args={[geometry, material, count]} receiveShadow frustumCulled={false} />;
}

type Spot = [number, number] | [number, number, number];

/** One kind of tree, instanced at the given spots (at a given height, or on the ground). */
function Trees({ land, kind, spots, seed, near = true, scale = 1, shadow = true }: { land: Land; kind: Kind; spots: Spot[]; seed: number; near?: boolean; scale?: number; shadow?: boolean }) {
  const wood = useRef<THREE.InstancedMesh>(null);
  const leaves = useRef<THREE.InstancedMesh>(null);
  const cards = useRef<THREE.InstancedMesh>(null);
  const tree = useMemo(() => treeGeometry(kind, seed, near), [kind, seed, near]);
  const mats = useMemo(
    () => ({ wood: moonlit(barkMaterial(), 0.8), leaves: moonlit(foliageMaterial(tree.crownBase), 0.8), cards: moonlit(foliageMaterial(tree.crownBase, true), 0.8) }),
    [tree],
  );
  useLayoutEffect(() => {
    const r = rng(seed * 13);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    spots.forEach(([x, z, y], i) => {
      const k = scale * (kind === "tall" ? 1.25 + r() * 0.5 : 1.05 + r() * 0.6);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI * 2);
      m.compose(new THREE.Vector3(x, (y ?? land.height(x, z)) - 0.15, z), q, new THREE.Vector3(k, k * (0.9 + r() * 0.25), k));
      wood.current!.setMatrixAt(i, m);
      leaves.current!.setMatrixAt(i, m);
      cards.current?.setMatrixAt(i, m);
      // night: the leaves darker and bluer than by day
      c.setRGB(0.4, 0.5, 0.64).multiplyScalar(0.85 + r() * 0.3);
      leaves.current!.setColorAt(i, c);
      cards.current?.setColorAt(i, c);
    });
    for (const mesh of [wood.current, leaves.current, cards.current]) {
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }, [land, spots, kind, seed, scale]);
  return (
    <>
      <instancedMesh ref={wood} args={[tree.wood, mats.wood, spots.length]} castShadow={shadow} receiveShadow />
      <instancedMesh ref={leaves} args={[tree.leaves, mats.leaves, spots.length]} castShadow={shadow} receiveShadow />
      {tree.cards && <instancedMesh ref={cards} args={[tree.cards, mats.cards, spots.length]} receiveShadow />}
    </>
  );
}

/** The avenue: two rows of tall trees along the walk; woods beyond; a ring of pines on the pyramid's terrace. */
function Woods({ land }: { land: Land }) {
  const spots = useMemo(() => {
    const avenue: Spot[] = [];
    for (let z = 72; z < WALK.end; z += 12) for (const s of [-1, 1]) avenue.push([s * 12.5, z + (s > 0 ? 6 : 0)]);
    const n = simplex2(61);
    const wild = (x: number, z: number, r: () => number) =>
      Math.abs(x) > 24 && (z > FRONT + 18 || Math.abs(x) > P.base + 12) && r() < 0.3 + 0.7 * smoothstep(-0.3, 0.3, fbm(n, x / 50, z / 50, 3));
    const box: [number, number, number, number] = [-290, -260, 290, 290];
    // the ring at half height, where people walk round the mountain
    const ring: Spot[] = [];
    const w = P.base - P.terrace / P.slope - P.inset / 2;
    for (let a = -w; a < w; a += 8) ring.push([a, P.z + w, P.terrace], [a, P.z - w, P.terrace], [w, P.z + a, P.terrace], [-w, P.z + a, P.terrace]);
    // broadleaf near the walk, where the camera is; dark pines further out, cheap and good at night
    const near = (x: number, z: number) => Math.abs(x) < 60 && z > 20;
    const open = (x: number, z: number) => Math.abs(x) > 30 || z > 80;
    return {
      avenue,
      nearBroad: scatter(5, 60, [-60, 20, 60, 290], 8, (x, z, r) => near(x, z) && open(x, z) && wild(x, z, r)),
      farBroad: scatter(7, 140, box, 10, (x, z, r) => !near(x, z) && wild(x, z, r)),
      pine: scatter(6, 420, box, 9, (x, z, r) => !near(x, z) && wild(x, z, r)),
      ring,
    };
  }, []);
  return (
    <>
      <Trees land={land} kind="broadleaf" spots={spots.avenue} seed={301} scale={1.25} />
      <Trees land={land} kind="broadleaf" spots={spots.nearBroad} seed={302} />
      <Trees land={land} kind="broadleaf" spots={spots.farBroad} seed={302} near={false} shadow={false} />
      <Trees land={land} kind="pine" spots={spots.pine} seed={303} scale={1.3} shadow={false} />
      <Trees land={land} kind="pine" spots={spots.ring} seed={304} scale={1.1} shadow={false} />
    </>
  );
}

/** A square frustum with flat faces, corners on the diagonals so its faces look along the axes. */
function frustum(bottom: number, top: number, y0: number, y1: number) {
  const g = new THREE.CylinderGeometry(top * Math.SQRT2, bottom * Math.SQRT2, y1 - y0, 4, 1, true);
  g.rotateY(Math.PI / 4);
  g.translate(0, (y0 + y1) / 2, 0);
  const flat = g.toNonIndexed();
  flat.computeVertexNormals();
  return flat;
}

/**
 * The pyramid itself: smooth dressed stone in long courses, two stages with a terrace between them, a stair up the
 * middle of the face from the gate to the terrace, lamps along its sides.
 */
function Pyramid() {
  // moonlit blue-grey, the courses only faintly drawn
  const stone = useMemo(() => polished(stoneMaterial({ a: "#868ba3", b: "#7a7f97", mortar: "#71768e", brick: [9, 3.2], moss: 0 }), 0.45, { base: P.base, slope: P.slope }), []);
  const stairStone = useMemo(() => polished(stoneMaterial({ a: "#b3aab0", b: "#a2989f", mortar: "#857b84", brick: [2.2, 1.4], moss: 0.05 }), 0.6, { base: P.base, slope: P.slope }), []);
  const top1 = P.base - P.terrace / P.slope;
  const top2 = top1 - P.inset;
  const apex = P.terrace + top2 * P.slope;
  const geo = useMemo(
    () => ({
      lower: frustum(P.base + 4 / P.slope, top1, -4, P.terrace),
      upper: frustum(top2, 0, P.terrace, apex),
    }),
    [top1, top2, apex],
  );
  const terraceSlab = useMemo(() => new THREE.BoxGeometry(top1 * 2, 6, top1 * 2).translate(0, P.terrace - 3, 0), [top1]);
  // the stair: steps of a giant's stride up the face, from the top of the gate to the terrace
  const lamps = useRef<THREE.InstancedMesh>(null);
  const RISE = 1.1;
  const y0 = PORTAL.height + 1;
  const count = Math.floor((P.terrace - y0) / RISE);
  // where the face is at height y, in the pyramid's own space
  const faceZ = (y: number) => P.base - y / P.slope;
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    let k = 0;
    for (let i = 0; i < count; i += 7) {
      const y = y0 + i * RISE;
      for (const s of [-1, 1]) lamps.current!.setMatrixAt(k++, m.makeTranslation(s * 6.1, y + 1.1, faceZ(y) + 1.4));
    }
    lamps.current!.count = k;
    lamps.current!.instanceMatrix.needsUpdate = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, y0]);
  // a soft violet halo round the capstone
  const halo = useMemo(() => {
    const el = document.createElement("canvas");
    el.width = el.height = 128;
    const c = el.getContext("2d")!;
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,0.55)");
    g.addColorStop(0.25, "rgba(255,255,255,0.16)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(el);
  }, []);
  const wash = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: `varying vec2 vUv;
          void main() {
            vec2 p = vec2((vUv.x - 0.5) * 1.6, vUv.y);
            float glow = pow(max(0.0, 1.0 - length(p) * 1.15), 2.2);
            gl_FragColor = vec4(vec3(1.0, 0.55, 0.25) * glow * 0.32, 1.0);
          }`,
      }),
    [],
  );
  const along = Math.hypot(P.terrace - y0, (P.terrace - y0) / P.slope);
  const tilt = Math.atan2(1, P.slope);
  const ramp = useMemo(() => {
    // boxes along the slope: x across, y along the face, z out of it; then tipped back onto the face
    const g = mergeGeometries([
      new THREE.BoxGeometry(11, along, 1.6).translate(0, 0, -0.2),
      new THREE.BoxGeometry(1.2, along, 1.4).translate(-6.1, 0, 0.9),
      new THREE.BoxGeometry(1.2, along, 1.4).translate(6.1, 0, 0.9),
    ])!;
    g.rotateX(-tilt);
    const mid = (y0 + P.terrace) / 2;
    g.translate(0, mid, faceZ(mid));
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [along, tilt, y0]);
  return (
    <group position={[0, 0, P.z]}>
      <mesh geometry={geo.lower} material={stone} receiveShadow />
      <mesh geometry={geo.upper} material={stone} />
      <mesh material={stone} geometry={terraceSlab} />
      {/* the capstone: faintly violet, the colour of Dzego's halls of power */}
      <mesh position={[0, apex - 4.6, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[(9.2 / P.slope) * Math.SQRT2 * 1.04, 9.4, 4]} />
        <meshStandardMaterial color="#6d5a8c" emissive="#a98bff" emissiveIntensity={0.55} roughness={0.35} metalness={0.4} />
      </mesh>
      {/* the ramp (ch18), laid on the face, with a low wall each side */}
      <mesh geometry={ramp} material={stairStone} receiveShadow />
      {/* the fires at the gate light the face above it, warm, fading up into the night */}
      <mesh position={[0, 24, faceZ(24) + 0.4]} rotation={[-tilt, 0, 0]}>
        <planeGeometry args={[70, 60]} />
        <primitive object={wash} attach="material" />
      </mesh>
      <sprite position={[0, apex - 3, 0]} scale={[46, 46, 1]}>
        <spriteMaterial map={halo} color="#b89cff" transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
      <instancedMesh ref={lamps} args={[undefined, undefined, 40]}>
        <boxGeometry args={[0.7, 0.9, 0.7]} />
        <meshBasicMaterial color={new THREE.Color("#ffc988").multiplyScalar(2.4)} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

/** The paved plaza before the gate and the walk leading to it, a step up from the grass, with a kerb along each side. */
function Paving() {
  const paving = useMemo(() => stoneMaterial({ a: "#aaa1a6", b: "#857c84", mortar: "#4b454c", brick: [1.5, 0.75], moss: 0.18 }), []);
  const kerb = useMemo(() => stoneMaterial({ a: "#bdb4b8", b: "#978d95", brick: [1.2, 0.4], moss: 0.25 }), []);
  const walk = WALK.end - WALK.plaza;
  return (
    <group>
      <mesh material={paving} position={[0, 0.1, WALK.plaza / 2 - 4]} receiveShadow>
        <boxGeometry args={[PORTAL.half * 2 + 6, 0.4, WALK.plaza + 8]} />
      </mesh>
      <mesh material={paving} position={[0, 0.06, WALK.plaza + walk / 2]} receiveShadow>
        <boxGeometry args={[WALK.half * 2, 0.32, walk]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} material={kerb} position={[s * (WALK.half + 0.25), 0.14, WALK.plaza + walk / 2]} receiveShadow castShadow>
          <boxGeometry args={[0.5, 0.42, walk]} />
        </mesh>
      ))}
      {/* the plaza's edge: a long low step on each side */}
      {[-1, 1].map((s) => (
        <mesh key={s} material={kerb} position={[s * (PORTAL.half + 3), 0.2, WALK.plaza / 2 - 4]} receiveShadow castShadow>
          <boxGeometry args={[0.8, 0.6, WALK.plaza + 8]} />
        </mesh>
      ))}
    </group>
  );
}

/** Far ridges all around, dark under the night sky, so the land never ends in nothing. */
function Ridges() {
  const geometry = useMemo(() => {
    const n = simplex2(97);
    const g = new THREE.CylinderGeometry(1, 1, 1, 480, 6, true);
    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const lo = new THREE.Color("#0b0f1c");
    const hi = new THREE.Color("#1d2440");
    for (let i = 0; i < pos.count; i++) {
      const a = Math.atan2(pos.getZ(i), pos.getX(i));
      const v = pos.getY(i) + 0.5;
      const ridge = Math.pow(0.5 + 0.5 * fbm(n, Math.cos(a) * 2.4, Math.sin(a) * 2.4, 6), 1.5);
      const r = 520 - v * 60;
      pos.setXYZ(i, Math.cos(a) * r, (20 + ridge * 110) * v - 8, Math.sin(a) * r);
      const c = lo.clone().lerp(hi, Math.pow(v, 0.8));
      colors.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return g;
  }, []);
  return (
    <mesh geometry={geometry} position={[0, 0, P.z / 2]}>
      <meshBasicMaterial vertexColors side={THREE.DoubleSide} fog={false} />
    </mesh>
  );
}

/** Night mist lying low along the pyramid's foot: it sets the mountain back from the trees in front of it. */
function Mist() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        fog: false,
        uniforms: { uTime: weather.time },
        vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: `uniform float uTime; varying vec2 vUv;
          void main() {
            float drift = 0.85 + 0.15 * sin(vUv.x * 23.0 + uTime * 0.15) * sin(vUv.x * 9.0 - uTime * 0.1);
            float a = pow(1.0 - vUv.y, 2.2) * smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x) * 0.42 * drift;
            gl_FragColor = vec4(vec3(0.42, 0.48, 0.68), a);
          }`,
      }),
    [],
  );
  return (
    <mesh position={[0, 12, FRONT + 0.6]} material={material}>
      <planeGeometry args={[520, 30]} />
    </mesh>
  );
}

const DEMO_RIDDLE = { state: "open" as RiddleState, solved: ["The count", "The courtyard", "The lock"] };

/** Plaque places in the gate's wall: the lower row first, from the door outwards, left and right in turn. */
const SLOTS = [3.6, 9.4].flatMap((y) => [10.4, 14.6].flatMap((x) => [-1, 1].map((s) => ({ x: s * x, y }))));

function MountainPyramid({ live }: SetProps) {
  const land = useLand();
  const riddle = live.riddle ?? DEMO_RIDDLE;
  return (
    <group>
      <Ground land={land} />
      <Grass land={land} count={48000} />
      <Woods land={land} />
      <Ridges />
      <Pyramid />
      <Mist />
      <Paving />
      <group position={[0, 0.3, 0]}>
        <Portal state={riddle.state} />
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 6.4, 0, 2.2]}>
            <Brazier seed={s * 5} />
          </group>
        ))}
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 7.9, 12.4, 0.5]}>
            <Sconce />
          </group>
        ))}
        <Plaques solved={riddle.solved} slots={SLOTS} />
        <group position={[CIRCLE[0], 0, CIRCLE[1]]}>
          <GreenCircle />
        </group>
        <PathLights x={WALK.half - 0.7} from={CIRCLE[1] + 3} to={WALK.end - 6} step={3.6} />
      </group>
      <Fireflies box={[-40, WALK.plaza, 40, 250]} />
    </group>
  );
}

/** Stop 7: the pyramid's sealed door at night (the riddle). */
export const pyramidSet: SetModule = {
  id: "pyramid",
  origin: [0, 0, -3500],
  hour: 21.5,
  poses: {
    arrive: { position: [-4, 7, 240], target: [0, 62, -40] },
    riddle: { position: [-6, 5, 62], target: [10, 16, 0] },
  },
  Scene: MountainPyramid,
};
