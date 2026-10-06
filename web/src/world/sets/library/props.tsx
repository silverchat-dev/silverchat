"use client";

/**
 * The library's furniture and its few living things: boxes laid out as instanced wood or stone, the robed librarian
 * (a cousin of the tea robot on the hill), the hanging orrery, the globe, the forecasters' board, light falling in
 * shafts and the dust that drifts through it.
 */
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { weather } from "../../kit/materials";
import { rng } from "../../kit/noise";
import { globePanel, scoresPanel } from "./paint";

export type Box = { p: [number, number, number]; s: [number, number, number]; r?: [number, number, number]; c?: string };

const unit = new THREE.BoxGeometry(1, 1, 1);

/** Many boxes of one material in one draw call, each with its own place, size, turn and (optional) tint. */
export function Boxes({ items, material, cast = true }: { items: Box[]; material: THREE.Material; cast?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current!;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const c = new THREE.Color();
    items.forEach((b, i) => {
      q.setFromEuler(e.set(...(b.r ?? [0, 0, 0])));
      m.compose(new THREE.Vector3(...b.p), q, new THREE.Vector3(...b.s));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.set(b.c ?? "#ffffff"));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items]);
  return <instancedMesh ref={ref} args={[unit, material, items.length]} castShadow={cast} receiveShadow />;
}

/** The same instancing for any geometry, from a list of matrices (and colours). */
export function Instances({ geometry, material, matrices, colours, cast = false }: { geometry: THREE.BufferGeometry; material: THREE.Material; matrices: THREE.Matrix4[]; colours?: THREE.Color[]; cast?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current!;
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    colours?.forEach((c, i) => mesh.setColorAt(i, c));
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [matrices, colours]);
  return <instancedMesh ref={ref} args={[geometry, material, matrices.length]} castShadow={cast} receiveShadow />;
}

const SHELL = "#e9e2d2";
const ROBE = "#4b2c5e";
const GOLD = "#c9973e";

/**
 * The librarian: the tea robot's family (the same pale shell, round head and soft face screen) in a long plum robe
 * with a gold hem and a hood, holding an open book. It looks from the visitor to the shelves and back, and blinks.
 */
