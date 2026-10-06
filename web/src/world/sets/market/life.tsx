"use client";

/**
 * What moves on Hun Min street: a courier robot rolling its trays of white boxes up and down the road (ch. 18),
 * steam from the chip factory's stack, and the wires strung across the street.
 */
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { weather } from "../../kit/materials";
import { rng } from "../../kit/noise";
import { catenary } from "./street";

/** A courier robot: a low cart on four wheels, a head with a smiling screen, trays of white boxes on its back. */
export function Courier({ x, z0, z1 }: { x: number; z0: number; z1: number }) {
  const group = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const heading = useRef(Math.PI);
  useFrame(() => {
    const t = weather.time.value * 0.055;
    const g = group.current;
    if (!g) return;
    const mid = (z0 + z1) / 2;
    const amp = (z1 - z0) / 2;
    g.position.set(x + Math.sin(t * 3.1) * 0.15, 0, mid + Math.sin(t) * amp);
    // face the way it rolls, turning round slowly at each end
    const want = Math.cos(t) > 0 ? 0 : Math.PI;
    heading.current += (want - heading.current) * 0.03;
    g.rotation.y = heading.current;
    g.position.y = Math.abs(Math.sin(weather.time.value * 9)) * 0.012;
    if (head.current) head.current.rotation.y = Math.sin(weather.time.value * 0.7) * 0.4;
  });
  // the repeated parts (wheels, trays, boxes) are merged, so the robot is a handful of draw calls
  const parts = useMemo(() => {
    const at = (g: THREE.BufferGeometry, x: number, y: number, z: number, rz = 0) => g.rotateZ(rz).translate(x, y, z);
    const wheels = [-0.42, 0.42].flatMap((wx) => [-0.5, 0.5].map((wz) => at(new THREE.CylinderGeometry(0.2, 0.2, 0.14, 16), wx, 0.2, wz, Math.PI / 2)));
    const trays = [0, 1, 2].map((k) => at(new THREE.BoxGeometry(0.8, 0.04, 1.0), 0, 0.72 + k * 0.24, -0.15));
    const boxes = [0, 1, 2].flatMap((k) => [-0.2, 0.2].flatMap((bx) => [-0.3, 0, 0.3].map((bz) => at(new THREE.BoxGeometry(0.34, 0.16, 0.26), bx, 0.82 + k * 0.24, bz - 0.15))));
    return { wheels: mergeGeometries(wheels)!, trays: mergeGeometries([...trays, at(new THREE.CylinderGeometry(0.07, 0.07, 0.8, 10), 0, 1.0, 0.55)])!, boxes: mergeGeometries(boxes)! };
  }, []);
  const shell = <meshStandardMaterial color="#efe8da" roughness={0.4} />;
  return (
    <group ref={group}>
      <mesh position={[0, 0.42, 0]} castShadow>
        <boxGeometry args={[0.95, 0.45, 1.5]} />
        {shell}
      </mesh>
      <mesh position={[0, 0.42, 0]}>
        <boxGeometry args={[0.97, 0.1, 1.52]} />
        <meshStandardMaterial color="#e0902a" roughness={0.6} />
      </mesh>
      <mesh geometry={parts.wheels} castShadow>
        <meshStandardMaterial color="#2b2a2e" roughness={0.8} />
      </mesh>
      {/* trays of white boxes */}
      <mesh geometry={parts.trays} castShadow>
        <meshStandardMaterial color="#8a8f96" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh geometry={parts.boxes} castShadow>
        <meshStandardMaterial color="#f6f4ef" roughness={0.5} />
      </mesh>
      <group ref={head} position={[0, 1.5, 0.55]}>
        <mesh castShadow>
          <sphereGeometry args={[0.3, 24, 18]} />
          {shell}
        </mesh>
        <mesh position={[0, 0.01, 0.255]}>
          <circleGeometry args={[0.17, 28]} />
          <meshStandardMaterial color="#1d2430" emissive="#9fe8ff" emissiveIntensity={0.3} roughness={0.2} />
        </mesh>
        {[-0.06, 0.06].map((ex) => (
          <mesh key={ex} position={[ex, 0.05, 0.27]}>
            <circleGeometry args={[0.022, 12]} />
            <meshBasicMaterial color="#e0fbff" />
          </mesh>
        ))}
        <mesh position={[0, -0.02, 0.27]} rotation={[0, 0, Math.PI]}>
          <torusGeometry args={[0.06, 0.012, 6, 16, Math.PI]} />
          <meshBasicMaterial color="#e0fbff" />
        </mesh>
      </group>
    </group>
  );
}

const PUFFS = 70;

