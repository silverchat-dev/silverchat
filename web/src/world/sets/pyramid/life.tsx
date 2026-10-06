"use client";

/**
 * What moves at the pyramid at night: fire in the braziers and sconces, fireflies over the grass, and the lit path of
 * the arena (ch4): lamps set in the paving that brighten one after another towards the door, showing the way.
 */
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { weather } from "../../kit/materials";
import { rng } from "../../kit/noise";

const FLAME_VERTEX = /* glsl */ `
  attribute float aH;
  attribute float aSeed;
  uniform float uTime;
  varying float vH;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec3 p = position;
    float h = aH;
    vH = h;
    // each tongue its own rhythm, and each fire too, from where it stands
    float seed = aSeed * 17.0 + modelMatrix[3].x * 3.1 + modelMatrix[3].z * 1.7 + modelMatrix[3].y * 0.9;
    float t = uTime * 7.0 + seed;
    p.x += (sin(t + h * 5.0) * 0.09 + sin(t * 1.7 + h * 9.0) * 0.04) * h;
    p.z += cos(t * 1.3 + h * 6.0) * 0.09 * h;
    p.y *= 0.82 + 0.18 * sin(t * 2.3) * sin(t * 0.7 + 1.0);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const FLAME_FRAGMENT = /* glsl */ `
  varying float vH;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float facing = abs(dot(normalize(vN), normalize(vV)));
    vec3 col = mix(vec3(1.0, 0.86, 0.52), vec3(1.0, 0.34, 0.07), smoothstep(0.05, 0.85, vH));
    float a = pow(facing, 1.4) * (1.0 - smoothstep(0.35, 1.0, vH)) * 0.9;
    gl_FragColor = vec4(col * 3.2, a);
  }
