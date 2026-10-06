/**
 * The world's few materials. Each is three's physical material with a little shader added, so it keeps real light,
 * shadows and fog: wind for grass and leaves, soft edge light for leaves, and procedural stone (bricks with mortar
 * and moss) for every wall, so no texture has to be downloaded for them.
 */
import * as THREE from "three";

/** Shared clock and wind for every swaying thing; the scene advances `time` each frame. */
export const weather = {
  time: { value: 0 },
  wind: { value: 1 },
};

const WIND_VERTEX = /* glsl */ `
  float windPhase(vec3 p) { return p.x * 0.11 + p.z * 0.07; }
  vec3 windAt(vec3 root, float bend, float t) {
    float gust = 0.55 + 0.45 * sin(t * 0.35 + root.x * 0.013 + root.z * 0.021);
    float sway = sin(t * 1.7 + windPhase(root)) * 0.6 + sin(t * 3.1 + windPhase(root) * 2.3) * 0.25;
    return vec3(sway, 0.0, sway * 0.45) * bend * gust * uWind;
  }
`;

function rootOf() {
  return /* glsl */ `
    #ifdef USE_INSTANCING
      vec3 root = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    #else
      vec3 root = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    #endif
  `;
}

/**
 * Grass blades: bend grows with the square of the height along the blade (`height` is the blade's full height),
 * and the normals point straight up so a field lights like the ground it grows from.
 */
export function grassMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  m.onBeforeCompile = (s) => {
    s.uniforms.uTime = weather.time;
    s.uniforms.uWind = weather.wind;
    s.vertexShader = s.vertexShader
      .replace("#include <common>", `#include <common>\nuniform float uTime;\nuniform float uWind;\n${WIND_VERTEX}`)
      .replace("#include <beginnormal_vertex>", "vec3 objectNormal = vec3(0.0, 1.0, 0.0);\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3(tangent.xyz);\n#endif")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        ${rootOf()}
        float k = clamp(position.y / 0.8, 0.0, 1.0);
        transformed += windAt(root, k * k * 0.35, uTime);`,
      );
  };
  return m;
}

/**
 * Leaves: the whole crown sways from the trunk, each clump trembles a little, and the edges glow softly where light
 * passes through the outer leaves. `crownBase` is the height where the crown starts, so the trunk stays still.
 */
export function foliageMaterial(crownBase: number, twoSided = false) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, side: twoSided ? THREE.DoubleSide : THREE.FrontSide });
  m.onBeforeCompile = (s) => {
    s.uniforms.uTime = weather.time;
    s.uniforms.uWind = weather.wind;
    s.uniforms.uBase = { value: crownBase };
    s.vertexShader = s.vertexShader
      .replace("#include <common>", `#include <common>\nuniform float uTime;\nuniform float uWind;\nuniform float uBase;\n${WIND_VERTEX}`)
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        ${rootOf()}
        float up = max(position.y - uBase, 0.0);
        transformed += windAt(root, up * 0.035, uTime);
        transformed += normal * sin(uTime * 4.0 + dot(position, vec3(3.1, 2.7, 1.9))) * 0.035 * uWind;`,
      );
    s.fragmentShader = s.fragmentShader.replace(
      "#include <opaque_fragment>",
      `float rim = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.5);
      outgoingLight += diffuseColor.rgb * rim * vec3(1.0, 0.95, 0.7) * 0.45;
      #include <opaque_fragment>`,
    );
  };
  return m;
}

/**
 * The ground: the land's vertex colours with fine variation laid over them in world space (clumps, bare patches,
 * small stones), so close ground is never one flat green.
 */
export function groundMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96 });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWorld;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    s.fragmentShader = s.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vWorld;
        float gh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float gn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(gh(i), gh(i + vec2(1, 0)), f.x), mix(gh(i + vec2(0, 1)), gh(i + vec2(1, 1)), f.x), f.y); }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec2 w = vWorld.xz;
        float clump = gn(w * 0.45) * 0.6 + gn(w * 1.7) * 0.3 + gn(w * 6.0) * 0.1;
        diffuseColor.rgb *= 0.82 + 0.3 * clump;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.08, 1.02, 0.86), smoothstep(0.6, 0.8, gn(w * 0.12)));`,
      );
  };
  return m;
}

/** Bark: the trunk and branches. It moves with the crown only near the top. */
export function barkMaterial() {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
}

const STONE_FRAGMENT = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vWorldNormal;
  uniform vec3 uStoneA;
  uniform vec3 uStoneB;
  uniform vec3 uMortar;
  uniform vec3 uMoss;
  uniform vec2 uBrick;
  uniform float uMossAmount;
  uniform vec4 uRadial;
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
  }
  // one face of laid stone: rows of stones of uneven length, each its own tone and grain, edges rounded by a little
  // shade so they read as dressed stone, not printed bricks; m returns how much of this point is mortar
  vec3 bricks(vec2 uv, out float m) {
    uv += (vec2(vnoise(uv * 0.6), vnoise(uv * 0.6 + 17.0)) - 0.5) * 0.1;
    float row = floor(uv.y / uBrick.y);
    float len = uBrick.x * (0.7 + 0.75 * h21(vec2(row, 3.1)));
    float x = uv.x / len + h21(vec2(row, 9.7)) * 3.0;
    vec2 cell = vec2(floor(x), row);
    vec2 f = vec2(fract(x), fract(uv.y / uBrick.y));
    float edge = min(min(f.x, 1.0 - f.x) * len, min(f.y, 1.0 - f.y) * uBrick.y);
    edge += (vnoise(uv * 11.0) - 0.5) * 0.025;
    m = 1.0 - smoothstep(0.016, 0.04, edge);
    float tone = h21(cell);
    vec3 c = mix(uStoneA, uStoneB, tone * tone);
    c *= vec3(1.0 + (h21(cell + 7.0) - 0.5) * 0.14, 1.0, 1.0 - (h21(cell + 3.0) - 0.5) * 0.14);
    c *= 0.84 + 0.26 * vnoise(uv * 3.0 + cell) ;
    c *= 0.88 + 0.18 * vnoise(uv * 16.0);
    // the rounded edge of each stone
    c *= mix(0.68, 1.0, smoothstep(0.0, 0.1, edge));
    return c;
  }
`;

