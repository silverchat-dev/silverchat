"use client";

/**
 * The riddle's door (ch4, ch9): a tall stone portal at the foot of the pyramid, an arched brick door in it, the
 * corridor's own shape (square below, a half circle above), bronze leaves with a round seal where they meet, and the
 * clashing fists of Minpentai carved over it. A plaque stands along the walk for each riddle solved, lit from within;
 * the empty ones wait in the dark. The door shows the riddle's state: sealed and dark (closed), light leaking round its
 * edges (open), or standing ajar with warm light pouring out (solved).
 */
import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { stoneMaterial, weather } from "../../kit/materials";
import { Embers } from "../room";
import { Fire, FireLight } from "./life";
import { moonlit, polished } from "./polish";
import { fistsTexture, plaqueTexture, sealTexture } from "./signs";

export const TAP_GREEN = "#38ff86";

/** The door opening: half width, the height where the arch starts, and so the top at spring + half width. */
export const DOOR = { half: 3.2, spring: 6 };
/** The portal block: its front face at z = 0, its width and height. */
export const PORTAL = { half: 17, height: 25, depth: 7 };

export type RiddleState = "open" | "solved" | "closed";

/** The corridor shape: straight sides to `spring`, then a half circle. */
function archShape(half: number, spring: number) {
  const s = new THREE.Shape();
  s.moveTo(-half, 0);
  s.lineTo(-half, spring);
  s.absarc(0, spring, half, Math.PI, 0, true);
  s.lineTo(half, 0);
  s.lineTo(-half, 0);
  return s;
}

function archPath(half: number, spring: number) {
  const p = new THREE.Path();
  p.moveTo(-half, 0);
  p.lineTo(-half, spring);
  p.absarc(0, spring, half, Math.PI, 0, true);
  p.lineTo(half, 0);
  p.lineTo(-half, 0);
  return p;
}

/** One door leaf, the left one (the right is its mirror): flat edge at x = 0, hinge at x = -half. */
function leafShape(half: number, spring: number) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(half, 0);
  s.lineTo(half, spring + half);
  s.absarc(half, spring, half, Math.PI / 2, Math.PI, false);
  s.lineTo(0, 0);
  return s;
}

const SEAL_Y = 4.6;
const SEAL_R = 1.35;

/** A bronze leaf with studs in rows, three bands and half of the seal. `side` -1 is the left leaf, 1 the right. */
function Leaf({ side, open, sealMat, bronze }: { side: -1 | 1; open: React.RefObject<number>; sealMat: THREE.Material; bronze: THREE.Material }) {
  const half = DOOR.half - 0.06;
  const geometry = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(leafShape(half - 0.04, DOOR.spring), { depth: 0.34, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 1, curveSegments: 24 });
    // the shape's hinge is at x = 0: flip it so the left leaf runs from its hinge to the middle
    g.translate(0, 0, -0.17);
    return g;
  }, [half]);
  const bands = useMemo(() => mergeGeometries([1.2, 3.0, 7.6].map((y) => new THREE.BoxGeometry(half - 0.3, 0.16, 0.08).translate((half - 0.04) / 2, y, 0.21)))!, [half]);
  const group = useRef<THREE.Group>(null);
  const studs = useRef<THREE.InstancedMesh>(null);
  const studSpots = useMemo(() => {
    const out: [number, number][] = [];
    for (let row = 0; row < 9; row++) for (let col = 0; col < 4; col++) out.push([0.45 + col * 0.72, 0.55 + row * 0.82]);
    return out.filter(([x, y]) => Math.hypot(x - (half - 0.04), y - SEAL_Y) > SEAL_R + 0.35 && (y < DOOR.spring || Math.hypot(x - (half - 0.04), y - DOOR.spring) < half - 0.5));
  }, [half]);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    studSpots.forEach(([x, y], i) => studs.current!.setMatrixAt(i, m.makeTranslation(x, y, 0.2)));
    studs.current!.instanceMatrix.needsUpdate = true;
  }, [studSpots]);
  useFrame(() => {
    // the hinge is at the outer edge; a leaf swings in, away from the walk
    if (group.current) group.current.rotation.y = -side * (open.current ?? 0) * 1.45;
  });
  return (
    <group ref={group} position={[side * half, 0, 0]}>
      <group scale={[-side, 1, 1]}>
        <mesh geometry={geometry} material={bronze} castShadow receiveShadow />
        <instancedMesh ref={studs} args={[undefined, bronze, studSpots.length]}>
          <sphereGeometry args={[0.1, 10, 6]} />
        </instancedMesh>
        <mesh geometry={bands} material={bronze} />
        {/* half of the seal, unmirrored: the circle's own UVs keep each half's picture on its own leaf */}
        <mesh position={[half - 0.04, SEAL_Y, 0.26]} scale={[-side, 1, 1]} material={sealMat}>
          <circleGeometry args={[SEAL_R, 48, side < 0 ? Math.PI / 2 : -Math.PI / 2, Math.PI]} />
        </mesh>
        <mesh position={[half - 0.04, SEAL_Y, 0.26]} rotation={[0, 0, Math.PI / 2]} material={bronze}>
          <torusGeometry args={[SEAL_R + 0.06, 0.09, 8, 40, Math.PI]} />
        </mesh>
      </group>
    </group>
  );
}

