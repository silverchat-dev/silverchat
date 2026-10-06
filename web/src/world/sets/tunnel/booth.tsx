"use client";

/**
 * The sealed booth at the end of the right way (ch. 10): walls and heavy sliding doors of anti-transmission foil,
 * silver and crinkled, a constant hum around it, and inside one long table with two benches. Here the table has a
 * guest: a soft glow that answers, a private AI. One door stands half open, so its warm-teal light spills out on the
 * floor. This is Zinc: you pay in shielded ZEC and talk to the AI where nobody can listen.
 */
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

import { weather } from "../../kit/materials";

/** the booth's outside: width, height, depth, and the door gap */
const W = 6.4;
const H = 4.1;
const D = 8;
const GAP = 1.5;
const DOOR_H = 2.9;

export const TEAL = new THREE.Color("#5fd8cf");

/**
 * Foil: a bright metal crumpled into small flat facets, each tilted its own way, over a few soft folds; made in the
 * shader, so no texture is needed. Each facet catches the lamps on its own, the way crumpled foil does.
 */
export function foilMaterial(colour = "#d9dee4", crinkle = 1) {
  const m = new THREE.MeshStandardMaterial({ color: colour, metalness: 0.78, roughness: 0.36, envMapIntensity: 0.16 });
  m.onBeforeCompile = (s) => {
    s.uniforms.uCrinkle = { value: crinkle };
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vFoil;\nvarying vec3 vFoilN;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFoil = position;\nvFoilN = normal;");
    s.fragmentShader = s.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vFoil;
        varying vec3 vFoilN;
        uniform float uCrinkle;
        float fh(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        vec3 fh3(vec3 p) { return vec3(fh(p), fh(p + 19.1), fh(p + 41.7)); }
        float fn(vec3 x) {
          vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(fh(i), fh(i + vec3(1, 0, 0)), f.x), mix(fh(i + vec3(0, 1, 0)), fh(i + vec3(1, 1, 0)), f.x), f.y),
                     mix(mix(fh(i + vec3(0, 0, 1)), fh(i + vec3(1, 0, 1)), f.x), mix(fh(i + vec3(0, 1, 1)), fh(i + vec3(1, 1, 1)), f.x), f.y), f.z);
        }
        // the facet a point falls in (the nearest of a jittered grid of seeds on the face's own plane), as a tilt
        vec3 facet(vec3 p) {
          vec3 an = abs(vFoilN);
          vec2 q = an.x > an.y && an.x > an.z ? p.zy : an.y > an.z ? p.xz : p.xy;
          vec2 i = floor(q); vec2 f = fract(q);
          float best = 8.0; vec2 id = i;
          for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) {
            vec2 g = vec2(float(x), float(y));
            vec2 r = g + fh3(vec3(i + g, an.x)).xy - f;
            float d = dot(r, r);
            if (d < best) { best = d; id = i + g; }
          }
          return fh3(vec3(id * 1.37, 3.0)) * 2.0 - 1.0;
        }
        float folds(vec3 p) {
          return (1.0 - abs(fn(p * 0.8) * 2.0 - 1.0)) * 0.7 + (1.0 - abs(fn(p * 2.0 + 7.0) * 2.0 - 1.0)) * 0.3;
        }`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        {
          float h = folds(vFoil) * 0.05 * uCrinkle;
          vec3 sx = dFdx(-vViewPosition);
          vec3 sy = dFdy(-vViewPosition);
          vec3 r1 = cross(sy, normal);
          vec3 r2 = cross(normal, sx);
          float det = dot(sx, r1);
          vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
          normal = normalize(abs(det) * normal - grad);
          normal = normalize(normal + facet(vFoil * 6.0) * 0.11 * uCrinkle);
        }`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        "#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + (fn(vFoil * 4.0) - 0.5) * 0.25, 0.08, 1.0);",
      );
  };
  return m;
}

/** A small speech mark of light: a rounded slab with a tail. */
function bubbleGeometry(w: number, h: number) {
  const r = Math.min(w, h) * 0.45;
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(-w / 2 + r * 0.6, -h / 2 - r * 0.9);
  s.lineTo(-w / 2 + r * 1.6, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r);
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r);
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return new THREE.ShapeGeometry(s, 6);
}