export function Librarian() {
  const head = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const robe = useMemo(() => {
    const profile = [
      [0.001, 1.2], [0.18, 1.18], [0.27, 1.08], [0.36, 0.85], [0.44, 0.45], [0.5, 0.1], [0.53, 0.02], [0.001, 0.02],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const g = new THREE.LatheGeometry(profile.reverse(), 64);
    // folds: the cloth ripples more towards the hem
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const y = p.getY(i);
      const a = Math.atan2(z, x);
      const k = 1 + Math.cos(a * 9) * 0.06 * Math.max(0, 1 - y / 1.1);
      p.setXYZ(i, x * k, y, z * k);
    }
    g.computeVertexNormals();
    return g;
  }, []);
  const sleeve = useMemo(() => new THREE.CylinderGeometry(0.06, 0.1, 0.42, 16, 1, true), []);
  const face = useMemo(() => new THREE.SphereGeometry(0.312, 48, 8, 0, Math.PI * 2, 0, 0.6).rotateX(Math.PI / 2).translate(0, 0.02, 0), []);
  useFrame(() => {
    const t = weather.time.value;
    if (head.current) {
      // looks out at the visitor most of the time, now and then to the shelves behind
      const glance = THREE.MathUtils.smoothstep(Math.sin(t * 0.17 + 1.0), 0.75, 0.98);
      head.current.rotation.y = Math.sin(t * 0.5) * 0.15 - glance * 0.55;
      head.current.rotation.x = Math.sin(t * 0.37) * 0.05 - 0.06;
      head.current.position.y = 1.43 + Math.sin(t * 2.0) * 0.012;
    }
    if (eyes.current) {
      const blink = Math.pow(Math.max(0, Math.sin(t * 0.9 + 1.3)), 60);
      eyes.current.scale.y = 1 - blink * 0.9;
    }
    if (body.current) body.current.rotation.y = Math.sin(t * 0.31) * 0.06;
  });
  const shell = <meshStandardMaterial color={SHELL} roughness={0.38} metalness={0.05} />;
  const cloth = <meshStandardMaterial color={ROBE} roughness={0.85} />;
  return (
    <group>
      <group ref={body}>
        <mesh geometry={robe} castShadow receiveShadow>
          {cloth}
        </mesh>
        <mesh position={[0, 0.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.52, 0.025, 8, 64]} />
          <meshStandardMaterial color={GOLD} metalness={0.8} roughness={0.35} />
        </mesh>
        <mesh position={[0, 1.15, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.2, 0.035, 8, 32]} />
          <meshStandardMaterial color={GOLD} metalness={0.8} roughness={0.35} />
        </mesh>
        {/* the stole: two gold bands down the front */}
        {[-0.1, 0.1].map((x) => (
          <mesh key={x} position={[x, 0.72, 0.405]} rotation={[-0.27, 0, 0]}>
            <boxGeometry args={[0.07, 0.72, 0.02]} />
            <meshStandardMaterial color={GOLD} metalness={0.7} roughness={0.4} />
          </mesh>
        ))}
        {/* sleeves reaching forward to the book, hands at their ends */}
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 0.25, 1.0, 0.08]} rotation={[1.05, 0, s * 0.35]}>
            <mesh geometry={sleeve} position={[0, -0.2, 0]} castShadow>
              {cloth}
            </mesh>
            <mesh position={[0, -0.44, 0]}>
              <sphereGeometry args={[0.065, 16, 12]} />
              {shell}
            </mesh>
          </group>
        ))}
        {/* the open book */}
        <group position={[0, 0.83, 0.47]} rotation={[-0.75, 0, 0]}>
          {[-1, 1].map((s) => (
            <group key={s} rotation={[0, s * 0.22, 0]}>
              <mesh position={[s * 0.13, 0, 0]} castShadow>
                <boxGeometry args={[0.26, 0.34, 0.012]} />
                <meshStandardMaterial color="#7a2e2a" roughness={0.7} />
              </mesh>
              <mesh position={[s * 0.125, 0, 0.012]}>
                <boxGeometry args={[0.24, 0.32, 0.014]} />
                <meshStandardMaterial color="#f4ead2" roughness={0.9} />
              </mesh>
            </group>
          ))}
        </group>
      </group>
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.36, 0.4, 0.06, 24]} />
        <meshStandardMaterial color="#5a5248" roughness={0.6} />
      </mesh>
      <group ref={head} position={[0, 1.43, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.3, 32, 24]} />
          {shell}
        </mesh>
        {/* the face screen: a dark cap on the front of the head */}
        <mesh geometry={face}>
          <meshStandardMaterial color="#0f1a1c" emissive="#78ffd0" emissiveIntensity={0.05} roughness={0.3} envMapIntensity={0.5} />
        </mesh>
        <group ref={eyes} position={[0, 0.06, 0.308]}>
          {[-0.065, 0.065].map((x) => (
            <mesh key={x} position={[x, 0, 0]} rotation={[0, x * 3, 0]}>
              <circleGeometry args={[0.026, 16]} />
              <meshBasicMaterial color="#c8fff0" toneMapped={false} />
            </mesh>
          ))}
        </group>
        {/* the hood, open at the face */}
        <mesh rotation={[-0.25, 0, 0]} castShadow>
          <sphereGeometry args={[0.345, 32, 16, Math.PI - 0.45, Math.PI + 0.9, 0, 2.05]} />
          <meshStandardMaterial color={ROBE} roughness={0.85} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}

const PLANETS = [
  { r: 0.95, size: 0.11, colour: "#c9b8a0", speed: 0.32 },
  { r: 1.45, size: 0.15, colour: "#e3a35c", speed: 0.21 },
  { r: 2.0, size: 0.19, colour: "#4f8fb8", speed: 0.15, moon: true },
  { r: 2.6, size: 0.24, colour: "#d9b77a", speed: 0.1, ring: true },
];