/** How far the door stands open and how much light is behind it, for each state. */
const LOOK: Record<RiddleState, { open: number; light: number; seal: number; leak: number }> = {
  closed: { open: 0, light: 0.04, seal: 0.12, leak: 0 },
  open: { open: 0, light: 1.5, seal: 1, leak: 2.4 },
  solved: { open: 1, light: 2.8, seal: 0.6, leak: 0 },
};
/** the leaves stand a little way into the opening */
const LEAVES_Z = -1.1;
/** how far the light from the door can reach over the paving */
const SPILL = 17;

/** The portal, its door and everything carved on it. */
export function Portal({ state }: { state: RiddleState }) {
  // the gate takes little of the day sky's light, so the fires light it and its top goes into the night
  const stone = useMemo(() => moonlit(polished(stoneMaterial({ a: "#d0c8cc", b: "#bab0b6", mortar: "#9a9097", brick: [4.6, 1.75], moss: 0.06 }), 0.45), 0.4), []);
  const brick = useMemo(() => stoneMaterial({ a: "#b35d3c", b: "#86402b", mortar: "#4b3a33", brick: [0.6, 0.24], moss: 0.05 }), []);
  const bronze = useMemo(() => new THREE.MeshStandardMaterial({ color: "#6e4a2c", metalness: 0.55, roughness: 0.42 }), []);
  const seal = useMemo(() => {
    const t = sealTexture();
    return new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: "#ffc477", emissiveIntensity: 1, metalness: 0.5, roughness: 0.4 });
  }, []);
  const fists = useMemo(() => {
    const t = fistsTexture();
    return new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: "#ffd28a", emissiveIntensity: 0.32, roughness: 0.55 });
  }, []);
  const outer = DOOR.half + 1.4;
  const geo = useMemo(() => {
    const { half: H, height, depth } = PORTAL;
    const face = new THREE.Shape();
    face.moveTo(-H, 0);
    face.lineTo(-H, height);
    face.lineTo(H, height);
    face.lineTo(H, 0);
    face.lineTo(-H, 0);
    face.holes.push(archPath(outer, DOOR.spring));
    const front = new THREE.ExtrudeGeometry(face, { depth, bevelEnabled: false, curveSegments: 32 });
    front.translate(0, 0, -depth);
    // the brick door frame lines the whole depth of the opening, and stands a little proud of the face
    const ring = archShape(outer, DOOR.spring);
    ring.holes.push(archPath(DOOR.half, DOOR.spring));
    const frame = new THREE.ExtrudeGeometry(ring, { depth: depth + 0.35, bevelEnabled: false, curveSegments: 32 });
    frame.translate(0, 0, -depth);
    const glow = new THREE.ShapeGeometry(archShape(DOOR.half, DOOR.spring), 32);
    const edge = archShape(DOOR.half - 0.02, DOOR.spring);
    edge.holes.push(archPath(DOOR.half - 0.16, DOOR.spring));
    const leak = new THREE.ShapeGeometry(edge, 48);
    const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
    const blocks = mergeGeometries([
      box(H * 2, height, 28, 0, height / 2, -depth - 14),
      box(H * 2 + 1.6, 1, 4.4, 0, height + 0.5, -2),
      box(H * 2 + 0.8, 0.5, 4, 0, height - 0.45, -1.8),
      // the base course stops at the door frame on each side
      ...[-1, 1].map((s) => box(H + 0.4 - outer, 1, 2.4, s * (outer + (H + 0.4 - outer) / 2), 0.5, -1)),
      ...[-1, 1].map((s) => box(1.6, height, 0.5, s * (outer + 2.6), height / 2, 0.25)),
    ])!;
    // the shaft: the door's outline at the door, a wide low patch far out on the paving; its sides and top joined
    const near = [[-DOOR.half, 0], [DOOR.half, 0], [DOOR.half, DOOR.spring], [0, DOOR.spring + DOOR.half], [-DOOR.half, DOOR.spring]];
    const far = [[-5.4, 0], [5.4, 0], [5.6, 0.5], [0, 0.7], [-5.6, 0.5]];
    const pos: number[] = [];
    const t: number[] = [];
    for (let i = 0; i < near.length; i++) {
      const j = (i + 1) % near.length;
      if (i === 0) continue; // the floor side stays open: the pool on the paving is the spill
      const a = [near[i][0], near[i][1], LEAVES_Z];
      const b = [near[j][0], near[j][1], LEAVES_Z];
      const c = [far[j][0], far[j][1], LEAVES_Z + SPILL * 0.8];
      const d = [far[i][0], far[i][1], LEAVES_Z + SPILL * 0.8];
      pos.push(...a, ...b, ...c, ...a, ...c, ...d);
      t.push(0, 0, 1, 0, 1, 1);
    }
    const beam = new THREE.BufferGeometry();
    beam.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    beam.setAttribute("aT", new THREE.Float32BufferAttribute(t, 1));
    beam.computeVertexNormals();
    return { front, frame, glow, leak, blocks, beam };
  }, [outer]);
  const open = useRef(0);
  const light = useRef<THREE.MeshBasicMaterial>(null);
  const leak = useRef<THREE.MeshBasicMaterial>(null);
  const seam = useRef<THREE.MeshBasicMaterial>(null);
  const spill = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uAmount: { value: 0 }, uReach: { value: 0.4 } },
        vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        // a fan of warm light from the foot of the door, fading with distance and to the sides
        // uReach: how far out it runs, a short glow under a sealed door, the length of the plaza when it opens
        fragmentShader: `uniform float uAmount; uniform float uReach; varying vec2 vUv;
          void main() {
            float d = (1.0 - vUv.y) / uReach;
            float w = (vUv.x - 0.5) * 2.0 * 2.6;
            float fan = exp(-pow(w / (0.62 + d * 0.9), 4.0)) * pow(clamp(1.0 - d, 0.0, 1.0), 1.4);
            gl_FragColor = vec4(vec3(1.0, 0.62, 0.3) * fan * uAmount, 1.0);
          }`,
      }),
    [],
  );
  const beam = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { uAmount: { value: 0 } },
        vertexShader: `attribute float aT; varying float vT; varying vec3 vN; varying vec3 vV;
          void main() {
            vT = aT;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vN = normalize(normalMatrix * normal);
            vV = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }`,
        // faded where its sides are seen edge on, so it has no hard outline and reads as lit air, not a sheet
        fragmentShader: `uniform float uAmount; varying float vT; varying vec3 vN; varying vec3 vV;
          void main() {
            float glance = 1.0 - abs(dot(normalize(vN), normalize(vV)));
            float a = pow(1.0 - vT, 1.3) * 0.24 * (1.0 - glance * glance) * uAmount;
            gl_FragColor = vec4(vec3(1.0, 0.7, 0.38) * a, 1.0);
          }`,
      }),
    [],
  );
  const lamp = useRef<THREE.PointLight>(null);
  useFrame((_, dt) => {
    const want = LOOK[state];
    open.current += (want.open - open.current) * Math.min(1, dt * 1.5);
    const t = weather.time.value;
    const breath = 0.85 + 0.15 * Math.sin(t * 1.3);
    if (light.current) light.current.color.setRGB(1, 0.72, 0.4).multiplyScalar(want.light * breath);
    const edge = want.leak * breath * (1 - open.current);
    leak.current?.color.setRGB(1, 0.74, 0.42).multiplyScalar(edge);
    seam.current?.color.setRGB(1, 0.74, 0.42).multiplyScalar(edge * 1.4);
    spill.uniforms.uAmount.value = (edge * 0.5 + open.current * 3.2) * breath;
    spill.uniforms.uReach.value = 0.22 + 0.78 * open.current;
    beam.uniforms.uAmount.value = open.current * breath;
    seal.emissiveIntensity = want.seal * (state === "open" ? 0.75 + 0.35 * Math.sin(t * 1.3) : 1);
    if (lamp.current) lamp.current.intensity = 70 * open.current * breath;
  });
  return (
    <group>
      <mesh geometry={geo.front} material={stone} castShadow receiveShadow />
      {/* the mass of the gate block running back into the pyramid, its cornice, base course and pilasters */}
      <mesh geometry={geo.blocks} material={stone} castShadow receiveShadow />
      <mesh geometry={geo.frame} material={brick} castShadow receiveShadow />
      {/* the clashing fists in a panel over the door */}
      <mesh material={fists} position={[0, DOOR.spring + outer + 3.2, 0.03]}>
        <planeGeometry args={[5.6, 4.2]} />
      </mesh>
      {/* the light behind the door: it shows round the leaves' edges, or pours out when they open */}
      <mesh geometry={geo.glow} position={[0, 0, -PORTAL.depth + 0.05]}>
        <meshBasicMaterial ref={light} toneMapped={false} />
      </mesh>
      {/* only an open door lights the plaza: a light costs every lit surface, so it is not kept on at zero */}
      {state === "solved" && <pointLight ref={lamp} position={[0, 3.5, 4]} color="#ffb565" distance={30} decay={1.4} />}
      <group position={[0, 0, LEAVES_Z]}>
        <Leaf side={-1} open={open} sealMat={seal} bronze={bronze} />
        <Leaf side={1} open={open} sealMat={seal} bronze={bronze} />
      </group>
      {/* light leaking round the leaves' edges and up the seam between them */}
      <group position={[0, 0, LEAVES_Z + 0.24]}>
        <mesh geometry={geo.leak}>
          <meshBasicMaterial ref={leak} toneMapped={false} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
        <mesh position={[0, (DOOR.spring + DOOR.half) / 2, 0]}>
          <planeGeometry args={[0.07, DOOR.spring + DOOR.half - 0.1]} />
          <meshBasicMaterial ref={seam} toneMapped={false} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      </group>
      {/* and spilling over the floor in front */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, LEAVES_Z + SPILL / 2]}>
        <planeGeometry args={[DOOR.half * 5.2, SPILL]} />
        <primitive object={spill} attach="material" />
      </mesh>
      {/* when the door stands open, a shaft of light falls out of the corridor and down across the paving */}
      <mesh geometry={geo.beam} material={beam} frustumCulled={false} />
    </group>
  );
}