/** The booth, built facing +z (its doors), standing on y = 0. */
export function Booth() {
  const foil = useMemo(() => foilMaterial(), []);
  const doorFoil = useMemo(() => foilMaterial("#e4e7ea", 1.4), []);
  const glow = useRef<THREE.MeshStandardMaterial>(null);
  const light = useRef<THREE.PointLight>(null);
  const spill = useRef<THREE.MeshBasicMaterial>(null);
  const bubbles = useRef<THREE.Group>(null);
  const side = (W - GAP) / 2;
  const panels = useMemo(() => {
    // the shell: walls with a door opening in the front, each a slab of foil with a quilted look from its rounded edges
    const g = (w: number, h: number, d: number) => new RoundedBoxGeometry(w, h, d, 2, 0.06);
    return {
      back: g(W, H, 0.24),
      side: g(0.24, H, D),
      roof: g(W + 0.5, 0.28, D + 0.5),
      front: g(side, H, 0.24),
      lintel: g(GAP + 0.1, H - DOOR_H, 0.24),
      leaf: g(side * 0.86, DOOR_H + 0.12, 0.2),
    };
  }, [side]);
  const bubble = useMemo(() => [bubbleGeometry(0.62, 0.3), bubbleGeometry(0.46, 0.24), bubbleGeometry(0.7, 0.3)], []);
  const floorSpill = useMemo(() => {
    // light on the floor in front of the gap: a fan that widens and fades as it leaves the door
    const g = new THREE.BufferGeometry();
    const len = 6;
    g.setAttribute("position", new THREE.Float32BufferAttribute([-GAP / 2, 0, 0, GAP / 2, 0, 0, -GAP * 1.6, 0, len, GAP * 1.6, 0, len], 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute([1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0], 3));
    g.setIndex([0, 2, 1, 1, 2, 3]);
    return g;
  }, []);

  useFrame(() => {
    const t = weather.time.value;
    // the glow breathes slowly, like something listening
    const b = 0.5 + 0.5 * Math.sin(t * 0.9);
    if (glow.current) glow.current.emissiveIntensity = 2.2 + 1.2 * b;
    if (light.current) light.current.intensity = 16 + 8 * b;
    if (spill.current) spill.current.opacity = 0.32 + 0.14 * b;
    bubbles.current?.children.forEach((c, i) => {
      c.position.y = 1.85 + i * 0.36 + Math.sin(t * 0.8 + i * 1.7) * 0.05;
    });
  });

  const steel = <meshStandardMaterial color="#2f3439" metalness={0.8} roughness={0.45} />;
  return (
    <group>
      {/* the shell */}
      <mesh geometry={panels.back} material={foil} position={[0, H / 2, -D / 2 + 0.12]} castShadow receiveShadow />
      <mesh geometry={panels.side} material={foil} position={[-W / 2 + 0.12, H / 2, 0]} castShadow receiveShadow />
      <mesh geometry={panels.side} material={foil} position={[W / 2 - 0.12, H / 2, 0]} castShadow receiveShadow />
      <mesh geometry={panels.front} material={foil} position={[-W / 2 + side / 2, H / 2, D / 2 - 0.12]} castShadow receiveShadow />
      <mesh geometry={panels.front} material={foil} position={[W / 2 - side / 2, H / 2, D / 2 - 0.12]} castShadow receiveShadow />
      <mesh geometry={panels.lintel} material={foil} position={[0, DOOR_H + (H - DOOR_H) / 2, D / 2 - 0.12]} castShadow />
      <mesh geometry={panels.roof} position={[0, H + 0.1, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#3a4046" metalness={0.7} roughness={0.5} />
      </mesh>
      {/* the heavy doors on their track, slid apart to a gap */}
      <mesh position={[0, DOOR_H + 0.22, D / 2 + 0.2]}>
        <boxGeometry args={[W + 0.3, 0.16, 0.16]} />
        {steel}
      </mesh>
      {[-1, 1].map((k) => (
        <group key={k} position={[k * (GAP / 2 + (side * 0.86) / 2), (DOOR_H + 0.12) / 2, D / 2 + 0.16]}>
          <mesh geometry={panels.leaf} material={doorFoil} castShadow />
          <mesh position={[-k * (side * 0.43 - 0.1), 0, 0.12]}>
            <boxGeometry args={[0.08, 1.2, 0.08]} />
            {steel}
          </mesh>
        </group>
      ))}
      {/* the hum: two speaker grilles low on the front */}
      {[-1, 1].map((k) => (
        <mesh key={k} position={[k * (W / 2 - 0.55), 0.55, D / 2 + 0.01]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.26, 0.26, 0.04, 24]} />
          <meshStandardMaterial color="#1c2024" metalness={0.5} roughness={0.7} />
        </mesh>
      ))}

      {/* inside: a dim teal room, one long table, two benches, and the glow over the table */}
      <mesh position={[0, H / 2 - 0.05, 0]}>
        <boxGeometry args={[W - 0.5, H - 0.2, D - 0.5]} />
        <meshStandardMaterial color="#1d3b3d" roughness={0.9} side={THREE.BackSide} />
      </mesh>
      <mesh position={[0, 0.76, -0.6]} castShadow receiveShadow>
        <boxGeometry args={[1.3, 0.08, 5.2]} />
        <meshStandardMaterial color="#6b4a32" roughness={0.6} />
      </mesh>
      {[-1, 1].map((k) => (
        <mesh key={k} position={[k * 1.25, 0.44, -0.6]} castShadow receiveShadow>
          <boxGeometry args={[0.42, 0.08, 5]} />
          <meshStandardMaterial color="#5a3d29" roughness={0.7} />
        </mesh>
      ))}
      <mesh position={[0, 1.55, -0.3]}>
        <sphereGeometry args={[0.3, 32, 20]} />
        <meshStandardMaterial ref={glow} color="#0f2a2a" emissive={TEAL} emissiveIntensity={2.6} toneMapped={false} />
      </mesh>
      <group ref={bubbles} position={[0.1, 0, -0.3]}>
        {bubble.map((g, i) => (
          <mesh key={i} geometry={g} position={[i % 2 ? -0.45 : 0.42, 1.85 + i * 0.36, 0.2]}>
            <meshBasicMaterial
              color={i % 2 ? new THREE.Color("#ffe3b0").multiplyScalar(1.6) : TEAL.clone().multiplyScalar(1.5)}
              toneMapped={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}
      </group>
      <pointLight ref={light} position={[0, 1.9, 1.2]} color={TEAL} intensity={20} distance={9} decay={1.6} />
      <pointLight position={[0, 2.6, -2.2]} color="#ffcf96" intensity={8} distance={6} decay={1.8} />

      {/* the spill: teal light on the floor outside the gap, and a lamp just outside so it touches the doors */}
      <mesh geometry={floorSpill} position={[0, 0.03, D / 2]}>
        <meshBasicMaterial
          ref={spill}
          color={TEAL}
          vertexColors
          transparent
          opacity={0.4}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <pointLight position={[0, 1.2, D / 2 + 1.4]} color={TEAL} intensity={10} distance={8} decay={1.8} />
    </group>
  );
}
