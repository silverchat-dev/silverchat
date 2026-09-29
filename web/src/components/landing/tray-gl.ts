import * as THREE from "three";

import { drawCard } from "./card";

/**
 * The developer tray in WebGL: a thin layer of liquid over the tray plate, and the example print developing under it,
 * seen from straight above. Heights live on a small grid (a wave equation on the GPU); the picture is the plate and the
 * print, shifted a little by the slope of the surface, with the lamp caught on the ripples.
 */

// the liquid inside the tray plate, in plate uv with y up (measured on the plate)
const LIQUID = new THREE.Vector4(0.07, 0.08, 0.935, 0.915);
// the print lies centred, 58% of the tray width, turned like the HTML card (CSS -1.2deg is counterclockwise: positive here)
const PRINT = { width: 0.58, aspect: 1134 / 977, angle: (1.2 * Math.PI) / 180 };
// exposure is the breadth dial: more light, a denser print that also comes up sooner; past 10K a little fog in the whites
const EXPOSURE = [
  { dmax: 0.45, speed: 0.6, fog: 0 },
  { dmax: 0.72, speed: 0.8, fog: 0 },
  { dmax: 1, speed: 1, fog: 0 },
  { dmax: 1, speed: 1.4, fog: 0.03 },
  { dmax: 1, speed: 1.9, fog: 0.06 },
];

const SUBSTEP = 1 / 180;
// c² in cells per substep on the 192-cell grid, under the 0.5 limit of the scheme: a ripple crosses the tray in about 1.6 s
const C2 = 0.39;
// velocity kept per substep: ripples lose half their height in about a second, and are gone in two or three
const DAMPING = 0.992;
const MAX_DROPS = 24;
// the rock on each block: one damped cycle at 0.7 Hz
const ROCK = { hz: 0.7, decay: 0.6, length: 1.6, force: 4e-4 };
// development: slow on its own, fast while the developer moves over the print (agitation, in extra seconds per second)
const AGITATION = { base: 0.2, max: 3, decay: 0.8, perAmp: 0.3, rock: 1.5 };
// the print stops changing after this much development time, and the loop may sleep
const DEVELOPED = 14;

export type Tray = {
  setExposure(step: number): void;
  rock(): void;
  disturb(u: number, v: number, amp: number, radius: number): void;
  dispose(): void;
};

const VERT = `
in vec3 position;
in vec2 uv;
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const COMMON = `
precision highp float;
in vec2 vUv;
out vec4 color;
uniform sampler2D uState;
uniform vec2 uTexel;
uniform vec4 uLiquid;
bool wet(vec2 uv) { return all(greaterThanEqual(uv, uLiquid.xy)) && all(lessThanEqual(uv, uLiquid.zw)); }
// the walls reflect: past them the surface is level with the cell next to them
float h(vec2 uv, float c) { return wet(uv) ? texture(uState, uv).r : c; }
`;

const SIM = `${COMMON}
uniform float uC2;
uniform float uDamping;
uniform vec4 uDrops[${MAX_DROPS}]; // u, v, amplitude, radius (in tray heights)
uniform int uDropCount;
uniform vec3 uTilt; // axis the tray is rocked along, force

void main() {
  if (!wet(vUv)) { color = vec4(0.0); return; }
  vec2 s = texture(uState, vUv).rg; // height now, height one substep ago
  float lap = h(vUv + vec2(uTexel.x, 0.0), s.r) + h(vUv - vec2(uTexel.x, 0.0), s.r)
            + h(vUv + vec2(0.0, uTexel.y), s.r) + h(vUv - vec2(0.0, uTexel.y), s.r) - 4.0 * s.r;
  float next = s.r + (s.r - s.g) * uDamping + uC2 * lap;
  for (int i = 0; i < ${MAX_DROPS}; i++) {
    if (i >= uDropCount) break;
    vec2 d = (vUv - uDrops[i].xy) * vec2(1.5, 1.0) / uDrops[i].w;
    float q = dot(d, d);
    // a dimple with a rim: it moves liquid around and adds none
    next += uDrops[i].z * (1.0 - q) * exp(-q);
  }
  // rocking the tray: the liquid runs up the low wall and away from the high one, and both fronts cross the tray
  float w = dot(vUv - 0.5, uTilt.xy);
  next += uTilt.z * (exp(-pow((w - 0.42) / 0.07, 2.0)) - exp(-pow((w + 0.42) / 0.07, 2.0)));
  color = vec4(next, s.r, 0.0, 1.0);
}`;

const SURFACE = `${COMMON}
uniform sampler2D uTray;
uniform sampler2D uPaper;
uniform sampler2D uCard;
uniform vec2 uShiftCap;
uniform vec2 uPrintSize; // in tray heights
uniform float uPrintAngle;
uniform float uDevTime;
uniform float uDmax;
uniform float uSpeed;
uniform float uFog;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// silver development: dark marks come up first and go furthest; each grain of the paper starts a little apart
float density(float target, vec2 grain) {
  float t = max(uDevTime - 0.6 - hash(grain) * 0.4, 0.0) * uSpeed;
  float d = min(uDmax * target * (1.0 - exp(-t * max(target, 0.35) / 1.2)), 1.0);
  float fog = uFog * (1.0 - exp(-uDevTime * uSpeed / 2.0));
  return 1.0 - (1.0 - d) * (1.0 - fog);
}