const STILL = { current: 0 };

/** A tall bronze brazier on a stone foot, burning. */
export function Brazier({ seed }: { seed: number }) {
  const stone = useMemo(() => stoneMaterial({ a: "#c8bfbc", b: "#a1979a", brick: [0.7, 0.4], moss: 0.1 }), []);
  const foot = useMemo(
    () =>
      new THREE.LatheGeometry(
        [[0, 0], [0.95, 0], [0.95, 0.25], [0.6, 0.4], [0.38, 0.6], [0.32, 2.0], [0.5, 2.2], [0.6, 2.3], [0, 2.3]].map(([x, y]) => new THREE.Vector2(x, y)),
        40,
      ),
    [],
  );
  const bowl = useMemo(
    () =>
      new THREE.LatheGeometry(
        Array.from({ length: 12 }, (_, i) => {
          const t = i / 11;
          return new THREE.Vector2(0.2 + Math.sin(t * Math.PI * 0.5) * 1.0, t * 0.6);
        }).concat([new THREE.Vector2(1.26, 0.62), new THREE.Vector2(1.16, 0.62)]),
        48,
      ),
    [],
  );
  const coals = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(() => {
    if (coals.current) coals.current.emissiveIntensity = 2.4 + Math.sin(weather.time.value * 3.1 + seed) * 0.4;
  });
  return (
    <group>
      <mesh geometry={foot} material={stone} castShadow receiveShadow />
      <mesh geometry={bowl} position={[0, 2.25, 0]} castShadow>
        <meshStandardMaterial color="#8a5a33" metalness={0.7} roughness={0.35} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 2.75, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.08, 32]} />
        <meshStandardMaterial ref={coals} color="#3a1a0c" emissive="#ff6a1f" emissiveIntensity={2.4} toneMapped={false} />
      </mesh>
      <group position={[0, 2.7, 0]}>
        <Fire size={1.5} />
      </group>
      <group position={[0, 1.6, 0]}>
        <Embers burst={STILL} />
      </group>
      <group position={[0, 4.2, 0]}>
        <FireLight intensity={42} distance={34} seed={seed} />
      </group>
    </group>
  );
}

