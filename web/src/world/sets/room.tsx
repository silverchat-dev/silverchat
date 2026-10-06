"use client";

/**
 * What stands inside the round room: the burn bowl at the centre of the green circle, embers rising from it, the
 * newest poll result as a dial of light in the sky above, and the tea robot by the bench (ch. 27). The bowl is where
 * a question is asked: zipcoins burn, and the more burn, the more people are asked.
 */
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { weather } from "../kit/materials";

/** A copper bowl on a turned stone pedestal, glowing coals inside. */
export function BurnBowl({ stone }: { stone: THREE.Material }) {
  const pedestal = useMemo(
    () =>
      new THREE.LatheGeometry(
        [
          [0, 0], [0.75, 0], [0.75, 0.12], [0.5, 0.2], [0.32, 0.35], [0.28, 0.85], [0.42, 0.98], [0.55, 1.04], [0, 1.04],
        ].map(([x, y]) => new THREE.Vector2(x, y)),
        48,
      ),
    [],
  );
  const bowl = useMemo(
    () =>
      new THREE.LatheGeometry(
        Array.from({ length: 14 }, (_, i) => {
          const t = i / 13;
          return new THREE.Vector2(0.18 + Math.sin(t * Math.PI * 0.5) * 0.82, t * 0.42);
        }).concat([new THREE.Vector2(1.02, 0.44), new THREE.Vector2(0.96, 0.44)]),
        64,
      ),
    [],
  );
  const coals = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(() => {
    if (coals.current) coals.current.emissiveIntensity = 2.2 + Math.sin(weather.time.value * 3.1) * 0.35 + Math.sin(weather.time.value * 7.3) * 0.2;
  });
  return (
    <group>
      <mesh geometry={pedestal} material={stone} castShadow receiveShadow />
      <mesh geometry={bowl} position={[0, 1.02, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#b0703f" metalness={0.85} roughness={0.32} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 1.36, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.86, 40]} />
        <meshStandardMaterial ref={coals} color="#3a1a0c" emissive="#ff6a1f" emissiveIntensity={2.2} toneMapped={false} />
      </mesh>
      <pointLight position={[0, 1.9, 0]} color="#ff9a4a" intensity={14} distance={10} decay={1.8} />
    </group>
  );
}

const EMBERS = 260;

/** Sparks rising from the bowl, drifting with the wind and fading; `burst` (0 to 1) makes more and faster ones. */
export function Embers({ burst }: { burst: React.RefObject<number> }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: weather.time, uBurst: { value: 0 } },
        vertexShader: /* glsl */ `
          attribute float aSeed;
          uniform float uTime; uniform float uBurst;
          varying float vLife;
          void main() {
            float speed = 0.35 + aSeed * 0.5 + uBurst * 0.8;
            float life = fract(uTime * speed * 0.18 + aSeed * 7.13);
            vLife = life;
            vec3 p = position;
            p.y += life * (5.0 + uBurst * 6.0);
            p.x += sin(uTime * 1.3 + aSeed * 40.0) * 0.35 * life + life * life * 1.2;
            p.z += cos(uTime * 1.1 + aSeed * 31.0) * 0.35 * life;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = (2.0 + aSeed * 3.0) * (1.0 - life * 0.6) * (60.0 / -mv.z);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          varying float vLife;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.0, d) * (1.0 - vLife) * smoothstep(0.0, 0.08, vLife);
            gl_FragColor = vec4(vec3(1.0, 0.55 + 0.3 * (1.0 - vLife), 0.2) * 2.4, a);
          }`,
      }),
    [],
  );
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(EMBERS * 3);
    const seed = new Float32Array(EMBERS);
    for (let i = 0; i < EMBERS; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 0.7;
      pos.set([Math.cos(a) * r, 1.4, Math.sin(a) * r], i * 3);
      seed[i] = Math.random();
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    return g;
  }, []);
  useFrame(() => {
    material.uniforms.uBurst.value += ((burst.current ?? 0) - material.uniforms.uBurst.value) * 0.05;
  });
  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

/**
 * The newest poll result as a dial of light over the room: one arc per answer, its length the answer's share, its
 * colour the answer's own. It turns slowly, like something being read.
 */
export function SkyDial({ shares, colours, height }: { shares: number[]; colours: string[]; height: number }) {
  const group = useRef<THREE.Group>(null);
  const arcs = useMemo(() => {
    const total = shares.reduce((a, b) => a + b, 0) || 1;
    let start = 0;
    return shares.map((v, i) => {
      const len = (v / total) * Math.PI * 2;
      const g = new THREE.RingGeometry(5.7, 6.15, 96, 1, start + 0.04, Math.max(len - 0.08, 0.01));
      start += len;
      return { g, colour: colours[i % colours.length] };
    });
  }, [shares, colours]);
  useFrame((_, dt) => {
    if (group.current) group.current.rotation.z += dt * 0.04;
  });
  return (
    <group position={[0, height, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <group ref={group}>
        {arcs.map(({ g, colour }, i) => (
          <mesh key={i} geometry={g}>
            <meshBasicMaterial color={new THREE.Color(colour).multiplyScalar(1.15)} transparent opacity={0.92} toneMapped={false} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        ))}
      </group>
      <mesh>
        <ringGeometry args={[6.4, 6.44, 160]} />
        <meshBasicMaterial color="#fff6e0" transparent opacity={0.45} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}

/**
 * The tea robot: a rounded body on a hidden wheel, a head with a soft face screen, and a tray of four teas. It turns
 * a little, as if listening.
 */
export function TeaRobot() {
  const head = useRef<THREE.Group>(null);
  useFrame(() => {
    const t = weather.time.value;
    if (head.current) {
      head.current.rotation.y = Math.sin(t * 0.6) * 0.35;
      head.current.position.y = 1.32 + Math.sin(t * 2.2) * 0.015;
    }
  });
  const shell = <meshStandardMaterial color="#e9e2d2" roughness={0.38} metalness={0.05} />;
  return (
    <group>
      <mesh position={[0, 0.62, 0]} castShadow>
        <capsuleGeometry args={[0.36, 0.55, 8, 24]} />
        {shell}
      </mesh>
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.3, 0.34, 0.12, 24]} />
        <meshStandardMaterial color="#5a5248" roughness={0.6} />
      </mesh>
      <group ref={head} position={[0, 1.32, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.3, 32, 24]} />
          {shell}
        </mesh>
        <mesh position={[0, 0.02, 0.24]} rotation={[0, 0, 0]}>
          <circleGeometry args={[0.17, 32]} />
          <meshStandardMaterial color="#1d2a2a" emissive="#78ffd0" emissiveIntensity={0.25} roughness={0.2} />
        </mesh>
        {[-0.06, 0.06].map((x) => (
          <mesh key={x} position={[x, 0.04, 0.255]}>
            <circleGeometry args={[0.022, 16]} />
            <meshBasicMaterial color="#c8fff0" toneMapped={false} />
          </mesh>
        ))}
      </group>
      {/* the tray of four teas, held out in front */}
      <group position={[0, 0.95, 0.42]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.32, 0.32, 0.03, 32]} />
          <meshStandardMaterial color="#8a6a46" metalness={0.6} roughness={0.35} />
        </mesh>
        {[0, 1, 2, 3].map((k) => {
          const a = (k / 4) * Math.PI * 2 + 0.4;
          return (
            <mesh key={k} position={[Math.cos(a) * 0.17, 0.07, Math.sin(a) * 0.17]} castShadow>
              <cylinderGeometry args={[0.055, 0.045, 0.11, 16]} />
              <meshStandardMaterial color="#f4efe4" roughness={0.3} />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}
