"use client";

/**
 * The busy road below and what crosses it: the road between its stone walls, autobuses and delivery vans that never
 * stop, the sky bridge on one stone arch, and the straight staircase that climbs from its far end to the tower.
 */
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { stoneMaterial, weather } from "../../kit/materials";
import { rng } from "../../kit/noise";
import { RAMP, ROAD, STAIR, WALL, stairY } from "./land";

/** The road, its kerbs and pavements, and the retaining walls that hold the banks back. */
export function Road() {
  const paving = useMemo(() => stoneMaterial({ a: "#cfc6b4", b: "#a99f8c", mortar: "#7d756a", brick: [0.9, 0.6], moss: 0.05 }), []);
  const wall = useMemo(() => stoneMaterial({ a: "#bfb197", b: "#8f8471", brick: [1.1, 0.42], moss: 0.75 }), []);
  const dashes = useRef<THREE.InstancedMesh>(null);
  const DASHES = Math.floor(ROAD.length / 9);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    for (let i = 0; i < DASHES; i++) {
      m.makeTranslation(-ROAD.length / 2 + i * 9, 0.035, 0);
      dashes.current!.setMatrixAt(i, m);
    }
    dashes.current!.instanceMatrix.needsUpdate = true;
  }, [DASHES]);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]} receiveShadow>
        <planeGeometry args={[ROAD.length, ROAD.half * 2]} />
        <meshStandardMaterial color="#5e5b57" roughness={0.92} />
      </mesh>
      <instancedMesh ref={dashes} args={[undefined, undefined, DASHES]} rotation-x={0}>
        <boxGeometry args={[4, 0.02, 0.2]} />
        <meshStandardMaterial color="#efe8d6" roughness={0.8} />
      </instancedMesh>
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[0, 0.035, s * (ROAD.half - 0.45)]}>
            <boxGeometry args={[ROAD.length, 0.02, 0.18]} />
            <meshStandardMaterial color="#efe8d6" roughness={0.8} />
          </mesh>
          <mesh material={paving} position={[0, 0.1, s * (ROAD.half + (WALL.z - ROAD.half) / 2)]} receiveShadow>
            <boxGeometry args={[ROAD.length, 0.2, WALL.z - ROAD.half]} />
          </mesh>
          <mesh material={wall} position={[0, (s > 0 ? WALL.near : WALL.height) / 2 - 0.5, s * (WALL.z + 0.45)]} castShadow receiveShadow>
            <boxGeometry args={[ROAD.length, (s > 0 ? WALL.near : WALL.height) + 1, 0.9]} />
          </mesh>
          <mesh material={paving} position={[0, (s > 0 ? WALL.near : WALL.height) + 0.08, s * (WALL.z + 0.45)]} castShadow>
            <boxGeometry args={[ROAD.length, 0.2, 1.15]} />
          </mesh>
        </group>
      ))}
      <StreetLamps />
    </group>
  );
}

/** Lamp posts along both pavements: tall dark posts with a warm head. */
function StreetLamps() {
  const posts = useRef<THREE.InstancedMesh>(null);
  const heads = useRef<THREE.InstancedMesh>(null);
  const spots = useMemo(() => {
    const out: [number, number][] = [];
    for (let x = -ROAD.length / 2 + 20; x < ROAD.length / 2; x += 34) out.push([x, ROAD.half + 1.4], [x + 17, -ROAD.half - 1.4]);
    return out;
  }, []);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    spots.forEach(([x, z], i) => {
      m.makeTranslation(x, 2.6, z);
      posts.current!.setMatrixAt(i, m);
      m.makeTranslation(x, 5.25, z);
      heads.current!.setMatrixAt(i, m);
    });
    posts.current!.instanceMatrix.needsUpdate = true;
    heads.current!.instanceMatrix.needsUpdate = true;
  }, [spots]);
  return (
    <>
      <instancedMesh ref={posts} args={[undefined, undefined, spots.length]} castShadow>
        <cylinderGeometry args={[0.08, 0.13, 5.2, 6]} />
        <meshStandardMaterial color="#2e3433" roughness={0.6} metalness={0.4} />
      </instancedMesh>
      <instancedMesh ref={heads} args={[undefined, undefined, spots.length]}>
        <sphereGeometry args={[0.28, 12, 8]} />
        <meshStandardMaterial color="#fff1d0" emissive="#ffc47a" emissiveIntensity={0.8} />
      </instancedMesh>
    </>
  );
}

type Vehicle = { lane: number; x0: number; speed: number; bus: boolean; colour: string; stripe: string };