/** A small iron sconce on the wall with a flame in it; no light of its own, the braziers light the walls. */
export function Sconce() {
  return (
    <group>
      <mesh position={[0, 0, 0.3]} castShadow>
        <boxGeometry args={[0.16, 0.9, 0.16]} />
        <meshStandardMaterial color="#2b2420" roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh position={[0, 0.5, 0.42]} castShadow>
        <cylinderGeometry args={[0.32, 0.16, 0.36, 12, 1, true]} />
        <meshStandardMaterial color="#2b2420" roughness={0.6} metalness={0.4} side={THREE.DoubleSide} />
      </mesh>
      <group position={[0, 0.6, 0.42]}>
        <Fire size={0.55} />
      </group>
    </group>
  );
}

/**
 * The plaques: stone slabs set in the gate's wall on both sides of the door, filled in order (the lower row first,
 * from the door outwards, left and right in turn). A solved riddle's plaque is lit from within, its number and name
 * cut into it; the rest wait, dark, for the riddles still to come.
 */
/** how much bigger than a person-sized slab: they have to read from down the walk */
const PLAQUE = 1.3;

export function Plaques({ solved, slots }: { solved: string[]; slots: { x: number; y: number }[] }) {
  const stone = useMemo(() => moonlit(stoneMaterial({ a: "#cfc5c2", b: "#a89ea0", brick: [0.9, 0.5], moss: 0.08 }), 0.4), []);
  const slab = useMemo(
    () =>
      mergeGeometries([
        new THREE.BoxGeometry(2.5, 3.9, 0.36).translate(0, 0, 0.18),
        new THREE.BoxGeometry(2.8, 0.26, 0.56).translate(0, 2.06, 0.28),
        new THREE.BoxGeometry(2.8, 0.26, 0.6).translate(0, -2.06, 0.3),
      ])!.scale(PLAQUE, PLAQUE, 1),
    [],
  );
  const blank = useMemo(() => new THREE.BoxGeometry(1.92 * PLAQUE, 3.08 * PLAQUE, 0.02).translate(0, 0, 0.37), []);
  // the newest solved riddles, when there are more than slots
  const shown = solved.slice(-slots.length);
  const first = solved.length - shown.length;
  // the names are the key: a new list redraws the faces, and the old ones are freed
  const names = shown.join("\n");
  const faces = useMemo(
    () =>
      names.split("\n").filter(Boolean).map((name, i) => {
        const t = plaqueTexture(first + i + 1, name);
        return new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: "#ffffff", emissiveIntensity: 1.35, roughness: 0.6 });
      }),
    [names, first],
  );
  useEffect(() => () => faces.forEach((m) => (m.map?.dispose(), m.dispose())), [faces]);
  const stones = useRef<THREE.InstancedMesh>(null);
  const blanks = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    let k = 0;
    slots.forEach(({ x, y }, i) => {
      stones.current!.setMatrixAt(i, m.makeTranslation(x, y, 0));
      if (i >= shown.length) blanks.current!.setMatrixAt(k++, m.makeTranslation(x, y, 0));
    });
    stones.current!.instanceMatrix.needsUpdate = true;
    blanks.current!.count = k;
    blanks.current!.instanceMatrix.needsUpdate = true;
  }, [slots, shown.length]);
  return (
    <>
      <instancedMesh ref={stones} args={[slab, stone, slots.length]} castShadow receiveShadow />
      {/* the waiting plaques: dark, nothing cut in them yet */}
      <instancedMesh ref={blanks} args={[blank, undefined, slots.length]}>
        <meshStandardMaterial color="#2c2833" roughness={0.8} />
      </instancedMesh>
      {slots.slice(0, shown.length).map(({ x, y }, i) => (
        <mesh key={i} material={faces[i]} position={[x, y, 0.38]}>
          <planeGeometry args={[1.92 * PLAQUE, 3.08 * PLAQUE]} />
        </mesh>
      ))}
    </>
  );
}

/** The green circle in the paving in front of the door: the one place to act. */
export function GreenCircle() {
  const ring = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(() => {
    if (ring.current) ring.current.emissiveIntensity = 2.4 + Math.sin(weather.time.value * 2.2) * 0.6;
  });
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[1.6, 2.0, 96]} />
        <meshStandardMaterial ref={ring} color="#0f2a18" emissive={TAP_GREEN} emissiveIntensity={2.4} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
        <circleGeometry args={[1.6, 64]} />
        <meshStandardMaterial color="#13261a" emissive={TAP_GREEN} emissiveIntensity={0.18} roughness={0.4} />
      </mesh>
    </group>
  );
}