/** The orrery hanging from the roof: a glowing sun, four planets on brass arms turning at their own pace. */
export function Orrery({ rod }: { rod: number }) {
  const arms = useRef<THREE.Group[]>([]);
  const band = useRef<THREE.Group>(null);
  useFrame(() => {
    const t = weather.time.value;
    arms.current.forEach((a, i) => a && (a.rotation.y = t * PLANETS[i].speed + i * 1.7));
    if (band.current) band.current.rotation.y = t * 0.03;
  });
  const brass = useMemo(() => new THREE.MeshStandardMaterial({ color: "#b8893e", metalness: 0.85, roughness: 0.32 }), []);
  return (
    <group>
      <mesh material={brass} position={[0, rod / 2, 0]}>
        <cylinderGeometry args={[0.03, 0.03, rod, 8]} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.45, 32, 24]} />
        <meshStandardMaterial color="#ffcf7a" emissive="#ffae4a" emissiveIntensity={2.6} toneMapped={false} />
      </mesh>
      <pointLight color="#ffb866" intensity={9} distance={14} decay={1.6} />
      {PLANETS.map((p, i) => (
        <group key={i} ref={(g) => void (arms.current[i] = g!)}>
          <mesh material={brass} position={[p.r / 2, 0.1 + i * 0.06, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.018, 0.018, p.r, 6]} />
          </mesh>
          <mesh material={brass} position={[p.r, -0.05 + i * 0.03, 0]}>
            <cylinderGeometry args={[0.015, 0.015, 0.3 + i * 0.06, 6]} />
          </mesh>
          <group position={[p.r, -0.2, 0]}>
            <mesh castShadow>
              <sphereGeometry args={[p.size, 24, 16]} />
              <meshStandardMaterial color={p.colour} roughness={0.55} />
            </mesh>
            {p.ring && (
              <mesh rotation={[1.2, 0.2, 0]}>
                <torusGeometry args={[p.size * 1.7, 0.02, 4, 48]} />
                <meshStandardMaterial color="#e8d3a0" roughness={0.5} />
              </mesh>
            )}
            {p.moon && (
              <mesh position={[0.34, 0.05, 0]}>
                <sphereGeometry args={[0.06, 12, 8]} />
                <meshStandardMaterial color="#e6e2da" roughness={0.6} />
              </mesh>
            )}
          </group>
        </group>
      ))}
      {/* a slim brass ring around it all, turning slowly */}
      <group ref={band} rotation={[0.35, 0, 0.2]}>
        <mesh material={brass} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[2.85, 0.02, 6, 96]} />
        </mesh>
      </group>
    </group>
  );
}

/** A globe of the world on a wooden stand with a brass meridian, turning slowly. */
export function Globe() {
  const map = useMemo(() => globePanel(), []);
  const ball = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (ball.current) ball.current.rotation.y = weather.time.value * 0.12;
  });
  const wood = <meshStandardMaterial color="#5a3a24" roughness={0.7} />;
  return (
    <group>
      {[0, 1, 2].map((k) => {
        const a = (k / 3) * Math.PI * 2;
        return (
          <mesh key={k} position={[Math.cos(a) * 0.22, 0.4, Math.sin(a) * 0.22]} rotation={[Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3]} castShadow>
            <cylinderGeometry args={[0.025, 0.035, 0.84, 8]} />
            {wood}
          </mesh>
        );
      })}
      <mesh position={[0, 0.82, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.5, 0.03, 8, 48]} />
        {wood}
      </mesh>
      <group position={[0, 1.2, 0]} rotation={[0, 0, 0.41]}>
        <mesh ref={ball} castShadow>
          <sphereGeometry args={[0.44, 48, 32]} />
          <meshStandardMaterial map={map} roughness={0.45} />
        </mesh>
        <mesh>
          <torusGeometry args={[0.49, 0.015, 6, 64, Math.PI * 1.3]} />
          <meshStandardMaterial color="#b8893e" metalness={0.85} roughness={0.3} />
        </mesh>
      </group>
    </group>
  );
}

/** The forecasters' board: a tall framed panel of ranked rows on two posts, a crest and its own small lamp. */
export function ScoresBoard() {
  const map = useMemo(() => scoresPanel(), []);
  const wood = useMemo(() => new THREE.MeshStandardMaterial({ color: "#4e3020", roughness: 0.65, envMapIntensity: 0.4 }), []);
  const W = 2.9;
  const H = 5.6;
  return (
    <group>
      {[-1, 1].map((s) => (
        <mesh key={s} material={wood} position={[s * (W / 2 + 0.1), 3.7, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.2, 7.4, 0.24]} />
        </mesh>
      ))}
      <mesh material={wood} position={[0, 1.1 + H / 2, -0.06]} castShadow>
        <boxGeometry args={[W + 0.2, H + 0.2, 0.1]} />
      </mesh>
      <mesh position={[0, 1.1 + H / 2, 0.005]}>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial map={map} emissiveMap={map} emissive="#ffffff" emissiveIntensity={0.55} roughness={0.55} />
      </mesh>
      {/* the crest: a gilt half-disc on top */}
      <mesh position={[0, 1.1 + H + 0.1, -0.04]}>
        <cylinderGeometry args={[0.9, 0.9, 0.12, 40, 1, false, -Math.PI / 2, Math.PI]} />
        <meshStandardMaterial color="#b8893e" metalness={0.8} roughness={0.35} />
      </mesh>
      {/* a little lamp on an arm, lighting the board from above */}
      <mesh position={[0, 7.25, 0.42]} rotation={[0.3, 0, 0]}>
        <cylinderGeometry args={[0.08, 0.28, 0.24, 20, 1, true]} />
        <meshStandardMaterial color="#b8893e" metalness={0.8} roughness={0.35} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 7.17, 0.45]}>
        <sphereGeometry args={[0.1, 16, 12]} />
        <meshStandardMaterial color="#fff0c8" emissive="#ffd28a" emissiveIntensity={3} toneMapped={false} />
      </mesh>
      <pointLight position={[0, 6.6, 1.2]} color="#ffd29a" intensity={6} distance={8} decay={1.6} />
    </group>
  );
}

