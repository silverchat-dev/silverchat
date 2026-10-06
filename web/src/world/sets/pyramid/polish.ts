/**
 * Polished stone: the kit's laid stone made smoother, so the pyramid's cladding catches the sky in a soft sheen, and
 * a little darker low down, where the night air and the trees shade it.
 */
import type * as THREE from "three";

/**
 * `night` shades a pyramid by moonlight in its own space (so it does not matter where the world puts the set): darker
 * towards the base and towards the edges of each face, so the great plain faces have form at night. `base` is the half
 * width at the ground, `slope` the rise per unit in.
 */
export function polished(m: THREE.MeshStandardMaterial, roughness: number, night?: { base: number; slope: number }) {
  const laid = m.onBeforeCompile.bind(m);
  m.onBeforeCompile = (s, r) => {
    laid(s, r);
    if (night) {
      s.vertexShader = s.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vObj;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvObj = position;");
      s.fragmentShader = s.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vObj;");
    }
    const shade = night
      ? `float w = max(6.0, ${night.base.toFixed(1)} - vObj.y / ${night.slope.toFixed(3)});
        float across = (abs(vWorldNormal.x) > abs(vWorldNormal.z) ? abs(vObj.z) : abs(vObj.x)) / w;
        diffuseColor.rgb *= mix(1.0, 0.5, smoothstep(0.15, 1.0, across));
        diffuseColor.rgb *= mix(0.3, 1.0, pow(smoothstep(-4.0, 200.0, vObj.y), 0.8));`
      : "diffuseColor.rgb *= mix(0.72, 1.06, smoothstep(-2.0, 120.0, vWorld.y));";
    s.fragmentShader = s.fragmentShader.replace(
      "roughnessFactor = mix(0.82, 1.0, mortar);",
      `roughnessFactor = mix(${roughness.toFixed(2)}, 0.95, mortar);
      ${shade}
      // faces turned to the sides a shade darker, so a pyramid's edges stay crisp under a flat night light
      diffuseColor.rgb *= 1.0 - 0.16 * smoothstep(0.35, 0.75, abs(vWorldNormal.x));`,
    );
  };
  // the program must not be shared with plain laid stone
  m.customProgramCacheKey = () => `polished-${roughness}-${night ? "night" : "day"}`;
  // under a night sky the stage's soft image light (made for day) would wash a pale face grey: the moon lights it
  return night ? moonlit(m, 0.5) : m;
}

/**
 * Take only `k` of the stage's image light (sky dome and bounce), which is set for day. three ignores a material's
 * envMapIntensity while the scene has an environment, so it is scaled in the shader.
 */
export function moonlit<M extends THREE.Material>(m: M, k: number) {
  const before = m.onBeforeCompile.bind(m);
  const key = m.customProgramCacheKey.bind(m);
  m.onBeforeCompile = (s, r) => {
    before(s, r);
    s.fragmentShader = s.fragmentShader.replace(
      "#include <lights_fragment_maps>",
      `#include <lights_fragment_maps>
      iblIrradiance *= ${k.toFixed(2)};
      #if defined( RE_IndirectSpecular )
        radiance *= ${k.toFixed(2)};
      #endif`,
    );
  };
  m.customProgramCacheKey = () => `${key()}-moon-${k}`;
  return m;
}