/** Steam rising from the chip factory: soft puffs that swell, drift with the wind and thin out. */
export function Steam({ at }: { at: [number, number, number] }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uTime: weather.time },
        vertexShader: /* glsl */ `
          attribute float aSeed;
          uniform float uTime;
          varying float vLife;
          void main() {
            float life = fract(uTime * 0.09 + aSeed);
            vLife = life;
            vec3 p = position;
            p.y += life * 6.5;
            p.x += life * life * 3.0 + sin(uTime * 0.7 + aSeed * 20.0) * 0.4 * life;
            p.z += cos(uTime * 0.5 + aSeed * 13.0) * 0.4 * life;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = (0.7 + life * 2.6) * 340.0 / -mv.z;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          varying float vLife;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.1, d) * smoothstep(0.0, 0.12, vLife) * (1.0 - vLife) * 0.5;
            gl_FragColor = vec4(vec3(0.86, 0.85, 0.86), a);
          }`,
      }),
    [],
  );
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(PUFFS * 3);
    const seed = new Float32Array(PUFFS);
    const r = rng(23);
    for (let i = 0; i < PUFFS; i++) {
      pos.set([(r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3], i * 3);
      seed[i] = i / PUFFS + r() * 0.01;
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    return g;
  }, []);
  return <points geometry={geometry} material={material} position={at} frustumCulled={false} />;
}

type Wire = { a: [number, number, number]; b: [number, number, number]; sag: number };

/** Wires hung across the street, as one mesh. */
export function Wires({ wires }: { wires: Wire[] }) {
  const geometry = useMemo(
    () =>
      mergeGeometries(
        wires.map((w) => {
          const curve = new THREE.CatmullRomCurve3(Array.from({ length: 12 }, (_, k) => new THREE.Vector3(...catenary(w, k / 11))));
          return new THREE.TubeGeometry(curve, 24, 0.022, 4, false);
        }),
      )!,
    [wires],
  );
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#1e1c1c" roughness={0.7} />
    </mesh>
  );
}

type Walker = { x: number; zA: number; zB: number; speed: number; colour: string; tall: number; still: boolean; phase: number };

/**
 * People in robes (ch. 3, 18: a fresh privacy robe every day, so nobody can tell who is who), walking the pavements
 * or stopped at a shop front. Three instanced meshes, moved every frame.
 */
export function Robes({ walkers }: { walkers: Walker[] }) {
  const robe = useRef<THREE.InstancedMesh>(null);
  const hood = useRef<THREE.InstancedMesh>(null);
  const face = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(
    () => ({
      robe: new THREE.LatheGeometry(
        // a robe falling from square shoulders to a wide hem
        [[0, 0], [0.33, 0], [0.31, 0.1], [0.25, 0.6], [0.23, 0.95], [0.26, 1.16], [0.24, 1.24], [0.12, 1.32], [0, 1.34]].map(([x, y]) => new THREE.Vector2(x, y)),
        14,
      ),
      // a hood, peaked a little at the back of the head
      hood: new THREE.SphereGeometry(0.16, 14, 10).scale(1, 1.25, 1.12).translate(0, 0.04, -0.03),
      face: new THREE.CircleGeometry(0.09, 12),
    }),
    [],
  );
  const mats = useMemo(
    () => ({ robe: new THREE.MeshStandardMaterial({ roughness: 0.92 }), face: new THREE.MeshStandardMaterial({ color: "#1c1820", roughness: 0.6 }) }),
    [],
  );
  useLayoutEffect(() => {
    const c = new THREE.Color();
    walkers.forEach((w, i) => {
      robe.current!.setColorAt(i, c.set(w.colour));
      hood.current!.setColorAt(i, c.set(w.colour));
    });
    robe.current!.instanceColor!.needsUpdate = true;
    hood.current!.instanceColor!.needsUpdate = true;
  }, [walkers]);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const p = useMemo(() => new THREE.Vector3(), []);
  const one = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const t = weather.time.value;
    walkers.forEach((w, i) => {
      // up and down a stretch of pavement, turning round at each end
      const u = (t * w.speed / Math.max(Math.abs(w.zB - w.zA), 1) + w.phase) % 2;
      const z = w.zA + (u < 1 ? u : 2 - u) * (w.zB - w.zA);
      const turn = w.still ? w.phase * 3.14 : (u < 1) === w.zB > w.zA ? 0 : Math.PI;
      const step = w.still ? 0 : Math.abs(Math.sin(t * w.speed * 3.2 + w.phase * 9)) * 0.04;
      const sway = w.still ? Math.sin(t * 0.8 + w.phase * 7) * 0.05 : Math.sin(t * w.speed * 3.2 + w.phase * 9) * 0.04;
      q.setFromAxisAngle(up, turn + sway);
      one.set(1, w.tall, 1);
      robe.current!.setMatrixAt(i, m.compose(p.set(w.x, 0.17 + step, z), q, one));
      hood.current!.setMatrixAt(i, m.compose(p.set(w.x, 0.17 + step + 1.44 * w.tall, z), q, one.set(1, 1, 1)));
      const fx = Math.sin(turn + sway) * 0.13;
      const fz = Math.cos(turn + sway) * 0.13;
      face.current!.setMatrixAt(i, m.compose(p.set(w.x + fx, 0.17 + step + 1.45 * w.tall, z + fz), q, one.set(0.9, 1.15, 1)));
    });
    for (const mesh of [robe.current, hood.current, face.current]) mesh!.instanceMatrix.needsUpdate = true;
  });
  return (
    <>
      <instancedMesh ref={robe} args={[geo.robe, mats.robe, walkers.length]} castShadow receiveShadow frustumCulled={false} />
      <instancedMesh ref={hood} args={[geo.hood, mats.robe, walkers.length]} castShadow frustumCulled={false} />
      <instancedMesh ref={face} args={[geo.face, mats.face, walkers.length]} frustumCulled={false} />
    </>
  );
}
