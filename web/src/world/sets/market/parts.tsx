"use client";

/**
 * The street is built from a few kinds of simple pieces (boxes, cylinders, balls), each kind drawn as one instanced
 * mesh per material, so a whole row of shops costs a handful of draw calls. The materials add their own wear in world
 * space (mottled plaster, grime near the ground, rain streaks), so no texture is needed for walls and roofs.
 */
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { weather } from "../../kit/materials";

/** One piece: centre, size, turn about y (and optionally x, z), colour, and a brightness for glowing pieces. */
export type Piece = { p: [number, number, number]; s: [number, number, number]; r?: number; rx?: number; rz?: number; c: string; k?: number };

export type Shape = "box" | "cyl" | "ball" | "cone";

const UNIT: Record<Shape, () => THREE.BufferGeometry> = {
  box: () => new THREE.BoxGeometry(1, 1, 1),
  cyl: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 14),
  ball: () => new THREE.IcosahedronGeometry(0.5, 1),
  cone: () => new THREE.ConeGeometry(0.5, 1, 16, 1),
};

/** Draws a list of pieces of one shape and one material as a single instanced mesh. */
export function Pieces({ shape, pieces, material, shadow = true }: { shape: Shape; pieces: Piece[]; material: THREE.Material; shadow?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => UNIT[shape](), [shape]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const c = new THREE.Color();
    pieces.forEach((pc, i) => {
      e.set(pc.rx ?? 0, pc.r ?? 0, pc.rz ?? 0);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(...pc.p), q, new THREE.Vector3(...pc.s));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.set(pc.c).multiplyScalar(pc.k ?? 1));
    });
    mesh.count = pieces.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [pieces]);
  if (!pieces.length) return null;
  return <instancedMesh ref={ref} args={[geometry, material, pieces.length]} castShadow={shadow} receiveShadow />;
}

const WORLD_VERTEX = /* glsl */ `
  #ifdef USE_INSTANCING
    vWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
  #else
    vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
  #endif
`;

const NOISE = /* glsl */ `
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
  }
`;

/**
 * Painted render over concrete: each piece takes its instance colour, mottled at three scales, darker near the
 * pavement where dust and splashes gather, with faint rain streaks running down from the roofs.
 */
export function plasterMaterial(roughness = 0.9) {
  const m = new THREE.MeshStandardMaterial({ roughness, color: "#ffffff" });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWorld;")
      .replace("#include <worldpos_vertex>", `#include <worldpos_vertex>\n${WORLD_VERTEX}`);
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vWorld;\n${NOISE}`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec2 q = vWorld.xy + vWorld.zy;
        float n = vnoise(q * 0.6) * 0.5 + vnoise(q * 2.7 + vWorld.xz) * 0.3 + vnoise(q * 11.0) * 0.2;
        diffuseColor.rgb *= 0.88 + 0.2 * n;
        diffuseColor.rgb *= mix(0.74, 1.0, smoothstep(0.1, 1.3, vWorld.y));
        float streak = vnoise(vec2((vWorld.x + vWorld.z) * 3.5, vWorld.y * 0.12));
        diffuseColor.rgb *= 1.0 - 0.1 * smoothstep(0.62, 0.92, streak);`,
      );
  };
  return m;
}

/** Plain lit stuff with instance colours: metal, wood, cloth, glass. */
export function solidMaterial(o: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.6, ...o });
}

/** Awnings: canvas in bands of the instance colour and cream, along the piece's length. */
export function awningMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.95, side: THREE.DoubleSide });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vStripe;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvStripe = uv;");
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vStripe;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float band = step(0.5, fract(vStripe.y * 9.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.96, 0.92, 0.84), band * 0.85);`,
      );
  };
  return m;
}

/**
 * Glowing things that are not signs (bulbs, lit windows far away): the instance colour is the light, and each one
 * breathes a little on its own, like the flickering shop lights seen from the slope (ch. 4).
 */
export function glowMaterial(flicker = 0.12) {
  const m = new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false });
  m.onBeforeCompile = (s) => {
    s.uniforms.uTime = weather.time;
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vSeed;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vSeed = fract(sin(dot(instanceMatrix[3].xyz, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        #else
          vSeed = 0.0;
        #endif`,
      );
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nvarying float vSeed;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float t = uTime * (0.6 + vSeed) + vSeed * 40.0;
        float dip = step(0.965, fract(sin(floor(t * 6.0) * 91.7 + vSeed * 13.0) * 4375.5));
        diffuseColor.rgb *= 1.0 - ${flicker.toFixed(3)} * (0.5 + 0.5 * sin(t * 2.3)) - dip * ${(flicker * 3).toFixed(3)};`,
      );
  };
  return m;
}
