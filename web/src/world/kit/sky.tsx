"use client";

/**
 * A painted sky: a dome coloured from the zenith down to a warm horizon, a sun with a soft halo, and slow clouds made
 * of noise. It is art-directed rather than physical, so each hour of the walk can have exactly the colours we want,
 * and its values stay inside what the screen can show.
 */
import { useMemo } from "react";
import * as THREE from "three";

export type SkyColours = { zenith: string; horizon: string; ground: string; sun: string; cloud: string };

const vertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGround; uniform vec3 uSunColour; uniform vec3 uCloud;
  uniform vec3 uSun; uniform float uTime;
  varying vec3 vDir;
  float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * n(p); p *= 2.03; a *= 0.5; } return s; }
  void main() {
    vec3 d = normalize(vDir);
    float up = d.y;
    vec3 col = mix(uHorizon, uZenith, pow(smoothstep(0.0, 0.85, up), 0.65));
    col = mix(col, uGround, smoothstep(0.0, -0.12, up));
    // haze band just above the horizon
    col = mix(col, uHorizon * 1.04, exp(-abs(up) * 18.0) * 0.6);
    float s = max(dot(d, normalize(uSun)), 0.0);
    col += uSunColour * (pow(s, 900.0) * 6.0 + pow(s, 22.0) * 0.35 + pow(s, 4.0) * 0.12);
    // clouds on a flat layer seen in perspective, thinning towards the horizon
    if (up > 0.02) {
      vec2 p = d.xz / (up + 0.12) * 1.6 + vec2(uTime * 0.006, uTime * 0.002);
      float c = smoothstep(0.52, 0.82, fbm(p) * 0.85 + fbm(p * 3.1) * 0.25);
      float lit = 0.75 + 0.25 * s;
      col = mix(col, uCloud * lit + uSunColour * pow(s, 8.0) * 0.25, c * smoothstep(0.02, 0.22, up) * 0.9);
    }
    // stars, only once the sky is dark
    float dark = 1.0 - smoothstep(0.05, 0.25, dot(uZenith, vec3(0.33)));
    if (up > 0.0 && dark > 0.0) {
      vec2 g = d.xz / (up + 0.4) * 140.0;
      float star = step(0.9975, h(floor(g))) * smoothstep(0.5, 0.0, length(fract(g) - 0.5));
      col += vec3(star) * dark * (0.6 + 0.4 * sin(uTime * 2.0 + h(floor(g)) * 30.0));
    }
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export function PaintedSky({ sun, colours, time }: { sun: THREE.Vector3; colours: SkyColours; time: { value: number } }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uZenith: { value: new THREE.Color() },
          uHorizon: { value: new THREE.Color() },
          uGround: { value: new THREE.Color() },
          uSunColour: { value: new THREE.Color() },
          uCloud: { value: new THREE.Color() },
          uSun: { value: new THREE.Vector3() },
          uTime: time,
        },
      }),
    [time],
  );
  const u = material.uniforms;
  u.uZenith.value.set(colours.zenith);
  u.uHorizon.value.set(colours.horizon);
  u.uGround.value.set(colours.ground);
  u.uSunColour.value.set(colours.sun);
  u.uCloud.value.set(colours.cloud);
  u.uSun.value.copy(sun);
  return (
    <mesh material={material} renderOrder={-1} frustumCulled={false} scale={1000}>
      <sphereGeometry args={[1, 48, 24]} />
    </mesh>
  );
}

/** The sky's colours through the day: early warm, bright midday blue, gold late afternoon, dusk. */
export function skyAt(hour: number): SkyColours {
  const keys: [number, SkyColours][] = [
    [6, { zenith: "#2c4a7a", horizon: "#f2b58a", ground: "#6b5a4a", sun: "#ff9a5a", cloud: "#f6d2bd" }],
    [8, { zenith: "#2b67b5", horizon: "#f1dcc0", ground: "#7d8a6a", sun: "#ffe0a8", cloud: "#fff3e3" }],
    [10, { zenith: "#2f6db8", horizon: "#d4e6f0", ground: "#7d8a6a", sun: "#fff0d4", cloud: "#ffffff" }],
    [13, { zenith: "#2a62b0", horizon: "#d7e8f2", ground: "#7d8a6a", sun: "#fff8ea", cloud: "#ffffff" }],
    [16.5, { zenith: "#35619e", horizon: "#f3d3a0", ground: "#7a6e55", sun: "#ffc277", cloud: "#fbe6c8" }],
    [18, { zenith: "#1f2f57", horizon: "#e98a5c", ground: "#4a3b3a", sun: "#ff7a45", cloud: "#e7a588" }],
    [19.5, { zenith: "#121a3a", horizon: "#4b3f6e", ground: "#1d1a26", sun: "#ff9a6a", cloud: "#3e3a5c" }],
    [21, { zenith: "#070b1c", horizon: "#1c2547", ground: "#0b0c12", sun: "#c9d6ff", cloud: "#1b2240" }],
    [24, { zenith: "#05081a", horizon: "#141c3a", ground: "#08090e", sun: "#c9d6ff", cloud: "#151b34" }],
  ];
  let i = 0;
  while (i < keys.length - 2 && hour > keys[i + 1][0]) i++;
  const [h0, a] = keys[i];
  const [h1, b] = keys[i + 1];
  const t = THREE.MathUtils.clamp((hour - h0) / (h1 - h0), 0, 1);
  const mix = (k: keyof SkyColours) => "#" + new THREE.Color(a[k]).lerp(new THREE.Color(b[k]), t).getHexString();
  return { zenith: mix("zenith"), horizon: mix("horizon"), ground: mix("ground"), sun: mix("sun"), cloud: mix("cloud") };
}