/**
 * Autobuses and delivery vans going both ways. Each is a rounded body, a band of dark glass, a painted band (the
 * buses carry the yellow and green Hydrafill ads, ch. 1) and four wheels, all instanced and moved every frame.
 */
export function Traffic() {
  const vehicles = useMemo<Vehicle[]>(() => {
    const r = rng(23);
    const out: Vehicle[] = [];
    for (const lane of [1, -1])
      for (let i = 0; i < 10; i++) {
        const bus = i % 3 === 0;
        out.push({
          lane,
          x0: i * (ROAD.length / 10) + r() * 25,
          speed: bus ? 9 + r() * 2 : 12 + r() * 4,
          bus,
          colour: bus ? ["#e9e3d3", "#d9e4ea"][i % 2] : ["#f2efe8", "#c9d6df", "#e8d9bd", "#b9c7b4"][Math.floor(r() * 4)],
          stripe: bus ? "#f2c230" : ["#5aa0c8", "#d0643f", "#7c6aa8"][Math.floor(r() * 3)],
        });
      }
    return out;
  }, []);
  const body = useRef<THREE.InstancedMesh>(null);
  const glass = useRef<THREE.InstancedMesh>(null);
  const stripe = useRef<THREE.InstancedMesh>(null);
  const green = useRef<THREE.InstancedMesh>(null);
  const wheels = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new RoundedBoxGeometry(1, 1, 1, 2, 0.14), []);
  const wheel = useMemo(() => new THREE.CylinderGeometry(0.5, 0.5, 0.36, 14).rotateX(Math.PI / 2), []);
  useLayoutEffect(() => {
    const c = new THREE.Color();
    vehicles.forEach((v, i) => {
      body.current!.setColorAt(i, c.set(v.colour));
      stripe.current!.setColorAt(i, c.set(v.stripe));
    });
    body.current!.instanceColor!.needsUpdate = true;
    stripe.current!.instanceColor!.needsUpdate = true;
  }, [vehicles]);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const p = useMemo(() => new THREE.Vector3(), []);
  const s = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const t = weather.time.value;
    const L = ROAD.length - 40;
    vehicles.forEach((v, i) => {
      const len = v.bus ? 12 : 5.6;
      const h = v.bus ? 3.1 : 2.5;
      const w = v.bus ? 2.55 : 2.1;
      // a lane is a loop: each vehicle runs its length of road and comes round again
      const x = ((((v.x0 + v.speed * t) % L) + L) % L - L / 2) * -v.lane;
      const z = v.lane * 3.5;
      const bob = Math.sin(t * 5 + i) * 0.02;
      q.identity();
      m.compose(p.set(x, 0.42 + h / 2 + bob, z), q, s.set(len, h, w));
      body.current!.setMatrixAt(i, m);
      m.compose(p.set(x, 0.42 + h * (v.bus ? 0.68 : 0.72), z), q, s.set(len - (v.bus ? 0.5 : 1.2), h * 0.3, w + 0.04));
      glass.current!.setMatrixAt(i, m);
      m.compose(p.set(x - (v.bus ? 0 : 0.6 * v.lane), 0.42 + h * 0.36, z), q, s.set(v.bus ? len * 0.62 : len * 0.5, h * 0.18, w + 0.05));
      stripe.current!.setMatrixAt(i, m);
      // the Hydrafill bottle's green beside the yellow on each bus; a small mark on the vans
      m.compose(p.set(x + len * 0.36 * (v.bus ? 1 : 0), 0.42 + h * 0.36, z), q, s.set(v.bus ? len * 0.12 : 0.001, h * 0.18, w + 0.06));
      green.current!.setMatrixAt(i, m);
      for (let k = 0; k < 4; k++) {
        const wx = x + (k < 2 ? -1 : 1) * len * 0.33;
        const wz = z + (k % 2 ? -1 : 1) * (w / 2 - 0.12);
        m.compose(p.set(wx, 0.5, wz), q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), (-t * v.speed * v.lane) / 0.5), s.set(1, 1, 1));
        wheels.current!.setMatrixAt(i * 4 + k, m);
        q.identity();
      }
    });
    for (const mesh of [body, glass, stripe, green, wheels]) mesh.current!.instanceMatrix.needsUpdate = true;
  });
  const n = vehicles.length;
  return (
    <>
      <instancedMesh ref={body} args={[geometry, undefined, n]} castShadow receiveShadow frustumCulled={false}>
        <meshStandardMaterial roughness={0.45} metalness={0.1} />
      </instancedMesh>
      <instancedMesh ref={glass} args={[geometry, undefined, n]} frustumCulled={false}>
        <meshStandardMaterial color="#1d2b33" roughness={0.12} metalness={0.4} />
      </instancedMesh>
      <instancedMesh ref={stripe} args={[geometry, undefined, n]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={green} args={[geometry, undefined, n]} frustumCulled={false}>
        <meshStandardMaterial color="#3f9a4a" roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={wheels} args={[wheel, undefined, n * 4]} frustumCulled={false}>
        <meshStandardMaterial color="#232323" roughness={0.8} />
      </instancedMesh>
    </>
  );
}

