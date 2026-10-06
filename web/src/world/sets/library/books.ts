/**
 * The books: every shelf in the library is a run filled with books of uneven width and height, in many colours, now
 * and then a set of one colour, a gap, a book leaning on its neighbour, a short stack lying flat. All of them are one
 * instanced box; the spines get their gilt bands, labels and rounded shading in the shader, so a wall of thousands
 * of books costs one draw call.
 */
import * as THREE from "three";

import { weather } from "../../kit/materials";

/** A shelf: from `start` along `along` for `length`, books standing on it up to `clear` tall, spines facing `out`. */
export type Run = { start: THREE.Vector3; along: THREE.Vector3; out: THREE.Vector3; length: number; clear: number; depth?: number };

const COLOURS = [
  "#7a2e2a", "#9c3b2e", "#2f4a6b", "#1f5e63", "#3b5c3a", "#c08a3e", "#6b3a5c", "#d9c9a3", "#4a3426", "#a85d2f",
  "#2b2d47", "#8a7a4a", "#b04a4a", "#3d6d8a", "#5a2a3a", "#e0b860", "#2e3b2e", "#7d5a8c",
];

/**
 * Fill runs with books. `skip(p, h)` drops a book whose spine centre is `p` (a book in a doorway). Returns the
 * matrices and colours for an instanced mesh.
 */