/**
 * Light falling through still air: an additive volume, brightest where it enters and fading as it goes, soft at its
 * edges. For a box (`slab`) the edges fade across each face; for a cone, where the surface turns from the eye.
 */
export function Shaft({ geometry, colour, strength, slab = false, position, rotation }: { geometry: THREE.BufferGeometry; colour: string; strength: number; slab?: boolean; position?: [number, number, number]; rotation?: [number, number, number] }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { uColour: { value: new THREE.Color(colour) }, uStrength: { value: strength }, uSlab: { value: slab ? 1 : 0 }, uTime: weather.time },
        vertexShader: /* glsl */ `
          varying vec2 vUv; varying vec3 vN; varying vec3 vView; varying float vY;
          void main() {
            vUv = uv;
            vY = (modelMatrix * vec4(position, 1.0)).y;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vView = -mv.xyz;
            vN = normalMatrix * normal;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColour; uniform float uStrength; uniform float uSlab; uniform float uTime;
          varying vec2 vUv; varying vec3 vN; varying vec3 vView; varying float vY;
          void main() {
            float face = abs(dot(normalize(vN), normalize(vView)));
            float edge = uSlab > 0.5 ? sin(vUv.x * 3.14159) : pow(face, 1.6);
            float along = mix(0.12, 1.0, smoothstep(0.0, 1.0, vUv.y));
            float streak = 0.82 + 0.18 * sin(vUv.x * 37.0 + uTime * 0.15) * sin(vUv.x * 13.0 - uTime * 0.07);
            gl_FragColor = vec4(uColour, uStrength * edge * along * streak * smoothstep(0.0, 1.6, vY));
          }`,
      }),
    [colour, strength, slab],
  );
  return (
    <group position={position} rotation={rotation}>
      <mesh geometry={geometry} material={material} renderOrder={2} />
    </group>
  );
}

/** Dust drifting in the lamp light: small soft points that wander, sink and catch the light now and then. */
export function Motes({ regions }: { regions: { at: [number, number, number]; size: [number, number, number]; count: number; colour: string }[] }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: weather.time },
        vertexShader: /* glsl */ `
          attribute float aSeed; attribute vec3 aBox; attribute vec3 color;
          uniform float uTime;
          varying float vA; varying vec3 vC;
          void main() {
            vec3 p = position;
            float s = aSeed * 61.0;
            p.x += sin(uTime * 0.13 + s) * aBox.x * 0.18 + sin(uTime * 0.41 + s * 1.7) * 0.08;
            p.z += cos(uTime * 0.11 + s * 1.3) * aBox.z * 0.18 + cos(uTime * 0.37 + s) * 0.08;
            p.y += aBox.y * (0.5 - fract(uTime * 0.008 + aSeed)) ;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            float twinkle = pow(0.5 + 0.5 * sin(uTime * (0.6 + aSeed) + s), 6.0);
            vA = (0.18 + 0.82 * twinkle) * smoothstep(1.5, 4.0, -mv.z);
            vC = color;
            gl_PointSize = min((0.5 + aSeed * 0.9) * (38.0 / -mv.z), 3.5);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          varying float vA; varying vec3 vC;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            gl_FragColor = vec4(vC, smoothstep(0.5, 0.0, d) * vA);
          }`,
      }),
    [],
  );
  const geometry = useMemo(() => {
    const total = regions.reduce((a, b) => a + b.count, 0);
    const pos = new Float32Array(total * 3);
    const box = new Float32Array(total * 3);
    const col = new Float32Array(total * 3);
    const seed = new Float32Array(total);
    const r = rng(88);
    const c = new THREE.Color();
    let i = 0;
    for (const reg of regions) {
      c.set(reg.colour);
      for (let k = 0; k < reg.count; k++, i++) {
        pos.set([reg.at[0] + (r() - 0.5) * reg.size[0], reg.at[1] + (r() - 0.5) * reg.size[1], reg.at[2] + (r() - 0.5) * reg.size[2]], i * 3);
        box.set(reg.size, i * 3);
        col.set([c.r, c.g, c.b], i * 3);
        seed[i] = r();
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aBox", new THREE.BufferAttribute(box, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    return g;
  }, [regions]);
  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={3} />;
}