export const BRIDGE = { half: 28, width: 4.6 };

/**
 * The deck's top at z: from the landing on the far side it rises to a gentle crown over the road, then runs down a
 * long ramp on the near side to the path, "smoothly, and suddenly" (ch. 1).
 */
export const deckY = (z: number) =>
  z < 0 ? 9 + 1.1 * (1 - Math.min(1, (z / BRIDGE.half) ** 2)) : 10.1 - (10.1 - RAMP.foot) * THREE.MathUtils.smoothstep(z, 0, RAMP.end);

/** samples of z from the far end of the bridge to the foot of the ramp */
const along = (count: number) => Array.from({ length: count + 1 }, (_, i) => -BRIDGE.half + (i / count) * (RAMP.end + BRIDGE.half));

/** A side profile, given as (z, y) points, extruded across the bridge and turned to run along z. */
function across(points: [number, number][], depth: number) {
  // drawn with x = -z, so that after the quarter turn it runs along +z
  const s = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(-z, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

/** The sky bridge: one stone arch over the road, a deck with parapets on a long ramp, and lanterns along it. */
export function SkyBridge() {
  const stone = useMemo(() => stoneMaterial({ a: "#d3c6aa", b: "#a39479", brick: [0.75, 0.34], moss: 0.4 }), []);
  const ringStone = useMemo(() => stoneMaterial({ a: "#e2d8c2", b: "#b9ab90", brick: [0.5, 0.5], moss: 0.2 }), []);
  const span = WALL.z + 0.9;
  const rise = 4.6;
  const geometry = useMemo(() => {
    const archY = (z: number) => WALL.height + rise * Math.sqrt(Math.max(0, 1 - (z / span) ** 2));
    const top = along(80).map((z) => [z, deckY(z)] as [number, number]);
    const arch = Array.from({ length: 41 }, (_, i) => span - (i / 40) * 2 * span).map((z) => [z, archY(z)] as [number, number]);
    return across(
      [[-BRIDGE.half, deckY(-BRIDGE.half) - 3], ...top, [RAMP.end, -0.5], [span, -0.5], [span, WALL.height - 0.6], ...arch, [-span, WALL.height - 0.6]],
      BRIDGE.width,
    );
  }, [span]);
  // the arch's ring of dressed stones, a little proud of the face and paler
  const ring = useMemo(() => {
    const R = span + 0.75;
    const outer = Array.from({ length: 49 }, (_, i) => R - (i / 48) * 2 * R).map((z) => [z, WALL.height + (rise + 0.75) * Math.sqrt(Math.max(0, 1 - (z / R) ** 2))] as [number, number]);
    const inner = Array.from({ length: 49 }, (_, i) => -span + (i / 48) * 2 * span).map((z) => [z, WALL.height + rise * Math.sqrt(Math.max(0, 1 - (z / span) ** 2))] as [number, number]);
    return across([...outer, ...inner], BRIDGE.width + 0.3);
  }, [span]);
  const parapet = useMemo(() => {
    const top = along(80).map((z) => [z, deckY(z) + 1.05] as [number, number]);
    const bottom = along(80).reverse().map((z) => [z, deckY(z) - 0.4] as [number, number]);
    return across([...top, ...bottom], 0.34);
  }, []);
  const cap = useMemo(() => {
    const pts = along(60).map((z) => new THREE.Vector3(0, deckY(z) + 1.08, z));
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.07, 6, false);
  }, []);
  const lamps = useMemo(
    () => [-24, -12, 12, 26, 40, 54].flatMap((z) => [-1, 1].map((sd) => new THREE.Vector3(sd * (BRIDGE.width / 2 - 0.1), deckY(z) + 1.05, z))),
    [],
  );
  return (
    <group>
      <mesh geometry={geometry} material={stone} castShadow receiveShadow />
      <mesh geometry={ring} material={ringStone} castShadow receiveShadow />
      {[-1, 1].map((sd) => (
        <group key={sd} position={[sd * (BRIDGE.width / 2 - 0.17), 0, 0]}>
          <mesh geometry={parapet} material={stone} castShadow receiveShadow />
          <mesh geometry={cap}>
            <meshStandardMaterial color="#8a6a3e" metalness={0.75} roughness={0.35} />
          </mesh>
        </group>
      ))}
      <Lamps spots={lamps} />
    </group>
  );
}

/** Small lanterns on posts, instanced: warm, never green. */
function Lamps({ spots }: { spots: THREE.Vector3[] }) {
  const post = useRef<THREE.InstancedMesh>(null);
  const glow = useRef<THREE.InstancedMesh>(null);
  const roof = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    spots.forEach((p, i) => {
      post.current!.setMatrixAt(i, m.makeTranslation(p.x, p.y + 0.55, p.z));
      glow.current!.setMatrixAt(i, m.makeTranslation(p.x, p.y + 1.25, p.z));
      roof.current!.setMatrixAt(i, m.makeTranslation(p.x, p.y + 1.48, p.z));
    });
    for (const r of [post, glow, roof]) r.current!.instanceMatrix.needsUpdate = true;
  }, [spots]);
  return (
    <>
      <instancedMesh ref={post} args={[undefined, undefined, spots.length]} castShadow>
        <cylinderGeometry args={[0.06, 0.08, 1.1, 6]} />
        <meshStandardMaterial color="#3a2a1c" roughness={0.8} />
      </instancedMesh>
      <instancedMesh ref={glow} args={[undefined, undefined, spots.length]}>
        <boxGeometry args={[0.26, 0.32, 0.26]} />
        <meshStandardMaterial color="#ffe2a8" emissive="#ffb35c" emissiveIntensity={1.6} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={roof} args={[undefined, undefined, spots.length]} castShadow>
        <coneGeometry args={[0.24, 0.16, 4]} />
        <meshStandardMaterial color="#3a2a1c" roughness={0.8} />
      </instancedMesh>
    </>
  );
}