void main() {
  float c = texture(uState, vUv).r;
  float hx = h(vUv + vec2(uTexel.x, 0.0), c) - h(vUv - vec2(uTexel.x, 0.0), c);
  float hy = h(vUv + vec2(0.0, uTexel.y), c) - h(vUv - vec2(0.0, uTexel.y), c);
  // slopes per tray width, the same on the coarser phone grid
  vec3 n = normalize(vec3(vec2(-hx, -hy) * 1152.0 * uTexel.x, 1.0));
  vec2 e = uLiquid.xy - vUv;
  vec2 f = vUv - uLiquid.zw;
  float inside = 1.0 - smoothstep(-0.008, 0.0, max(max(e.x, e.y), max(f.x, f.y)));

  // through a thin layer seen from above, what lies under it moves a little along the slope (a few pixels at most)
  vec2 uv = vUv + clamp(n.xy * 0.05, -uShiftCap, uShiftCap) * inside;
  vec3 col = texture(uTray, uv).rgb;

  vec2 p = (uv - 0.5) * vec2(1.5, 1.0);
  float cs = cos(uPrintAngle), sn = sin(uPrintAngle);
  p = vec2(cs * p.x + sn * p.y, -sn * p.x + cs * p.y) / uPrintSize + 0.5;
  vec2 aa = fwidth(p);
  float cover = smoothstep(0.0, aa.x, p.x) * smoothstep(0.0, aa.x, 1.0 - p.x) * smoothstep(0.0, aa.y, p.y) * smoothstep(0.0, aa.y, 1.0 - p.y);
  if (cover > 0.0) {
    vec3 paper = texture(uPaper, p).rgb;
    float d = density(1.0 - texture(uCard, p).r, floor(p * vec2(567.0, 488.0)));
    col = mix(col, mix(paper, vec3(0.078, 0.075, 0.07), d), cover);
  }

  // the lamp: a flat surface only returns a sliver of it; slopes that face it flash, slopes that face away dim a touch
  vec3 l = normalize(vec3(-0.35, 0.45, 1.0));
  vec3 hv = normalize(l + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, hv), 0.0), 80.0) - pow(hv.z, 80.0);
  float fres = 0.02 + 0.98 * pow(1.0 - n.z, 5.0);
  col += vec3(max(spec, -0.03) * 1.4 + fres * 0.3) * inside;
  color = vec4(col, 1.0);
}`;

export async function mountTray(canvas: HTMLCanvasElement, opts: { card: HTMLElement; phone: boolean; step: number; onLost: () => void }): Promise<Tray> {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
  // the print carries text, so it gets real device pixels (up to 2x); the shading per pixel is a handful of reads
  const dpr = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(dpr);

  // square cells over the 3:2 tray
  const [gw, gh] = opts.phone ? [128, 86] : [192, 128];
  const target = () =>
    new THREE.WebGLRenderTarget(gw, gh, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
  let read = target();
  let write = target();

  // the plates are sampled as stored (sRGB) and written out as they are, the same values the HTML shows
  const loader = new THREE.TextureLoader();
  const [tray, paper, card] = await Promise.all([
    loader.loadAsync("/plates/tray.webp"),
    loader.loadAsync("/plates/paper.webp"),
    drawCard(opts.card, Math.min(2048, Math.round(opts.card.offsetWidth * dpr))).then((c) => new THREE.CanvasTexture(c)),
  ]);
  [tray, paper, card].forEach((t) => (t.anisotropy = 4));

  const quad = new THREE.PlaneGeometry(2, 2);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const texel = new THREE.Vector2(1 / gw, 1 / gh);
  const drops = Array.from({ length: MAX_DROPS }, () => new THREE.Vector4());
  const tilt = new THREE.Vector3();
  const shiftCap = new THREE.Vector2();
  const exposure = EXPOSURE[opts.step] ?? EXPOSURE[2];
  const sincePaint = (performance.now() - (performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0)) / 1000;

  const sim = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VERT,
    fragmentShader: SIM,
    uniforms: {
      uState: { value: read.texture },
      uTexel: { value: texel },
      uLiquid: { value: LIQUID },
      uC2: { value: C2 * (gw / 192) ** 2 }, // same speed across the tray on the phone grid
      uDamping: { value: DAMPING },
      uDrops: { value: drops },
      uDropCount: { value: 0 },
      uTilt: { value: tilt },
    },
  });
  const surface = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VERT,
    fragmentShader: SURFACE,
    uniforms: {
      uState: { value: read.texture },
      uTexel: { value: texel },
      uLiquid: { value: LIQUID },
      uTray: { value: tray },
      uPaper: { value: paper },
      uCard: { value: card },
      uShiftCap: { value: shiftCap },
      uPrintSize: { value: new THREE.Vector2(PRINT.width * 1.5, (PRINT.width * 1.5) / PRINT.aspect) },
      uPrintAngle: { value: PRINT.angle },
      // pick up where the HTML print's own develop animation is (half speed after a 0.8 s start), so the switch doesn't show
      uDevTime: { value: sincePaint > 0.8 ? 0.8 + (sincePaint - 0.8) / 2 : sincePaint },
      uDmax: { value: exposure.dmax },
      uSpeed: { value: exposure.speed },
      uFog: { value: exposure.fog },
    },
  });
  const simScene = new THREE.Scene().add(new THREE.Mesh(quad, sim));
  const scene = new THREE.Scene().add(new THREE.Mesh(quad, surface));

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    shiftCap.set(3.5 / Math.max(w, 1), 3.5 / Math.max(h, 1));
    wake(0);
  };

  let pending = 0;
  let rockAt = -1;
  let clock = 0; // simulated seconds
  const step = () => {
    sim.uniforms.uState.value = read.texture;
    sim.uniforms.uDropCount.value = pending;
    const t = clock - rockAt;
    tilt.z = rockAt >= 0 && t < ROCK.length ? ROCK.force * Math.sin(2 * Math.PI * ROCK.hz * t) * Math.exp(-t / ROCK.decay) : 0;
    renderer.setRenderTarget(write);
    renderer.render(simScene, camera);
    [read, write] = [write, read];
    pending = 0;
    clock += SUBSTEP;
  };

  // fixed substeps, as many as the frame took (at most 50 ms worth after a stall). Once the liquid is calm it only
  // ticks a few times a second while the print still comes up, and sleeps when it is done.
  let raf = 0;
  let slow = 0;
  let last = 0;
  let acc = 0;
  let calmAt = 0;
  let visible = true;
  let agitation = 0;
  const frame = (now: number) => {
    raf = 0;
    const dt = Math.min((now - last) / 1000, 0.25);
    last = now;
    acc = Math.min(acc + dt, 0.05);
    while (acc >= SUBSTEP) {
      step();
      acc -= SUBSTEP;
    }
    agitation *= Math.exp(-dt / AGITATION.decay);
    surface.uniforms.uDevTime.value += dt * (AGITATION.base + Math.min(agitation, AGITATION.max));
    renderer.setRenderTarget(null);
    surface.uniforms.uState.value = read.texture;
    renderer.render(scene, camera);
    if (!visible) return;
    if (now < calmAt) raf = requestAnimationFrame(frame);
    else if (surface.uniforms.uDevTime.value < DEVELOPED) slow = window.setTimeout(() => wake(0), 120);
  };
  function wake(seconds = 4) {
    calmAt = Math.max(calmAt, performance.now() + seconds * 1000);
    clearTimeout(slow);
    if (!raf && visible) {
      last ||= performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

  const disturb = (u: number, v: number, amp: number, radius: number) => {
    if (pending < MAX_DROPS) drops[pending++].set(u, v, amp, radius);
    agitation += amp * AGITATION.perAmp;
    wake();
  };

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  let onScreen = true;
  const io = new IntersectionObserver(([e]) => {
    onScreen = e.isIntersecting;
    visible = onScreen && document.visibilityState === "visible";
    if (visible) wake(0);
  });
  io.observe(canvas);
  const onVisibility = () => {
    visible = onScreen && document.visibilityState === "visible";
    if (visible) wake(0);
  };
  document.addEventListener("visibilitychange", onVisibility);
  const onLost = (e: Event) => {
    e.preventDefault();
    cancelAnimationFrame(raf);
    clearTimeout(slow);
    raf = 0;
    visible = false;
    opts.onLost();
  };
  canvas.addEventListener("webglcontextlost", onLost);

  resize();

  return {
    setExposure(i) {
      const x = EXPOSURE[i] ?? EXPOSURE[2];
      surface.uniforms.uDmax.value = x.dmax;
      surface.uniforms.uSpeed.value = x.speed;
      surface.uniforms.uFog.value = x.fog;
      // a fresh sheet goes in: it starts blank, and its edges push the liquid as it lands
      surface.uniforms.uDevTime.value = 0;
      const [w, h] = [PRINT.width, PRINT.width * (1.5 / PRINT.aspect)];
      for (let k = 0; k < 10; k++) {
        const s = (k % 5) / 4 - 0.5;
        const side = k % 2 ? 0.5 : -0.5;
        const [u, v] = k < 5 ? [0.5 + s * w, 0.5 + side * h] : [0.5 + side * w, 0.5 + s * h];
        disturb(u, v, 0.012, 0.03);
      }
    },
    rock() {
      // along the long side, the other way each time
      tilt.x = tilt.x > 0 ? -1 : 1;
      rockAt = clock;
      agitation += AGITATION.rock;
      wake(ROCK.length + 3);
    },
    disturb,
    dispose() {
      cancelAnimationFrame(raf);
      clearTimeout(slow);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onLost);
      [read, write].forEach((t) => t.dispose());
      [tray, paper, card].forEach((t) => t.dispose());
      quad.dispose();
      sim.dispose();
      surface.dispose();
      renderer.dispose();
    },
  };
}