`;

/**
 * A fire: a few teardrop tongues of flame in one mesh, each with its own height (aH, 0 at the base, 1 at the tip)
 * and seed, so they flicker apart from one draw.
 */
function fireGeometry() {
  const pts = Array.from({ length: 14 }, (_, i) => {
    const t = i / 13;
    return new THREE.Vector2(Math.pow(Math.sin(Math.PI * t), 0.75) * Math.pow(1 - t, 0.5) * 0.42 + 0.001, t);
  });
  const tongues: [number, number, number][] = [
    [0, 0, 1],
    [0.19, 0.06, 0.72],
    [-0.17, -0.08, 0.78],
    [0.03, -0.18, 0.62],
    [-0.07, 0.18, 0.66],
  ];
  const parts = tongues.map(([x, z, s], k) => {
    const g = new THREE.LatheGeometry(pts, 16);
    const n = g.attributes.position.count;
    g.setAttribute("aH", new THREE.BufferAttribute(Float32Array.from({ length: n }, (_, i) => g.attributes.position.getY(i)), 1));
    g.setAttribute("aSeed", new THREE.BufferAttribute(new Float32Array(n).fill(k / tongues.length), 1));
    g.scale(s * 0.9, s * 1.6, s * 0.9);
    g.translate(x, 0, z);
    g.deleteAttribute("uv");
    return g;
  });
  return mergeGeometries(parts)!;
}

let shared: { geometry: THREE.BufferGeometry; material: THREE.ShaderMaterial } | null = null;
function flameParts() {
  shared ??= {
    geometry: fireGeometry(),
    material: new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uTime: weather.time },
      vertexShader: FLAME_VERTEX,
      fragmentShader: FLAME_FRAGMENT,
    }),
  };
  return shared;
}

/** A fire `size` tall-ish, from its base at (0, 0, 0). */
export function Fire({ size = 1 }: { size?: number }) {
  const { geometry, material } = flameParts();
  return <mesh geometry={geometry} material={material} scale={size} frustumCulled={false} />;
}

/** A point light that breathes like the fire under it. */
export function FireLight({ intensity, distance, seed }: { intensity: number; distance: number; seed: number }) {
  const ref = useRef<THREE.PointLight>(null);
  useFrame(() => {
    const t = weather.time.value * 7 + seed;
    if (ref.current) ref.current.intensity = intensity * (0.86 + 0.08 * Math.sin(t * 1.3) + 0.06 * Math.sin(t * 3.7) * Math.sin(t * 0.9));
  });
  return <pointLight ref={ref} color="#ff9c4f" intensity={intensity} distance={distance} decay={1.5} />;
}

const FIREFLIES = 420;

/** Fireflies drifting low over the grass on both sides of the walk, each blinking on its own slow beat. */
export function Fireflies({ box }: { box: [number, number, number, number] }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: weather.time },
        vertexShader: /* glsl */ `
          attribute float aSeed;
          uniform float uTime;
          varying float vGlow;
          void main() {
            vec3 p = position;
            float t = uTime * (0.25 + aSeed * 0.25) + aSeed * 40.0;
            p += vec3(sin(t * 1.1) * 1.6 + sin(t * 2.3) * 0.4, sin(t * 1.7) * 0.5, cos(t * 0.9) * 1.6);
            // a slow on and off: dark most of the time, then a soft flash
            float beat = fract(uTime * (0.12 + aSeed * 0.1) + aSeed * 13.7);
            vGlow = smoothstep(0.0, 0.15, beat) * (1.0 - smoothstep(0.25, 0.55, beat));
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = (3.0 + aSeed * 2.5) * (70.0 / -mv.z) * (0.4 + vGlow);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          varying float vGlow;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.0, d);
            gl_FragColor = vec4(vec3(1.0, 0.86, 0.42) * 3.0, a * (0.08 + vGlow));
          }`,
      }),
    [],
  );
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(FIREFLIES * 3);
    const seed = new Float32Array(FIREFLIES);
    const r = rng(7);
    for (let i = 0; i < FIREFLIES; i++) {
      // both sides of the walk, never over the paving itself
      const side = r() < 0.5 ? -1 : 1;
      const x = side * (6 + r() * (box[2] - 6));
      pos.set([x, 0.6 + r() * r() * 4, box[1] + r() * (box[3] - box[1])], i * 3);
      seed[i] = r();
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    return g;
  }, [box]);
  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

/**
 * The lit path: lamps set in the paving along both edges of the walk, from `from` to `to` (z). A wave of light runs
 * down them towards the door, again and again, so the eye is led there.
 */
export function PathLights({ x, from, to, step }: { x: number; from: number; to: number; step: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const spots = useMemo(() => {
    const out: [number, number][] = [];
    for (let z = from; z <= to; z += step) for (const s of [-1, 1]) out.push([s * x, z]);
    return out;
  }, [x, from, to, step]);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    spots.forEach(([sx, z], i) => {
      m.makeTranslation(sx, 0, z);
      ref.current!.setMatrixAt(i, m);
      ref.current!.setColorAt(i, new THREE.Color(1, 1, 1));
    });
    ref.current!.instanceMatrix.needsUpdate = true;
  }, [spots]);
  const base = useMemo(() => new THREE.Color("#ffcf8c"), []);
  const c = useMemo(() => new THREE.Color(), []);
  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = weather.time.value;
    spots.forEach(([, z], i) => {
      // two waves at once, travelling from far down the walk towards the door at 22 units a second
      const phase = (((z + t * 22) % 110) + 110) % 110;
      const wave = Math.exp(-((phase - 8) ** 2) / 26);
      c.copy(base).multiplyScalar(0.9 + 3.4 * wave);
      mesh.setColorAt(i, c);
    });
    mesh.instanceColor!.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, spots.length]} frustumCulled={false}>
      <boxGeometry args={[0.38, 0.05, 0.38]} />
      <meshBasicMaterial color="#ffffff" toneMapped={false} />
    </instancedMesh>
  );
}