/** The straight outdoor staircase from the bridge's far end up the spur to the tower (ch. 6). */
export function Staircase() {
  const stone = useMemo(() => stoneMaterial({ a: "#d0c3a6", b: "#a29378", brick: [0.7, 0.3], moss: 0.55 }), []);
  const steps = useMemo(() => {
    const rise = 0.24;
    const count = Math.round((STAIR.y1 - STAIR.y0) / rise);
    const run = (STAIR.z0 - STAIR.z1) / count;
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < count; i++) {
      const top = STAIR.y0 + (i + 1) * rise;
      const g = new THREE.BoxGeometry(STAIR.width, 3, run + 0.02);
      g.translate(STAIR.x, top - 1.5, STAIR.z0 - (i + 0.5) * run);
      parts.push(g);
    }
    return mergeGeometries(parts)!;
  }, []);
  // the side walls follow the slope a hand's height above the steps
  const side = useMemo(() => {
    // the shape is drawn with x = -z, so after the turn it runs along +z
    const s = new THREE.Shape();
    s.moveTo(-(STAIR.z0 + 1), STAIR.y0 - 3);
    s.lineTo(-(STAIR.z0 + 1), STAIR.y0 + 0.5);
    s.lineTo(-STAIR.z0, STAIR.y0 + 0.9);
    s.lineTo(-STAIR.z1, STAIR.y1 + 0.9);
    s.lineTo(-(STAIR.z1 - 0.6), STAIR.y1 + 0.9);
    s.lineTo(-(STAIR.z1 - 0.6), STAIR.y1 - 3);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.45, bevelEnabled: false });
    g.translate(0, 0, -0.225);
    g.rotateY(Math.PI / 2);
    return g;
  }, []);
  const lamps = useMemo(
    () => [0.15, 0.5, 0.85].flatMap((t) => [-1, 1].map((sd) => {
      const z = STAIR.z0 + (STAIR.z1 - STAIR.z0) * t;
      return new THREE.Vector3(STAIR.x + sd * (STAIR.width / 2 + 0.22), stairY(z) + 0.9, z);
    })),
    [],
  );
  return (
    <group>
      <mesh geometry={steps} material={stone} castShadow receiveShadow />
      {[-1, 1].map((sd) => (
        <mesh key={sd} geometry={side} material={stone} position={[STAIR.x + sd * (STAIR.width / 2 + 0.22), 0, 0]} castShadow receiveShadow />
      ))}
      <Lamps spots={lamps} />
    </group>
  );
}