/**
 * Stone walls. Bricks are laid in world space on whichever side a surface faces (walls along x or z, tops on xz),
 * each brick its own tone, mortar between them, and moss on the tops and in the low courses.
 */
export function stoneMaterial(opts: { a?: string; b?: string; mortar?: string; brick?: [number, number]; moss?: number; radial?: THREE.Vector3 } = {}) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.9, color: "#ffffff" });
  const uniforms = {
    uStoneA: { value: new THREE.Color(opts.a ?? "#b8aa92") },
    uStoneB: { value: new THREE.Color(opts.b ?? "#8f8371") },
    uMortar: { value: new THREE.Color(opts.mortar ?? "#5d5649") },
    uMoss: { value: new THREE.Color("#5b7f2c") },
    uBrick: { value: new THREE.Vector2(...(opts.brick ?? [0.62, 0.28])) },
    uMossAmount: { value: opts.moss ?? 0.5 },
    // a centre for floors laid in rings (a round room's flagstones); w = 0 lays them in rows
    uRadial: { value: new THREE.Vector4(opts.radial?.x ?? 0, opts.radial?.y ?? 0, opts.radial?.z ?? 0, opts.radial ? 1 : 0) },
  };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWorld;\nvarying vec3 vWorldNormal;")
      .replace(
        "#include <worldpos_vertex>",
        `#include <worldpos_vertex>
        #ifdef USE_INSTANCING
          vec4 wp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
          vWorldNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
        #else
          vec4 wp = modelMatrix * vec4(transformed, 1.0);
          vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
        #endif
        vWorld = wp.xyz;`,
      );
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", `#include <common>\n${STONE_FRAGMENT}`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec3 an = abs(vWorldNormal);
        float mortar;
        vec3 stone;
        if (an.y > 0.7 && uRadial.w > 0.5) {
          // rings of flagstones: each ring holds a whole number of stones, so no ring has a seam
          vec2 d = vWorld.xz - uRadial.xz;
          float rr = length(d);
          float ring = floor(rr / uBrick.y);
          float count = max(6.0, floor(6.2832 * (ring + 0.5) * uBrick.y / uBrick.x));
          float u = (atan(d.y, d.x) / 6.2832 + 0.5) * count + h21(vec2(ring, 1.3));
          vec2 cell = vec2(floor(u), ring);
          vec2 f = vec2(fract(u), fract(rr / uBrick.y));
          float edge = min(min(f.x, 1.0 - f.x) * 6.2832 * (ring + 0.5) * uBrick.y / count, min(f.y, 1.0 - f.y) * uBrick.y);
          edge += (vnoise(vWorld.xz * 11.0) - 0.5) * 0.025;
          mortar = 1.0 - smoothstep(0.016, 0.04, edge);
          stone = mix(uStoneA, uStoneB, h21(cell) * h21(cell));
          stone *= (0.84 + 0.26 * vnoise(vWorld.xz * 3.0 + cell)) * (0.88 + 0.18 * vnoise(vWorld.xz * 16.0));
          stone *= mix(0.68, 1.0, smoothstep(0.0, 0.1, edge));
        } else if (an.y > 0.7) {
          stone = bricks(vWorld.xz * vec2(1.0, 1.9), mortar);
        } else if (an.x > an.z) {
          stone = bricks(vWorld.zy, mortar);
        } else {
          stone = bricks(vWorld.xy, mortar);
        }
        vec3 col = mix(stone, uMortar, mortar);
        float moss = smoothstep(0.55, 0.85, vnoise(vWorld.xz * 0.8 + vWorld.y * 0.6)) * (0.35 + 0.65 * smoothstep(0.4, 0.9, vWorldNormal.y));
        col = mix(col, uMoss * (0.8 + 0.4 * vnoise(vWorld.xz * 6.0)), moss * uMossAmount);
        diffuseColor.rgb *= col;`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        "#include <roughnessmap_fragment>\nroughnessFactor = mix(0.82, 1.0, mortar);",
      );
  };
  return m;
}