export function layBooks(runs: Run[], r: () => number, skip?: (p: THREE.Vector3, h: number) => boolean) {
  const matrices: THREE.Matrix4[] = [];
  const colours: THREE.Color[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const basis = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const lean = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  for (const run of runs) {
    basis.makeBasis(run.along, up, run.out);
    q.setFromRotationMatrix(basis);
    const depth = run.depth ?? 0.28;
    let x = r() * 0.03;
    let series = 0;
    let seriesColour = new THREE.Color();
    let seriesH = 0;
    let seriesW = 0;
    while (x < run.length - 0.04) {
      // a gap now and then: a borrowed book
      if (r() < 0.025) {
        x += 0.05 + r() * 0.12;
        continue;
      }
      // a short stack lying flat
      if (r() < 0.012 && run.length - x > 0.4) {
        const n = 2 + Math.floor(r() * 4);
        const w = 0.26 + r() * 0.08;
        let y = 0;
        for (let k = 0; k < n; k++) {
          const t = 0.03 + r() * 0.03;
          pos.copy(run.start).addScaledVector(run.along, x + w / 2).addScaledVector(up, y + t / 2).addScaledVector(run.out, -depth / 2 + 0.02);
          y += t;
          if (skip?.(pos, 0.3)) continue;
          const flat = new THREE.Quaternion().setFromAxisAngle(run.out, Math.PI / 2 + (r() - 0.5) * 0.08);
          matrices.push(new THREE.Matrix4().compose(pos.clone(), q.clone().premultiply(flat), new THREE.Vector3(t, w, depth * 0.9)));
          colours.push(new THREE.Color(COLOURS[Math.floor(r() * COLOURS.length)]).multiplyScalar(0.8 + r() * 0.35));
        }
        x += w + 0.02;
        continue;
      }
      if (series <= 0 && r() < 0.18) {
        series = 4 + Math.floor(r() * 9);
        seriesColour = new THREE.Color(COLOURS[Math.floor(r() * COLOURS.length)]).multiplyScalar(0.85 + r() * 0.3);
        seriesH = run.clear * (0.68 + r() * 0.24);
        seriesW = 0.035 + r() * 0.035;
      }
      const inSeries = series > 0;
      series--;
      const w = inSeries ? seriesW : 0.028 + r() * r() * 0.07;
      const h = inSeries ? seriesH : Math.min(run.clear - 0.02, run.clear * (0.55 + r() * 0.4));
      const colour = inSeries ? seriesColour.clone() : new THREE.Color(COLOURS[Math.floor(r() * COLOURS.length)]).multiplyScalar(0.75 + r() * 0.45);
      // the last book before a gap leans on its neighbour
      const leaning = !inSeries && r() < 0.02;
      const tilt = leaning ? 0.18 + r() * 0.12 : 0;
      const along = x + w / 2 + (leaning ? Math.sin(tilt) * h * 0.5 : 0);
      pos.copy(run.start)
        .addScaledVector(run.along, along)
        .addScaledVector(up, (h / 2) * Math.cos(tilt))
        .addScaledVector(run.out, -depth / 2 + 0.015 + r() * 0.025);
      if (!skip?.(pos, h)) {
        const rot = q.clone();
        if (leaning) rot.multiply(lean.setFromAxisAngle(tmp.set(0, 0, 1), -tilt));
        matrices.push(new THREE.Matrix4().compose(pos.clone(), rot, new THREE.Vector3(w, h, depth * (0.85 + r() * 0.15))));
        colours.push(colour);
      }
      x += w + (leaning ? Math.sin(tilt) * h + 0.01 : 0.002 + r() * 0.004);
      if (leaning) series = 0;
    }
  }
  return { matrices, colours };
}

/**
 * The book material: the instance colour is the cover; on the spine (the box's +z face) sit two gilt bands near top
 * and bottom, sometimes a dark title label, and a soft roundness; the top shows cream page edges. `glow` > 0 makes
 * the spines light up in their own colour, breathing slowly (the newest records).
 */
export function bookMaterial(glow = 0) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0, envMapIntensity: 0.22 });
  m.onBeforeCompile = (s) => {
    s.uniforms.uTime = weather.time;
    s.uniforms.uGlow = { value: glow };
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBook;\nvarying float vSeed;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vBook = position;
        #ifdef USE_INSTANCING
          vec3 o = instanceMatrix[3].xyz;
        #else
          vec3 o = vec3(0.0);
        #endif
        vSeed = fract(sin(dot(o, vec3(12.9898, 78.233, 37.719))) * 43758.5453);`,
      );
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBook;\nvarying float vSeed;\nuniform float uTime;\nuniform float uGlow;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float spine = step(0.495, vBook.z);
        float top = step(0.495, vBook.y) * step(abs(vBook.x), 0.42) * step(vBook.z, 0.45);
        vec3 gilt = vec3(0.86, 0.66, 0.3);
        float bands = 0.0;
        if (vSeed > 0.35) {
          bands += 1.0 - smoothstep(0.004, 0.012, abs(abs(vBook.y) - 0.40));
          bands += (1.0 - smoothstep(0.003, 0.009, abs(abs(vBook.y) - 0.36))) * step(0.6, vSeed);
        }
        float label = step(0.55, fract(vSeed * 7.31)) * step(abs(vBook.y - 0.16), 0.08) * step(abs(vBook.x), 0.32);
        vec3 c = diffuseColor.rgb;
        c = mix(c, c * 0.35, label * spine);
        c = mix(c, gilt, clamp(bands, 0.0, 1.0) * spine);
        // the rounded spine: darker towards its edges
        c *= mix(1.0, 0.72 + 0.28 * cos(vBook.x * 2.6), spine);
        c = mix(c, vec3(0.93, 0.88, 0.76), top);
        // a little wear, darker at the bottom where hands do not reach
        c *= 0.88 + 0.12 * smoothstep(-0.5, 0.2, vBook.y);
        diffuseColor.rgb = c;`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        if (uGlow > 0.0) {
          float breathe = 0.65 + 0.35 * sin(uTime * 1.2 + vSeed * 6.2831);
          totalEmissiveRadiance += vColor.rgb * uGlow * breathe * (0.35 + 0.65 * spine);
        }`,
      );
  };
  m.customProgramCacheKey = () => `book-${glow > 0 ? 1 : 0}`;
  return m;
}

/**
 * The hall's floor: polished stone laid on the diagonal, cream and dark walnut squares with fine joints and a little
 * cloudiness in each, smooth enough to catch the lamps.
 */
export function floorMaterial() {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0, envMapIntensity: 0.15 });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vFloor;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvFloor = (modelMatrix * vec4(transformed, 1.0)).xz;");
    s.fragmentShader = s.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec2 vFloor;
        float fh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float fn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(fh(i), fh(i + vec2(1, 0)), f.x), mix(fh(i + vec2(0, 1)), fh(i + vec2(1, 1)), f.x), f.y); }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec2 d = mat2(0.7071, -0.7071, 0.7071, 0.7071) * vFloor / 1.1;
        vec2 cell = floor(d);
        vec2 f = fract(d);
        float joint = 1.0 - smoothstep(0.0, 0.025, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
        float dark = mod(cell.x + cell.y, 2.0);
        vec3 cream = vec3(0.62, 0.53, 0.41);
        vec3 walnut = vec3(0.27, 0.18, 0.13);
        vec3 c = mix(cream, walnut, dark);
        float cloud = fn(vFloor * 1.3 + cell * 3.1) * 0.6 + fn(vFloor * 5.0) * 0.4;
        c *= 0.86 + 0.24 * cloud;
        c *= 0.92 + 0.16 * fh(cell);
        c = mix(c, vec3(0.16, 0.12, 0.09), joint * 0.8);
        diffuseColor.rgb = c;`,
      )
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(0.28, 0.55, joint);");
  };
  return m;
}
