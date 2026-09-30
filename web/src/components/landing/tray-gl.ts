import * as THREE from "three";

import { drawCard } from "./card";

/**
 * The developer tray in WebGL. The tray is 3 × 2 units, centred, seen from straight above by a camera D away, so the
 * plane z = 0 fills the canvas exactly and the resting print lands on the HTML card. A thin layer of developer lies
 * over it; its heights live on a small grid (a wave equation on the GPU). Each frame draws what is under the surface
 * (the tray, the submerged part of the print, the shadow of any part held up) to a texture, lays the surface over it,
 * shifted by the slope and catching the lamp, then draws whatever part of the print is out of the liquid on top.
 */

const D = 4.51;
// the surface of the developer, just above the print lying on the bottom
const SURFACE = 0.012;
// the liquid inside the tray plate, in plate uv with y up (measured on the plate), and its walls in tray units
const LIQUID = new THREE.Vector4(0.07, 0.08, 0.935, 0.915);
const WALLS = { x0: (LIQUID.x - 0.5) * 3, y0: (LIQUID.y - 0.5) * 2, x1: (LIQUID.z - 0.5) * 3, y1: (LIQUID.w - 0.5) * 2 };
// the print: 58% of the tray width, turned like the HTML card (CSS -1.2deg is counterclockwise: positive here)
const PRINT_W = 3 * 0.58;
const PRINT_H = PRINT_W * (977 / 1134);
const PRINT_ANGLE = (1.2 * Math.PI) / 180;
const CORNERS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
// the print nearly fills the tray: down in it, it can only turn this far before its corners meet the side walls
const FITS = Math.atan2(PRINT_W, PRINT_H) - Math.acos((WALLS.y1 - WALLS.y0 - 0.04) / Math.hypot(PRINT_W, PRINT_H));
// the lamp, above and to the upper left
const LAMP = new THREE.Vector3(-0.35, 0.45, 1).normalize();
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
const MAX_DROPS = 48;
// the rock on each block: one damped cycle at 0.7 Hz
const ROCK = { hz: 0.7, decay: 0.6, length: 1.6, force: 4e-4 };
// development: slow on its own, fast while the developer moves over the print (agitation, in extra seconds per second)
const AGITATION = { base: 0.2, max: 3, decay: 0.8, perAmp: 0.3, rock: 1.5 };
// the print stops changing after this much development time, and the loop may sleep
const DEVELOPED = 14;
// the print picked up: a stiff wet sheet held at one point and bending down from it (the far corner 10 to 20 degrees).
// Held still it comes up out of the developer; moved, it dips and is pulled through it.
const SHEET = { up: 0.4, low: 0.05, droop: 0.117, liftHz: 1.6, liftDamping: 0.85, followWater: 12, followAir: 22 };
// out of the liquid: a second of runoff, then drops from the lowest corner, fewer and fewer, until about 8 s; the film
// of developer on it drains in about 10 s. g in tray units (the tray is about 30 cm wide).
const DRIP = { sheeting: 1, rate: 4, fade: 2.5, stop: 0.2, drain: 10, g: 98 };

export type Tray = {
  setExposure(step: number): void;
  rock(): void;
  disturb(u: number, v: number, amp: number, radius: number): void;
  /** is (u, v) on the print lying in the tray */
  over(u: number, v: number): boolean;
  /** pick the print up at (u, v); false if it isn't there */
  grab(u: number, v: number): boolean;
  /** pick it up by its near corner (keyboard) */
  grabCorner(): void;
  move(u: number, v: number): void;
  nudge(dx: number, dy: number): void;
  drop(): void;
  dispose(): void;
};

const FLAT_VERT = `
in vec3 position;
in vec2 uv;
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const WORLD_VERT = `
in vec3 position;
in vec2 uv;
in vec3 normal;
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
out vec2 vUv;
out float vZ;
out vec3 vN;
void main() {
  vUv = uv;
  vZ = position.z;
  vN = normal;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const HEIGHTS = `
uniform sampler2D uState;
uniform vec2 uTexel;
uniform vec4 uLiquid;
bool wet(vec2 uv) { return all(greaterThanEqual(uv, uLiquid.xy)) && all(lessThanEqual(uv, uLiquid.zw)); }
// the walls reflect: past them the surface is level with the cell next to them
float h(vec2 uv, float c) { return wet(uv) ? texture(uState, uv).r : c; }
`;

const SIM = `
precision highp float;
in vec2 vUv;
out vec4 color;
${HEIGHTS}
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

const TRAY_FRAG = `
precision highp float;
in vec2 vUv;
out vec4 color;
uniform sampler2D uTray;
void main() { color = vec4(texture(uTray, vUv).rgb, 1.0); }`;

const PRINT = `
precision highp float;
in vec2 vUv;
in float vZ;
in vec3 vN;
out vec4 color;
uniform sampler2D uPaper;
uniform sampler2D uCard;
uniform float uDevTime;
uniform float uDmax;
uniform float uSpeed;
uniform float uFog;
uniform float uSurface;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// silver development: dark marks come up first and go furthest; each grain of the paper starts a little apart
float density(float target, vec2 grain) {
  float t = max(uDevTime - 0.6 - hash(grain) * 0.4, 0.0) * uSpeed;
  float d = min(uDmax * target * (1.0 - exp(-t * max(target, 0.35) / 1.2)), 1.0);
  float fog = uFog * (1.0 - exp(-uDevTime * uSpeed / 2.0));
  return 1.0 - (1.0 - d) * (1.0 - fog);
}

vec3 print() {
  float d = density(1.0 - texture(uCard, vUv).r, floor(vUv * vec2(567.0, 488.0)));
  return mix(texture(uPaper, vUv).rgb, vec3(0.078, 0.075, 0.07), d);
}
`;

const PRINT_UNDER = `${PRINT}
void main() {
  // a little past the surface, so the refracted edge never shows the tray through a gap; the part above covers it
  if (vZ > uSurface + 0.02) discard;
  color = vec4(print(), 1.0);
}`;

const PRINT_OVER = `${PRINT}
uniform vec3 uLamp;
uniform float uWet;
void main() {
  if (vZ <= uSurface) discard;
  vec3 n = normalize(vN);
  // lit by the lamp, so the bend shows: brighter where the sheet turns towards it, darker where it turns away
  vec3 col = print() * clamp(dot(n, uLamp) / uLamp.z, 0.75, 1.05);
  // wet paper out of the developer: darker, with a thin film of liquid that glints while it drains
  vec3 hv = normalize(uLamp + vec3(0.0, 0.0, 1.0));
  col += pow(max(dot(n, hv), 0.0), 400.0) * 0.16 * uWet;
  // where it comes out of the liquid, a bright meniscus, the same width on screen however steep the sheet
  col += 0.35 * (1.0 - smoothstep(0.0, 2.5 * fwidth(vZ), vZ - uSurface));
  color = vec4(col, 1.0);
}`;

// the shadow of the part held up, thrown by the lamp onto the tray and the print below; softer the higher it is
const SHADOW_VERT = `
in vec3 position;
in vec2 uv;
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
uniform vec2 uShift;
uniform float uSurface;
out vec2 vUv;
out float vH;
void main() {
  vUv = uv;
  vH = max(position.z - uSurface, 0.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy + uShift * vH, 0.0, 1.0);
}`;

const SHADOW_FRAG = `
precision highp float;
in vec2 vUv;
in float vH;
out vec4 color;
void main() {
  float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  color = vec4(0.0, 0.0, 0.0, 0.45 * smoothstep(0.0, 0.08, vH) * smoothstep(0.0, 0.02 + vH * 0.25, edge));
}`;

const SURFACE_FRAG = `
precision highp float;
in vec2 vUv;
out vec4 color;
${HEIGHTS}
uniform sampler2D uBelow;
uniform vec2 uShiftCap;
uniform vec3 uLamp;

void main() {
  float c = texture(uState, vUv).r;
  float hx = h(vUv + vec2(uTexel.x, 0.0), c) - h(vUv - vec2(uTexel.x, 0.0), c);
  float hy = h(vUv + vec2(0.0, uTexel.y), c) - h(vUv - vec2(0.0, uTexel.y), c);
  // slope per tray width: the differences span two cells, and the phone grid's cells are larger
  vec3 n = normalize(vec3(vec2(-hx, -hy) * 0.03125 / uTexel.x, 1.0));
  vec2 e = uLiquid.xy - vUv;
  vec2 f = vUv - uLiquid.zw;
  float inside = 1.0 - smoothstep(-0.008, 0.0, max(max(e.x, e.y), max(f.x, f.y)));

  // through a thin layer seen from above, what lies under it moves a little along the slope (a few pixels at most)
  vec3 col = texture(uBelow, vUv + clamp(n.xy * 0.05, -uShiftCap, uShiftCap) * inside).rgb;

  // the lamp: a flat surface only returns a sliver of it; slopes that face it flash, slopes that face away dim a touch
  vec3 hv = normalize(uLamp + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, hv), 0.0), 80.0) - pow(hv.z, 80.0);
  float fres = 0.02 + 0.98 * pow(1.0 - n.z, 5.0);
  col += vec3(max(spec, -0.03) * 1.4 + fres * 0.3) * inside;
  color = vec4(col, 1.0);
}`;

const smoothstep = (a: number, b: number, v: number) => {
  const t = Math.min(Math.max((v - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

export async function mountTray(canvas: HTMLCanvasElement, opts: { card: HTMLElement; phone: boolean; step: number; onLost: () => void }): Promise<Tray> {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  // the print carries text, so it gets real device pixels (up to 2x); the shading per pixel is a handful of reads
  const dpr = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(dpr);
  renderer.autoClear = false;

  // square cells over the 3:2 tray
  const [gw, gh] = opts.phone ? [128, 86] : [192, 128];
  const heights = () =>
    new THREE.WebGLRenderTarget(gw, gh, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
  let read = heights();
  let write = heights();
  const below = new THREE.WebGLRenderTarget(1, 1, { samples: 4, depthBuffer: false });

  // the plates are sampled as stored (sRGB) and written out as they are, the same values the HTML shows
  const loader = new THREE.TextureLoader();
  const [tray, paper, card] = await Promise.all([
    loader.loadAsync("/plates/tray.webp"),
    loader.loadAsync("/plates/paper.webp"),
    drawCard(opts.card, Math.min(2048, Math.round(opts.card.offsetWidth * dpr))).then((c) => new THREE.CanvasTexture(c)),
  ]);
  [tray, paper, card].forEach((t) => (t.anisotropy = 4));

  const flatCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const camera = new THREE.PerspectiveCamera((2 * Math.atan(1 / D) * 180) / Math.PI, 1.5, 0.1, 10);
  camera.position.z = D;
  const quad = new THREE.PlaneGeometry(2, 2);
  const texel = new THREE.Vector2(1 / gw, 1 / gh);
  const drops = Array.from({ length: MAX_DROPS }, () => new THREE.Vector4());
  const tilt = new THREE.Vector3();
  const shiftCap = new THREE.Vector2();
  let step = opts.step;
  const exposure = EXPOSURE[step] ?? EXPOSURE[2];
  const sincePaint = (performance.now() - (performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0)) / 1000;
  const raw = (vertexShader: string, fragmentShader: string, uniforms: Record<string, THREE.IUniform>, extra: THREE.ShaderMaterialParameters = {}) =>
    new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader, fragmentShader, uniforms, depthTest: false, depthWrite: false, ...extra });

  const sim = raw(FLAT_VERT, SIM, {
    uState: { value: read.texture },
    uTexel: { value: texel },
    uLiquid: { value: LIQUID },
    uC2: { value: C2 * (gw / 192) ** 2 }, // same speed across the tray on the phone grid
    uDamping: { value: DAMPING },
    uDrops: { value: drops },
    uDropCount: { value: 0 },
    uTilt: { value: tilt },
  });
  const surface = raw(FLAT_VERT, SURFACE_FRAG, {
    uState: { value: read.texture },
    uTexel: { value: texel },
    uLiquid: { value: LIQUID },
    uBelow: { value: below.texture },
    uShiftCap: { value: shiftCap },
    uLamp: { value: LAMP },
  });
  // shared by the print under the surface and the print above it
  const develop = {
    uPaper: { value: paper },
    uCard: { value: card },
    uSurface: { value: SURFACE },
    // pick up where the HTML print's own develop animation is (half speed after a 0.8 s start), so the switch doesn't show
    uDevTime: { value: sincePaint > 0.8 ? 0.8 + (sincePaint - 0.8) / 2 : sincePaint },
    uDmax: { value: exposure.dmax },
    uSpeed: { value: exposure.speed },
    uFog: { value: exposure.fog },
  };
  const wetness = { value: 1 };
  const shadow = raw(
    SHADOW_VERT,
    SHADOW_FRAG,
    { uShift: { value: new THREE.Vector2(-LAMP.x / LAMP.z, -LAMP.y / LAMP.z) }, uSurface: { value: SURFACE } },
    { transparent: true },
  );

  // the sheet: a grid in its own frame, bent and placed on the CPU each frame it moves
  const sheetGeometry = new THREE.PlaneGeometry(PRINT_W, PRINT_H, 40, 34);
  const flat = Float32Array.from(sheetGeometry.attributes.position.array);
  const positions = sheetGeometry.attributes.position.array as Float32Array;
  const normals = sheetGeometry.attributes.normal.array as Float32Array;
  const trayPlane = new THREE.PlaneGeometry(3, 2);
  // drawn in this order, without depth: the tray, the print under the surface, then the shadow over both
  const layer = (geometry: THREE.BufferGeometry, material: THREE.Material, order: number) =>
    Object.assign(new THREE.Mesh(geometry, material), { frustumCulled: false, renderOrder: order });

  const simScene = new THREE.Scene().add(layer(quad, sim, 0));
  const belowScene = new THREE.Scene().add(
    layer(trayPlane, raw(WORLD_VERT, TRAY_FRAG, { uTray: { value: tray } }), 0),
    layer(sheetGeometry, raw(WORLD_VERT, PRINT_UNDER, develop), 1),
    layer(sheetGeometry, shadow, 2),
  );
  const surfaceScene = new THREE.Scene().add(layer(quad, surface, 0));
  const aboveScene = new THREE.Scene().add(layer(sheetGeometry, raw(WORLD_VERT, PRINT_OVER, { ...develop, uLamp: { value: LAMP }, uWet: wetness }), 0));

  // points around the edge of the sheet (every fifth on the grid border), with their outward direction in its frame
  const [cols, rows] = [41, 35];
  const edge: { i: number; nx: number; ny: number }[] = [];
  for (let c = 0; c < cols; c += 5) edge.push({ i: c, nx: 0, ny: 1 }, { i: (rows - 1) * cols + c, nx: 0, ny: -1 });
  for (let r = 5; r < rows - 1; r += 5) edge.push({ i: r * cols, nx: -1, ny: 0 }, { i: r * cols + cols - 1, nx: 1, ny: 0 });
  const was = edge.map(() => ({ x: 0, y: 0, z: 0 }));
  const remember = () => edge.forEach(({ i }, k) => ([was[k].x, was[k].y, was[k].z] = [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]]));

  const sheet = {
    x: 0, y: 0, a: PRINT_ANGLE, vx: 0, vy: 0, va: 0, // pose of its centre
    held: false, hx: 0, hy: 0, // the point it is held by, in its own frame
    px: 0, py: 0, lx: 0, ly: 0, // the hand on the plane z = 0, now and one substep ago
    gvx: 0, gvy: 0, speed: 0, // the held point's velocity, and the hand's speed smoothed
    z: 0, vz: 0, // height of the held point
    submerged: 1, // share of its edge under the surface
    outAt: -1, // clock when it came out of the liquid, -1 while under
  };
  const drips: { at: number; x: number; y: number }[] = [];

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    below.setSize(Math.round(w * dpr), Math.round(h * dpr));
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
    shiftCap.set(3.5 / Math.max(w, 1), 3.5 / Math.max(h, 1));
    wake(0);
  };

  let pending = 0;
  let rockAt = -1;
  let clock = 0; // simulated seconds
  let agitation = 0;

  const disturb = (u: number, v: number, amp: number, radius: number) => {
    if (pending < MAX_DROPS) drops[pending++].set(u, v, amp, radius);
    agitation += Math.abs(amp) * AGITATION.perAmp;
    wake();
  };
  const splash = (x: number, y: number, amp: number, radius: number) => disturb(x / 3 + 0.5, y / 2 + 0.5, amp, radius);

  const waves = () => {
    sim.uniforms.uState.value = read.texture;
    sim.uniforms.uDropCount.value = pending;
    const t = clock - rockAt;
    tilt.z = rockAt >= 0 && t < ROCK.length ? ROCK.force * Math.sin(2 * Math.PI * ROCK.hz * t) * Math.exp(-t / ROCK.decay) : 0;
    renderer.setRenderTarget(write);
    renderer.render(simScene, flatCamera);
    [read, write] = [write, read];
    pending = 0;
  };

  // the sheet in the plane: the held point follows the hand through a critically damped spring, the rest swings
  // behind it, slowed by the developer (much more in it than in the air); let go, it glides to a stop
  const carry = (h: number) => {
    const s = sheet;
    const f = s.submerged;
    const cs = Math.cos(s.a);
    const sn = Math.sin(s.a);
    if (s.held) {
      const w0 = f * SHEET.followWater + (1 - f) * SHEET.followAir;
      // the hand is on the plane z = 0 under the pointer; the held point stays under the pointer at its own height
      const k = (D - s.z) / D;
      // the hand only takes the sheet as far as the walls let it (a hair inside the stop below, so the two never fight);
      // where it can't fit either way, it sits in the middle
      let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
      for (const [ex, ey] of CORNERS) {
        const [lx, ly] = [(ex * PRINT_W) / 2 - s.hx, (ey * PRINT_H) / 2 - s.hy];
        [x0, x1] = [Math.min(x0, cs * lx - sn * ly), Math.max(x1, cs * lx - sn * ly)];
        [y0, y1] = [Math.min(y0, sn * lx + cs * ly), Math.max(y1, sn * lx + cs * ly)];
      }
      const within = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(Math.max(v, lo), hi));
      const tx = within(s.px * k, WALLS.x0 + 0.03 - x0, WALLS.x1 - 0.03 - x1);
      const ty = within(s.py * k, WALLS.y0 + 0.03 - y0, WALLS.y1 - 0.03 - y1);
      let gx = s.x + cs * s.hx - sn * s.hy;
      let gy = s.y + sn * s.hx + cs * s.hy;
      s.gvx += (w0 * w0 * (tx - gx) - 2 * w0 * s.gvx) * h;
      s.gvy += (w0 * w0 * (ty - gy) - 2 * w0 * s.gvy) * h;
      gx += s.gvx * h;
      gy += s.gvy * h;
      // from the held point to the centre; the drag on the centre turns the sheet about the held point
      const px = -(cs * s.hx - sn * s.hy);
      const py = -(sn * s.hx + cs * s.hy);
      const drag = 1.5 + 5 * f;
      const inertia = (PRINT_W ** 2 + PRINT_H ** 2) / 12 + px * px + py * py;
      s.va = ((s.va * inertia) / h - drag * (px * s.gvy - py * s.gvx)) / (inertia / h + drag * (px * px + py * py) + 0.6 + 1.1 * f);
      s.a += s.va * h;
      const x = gx - (Math.cos(s.a) * s.hx - Math.sin(s.a) * s.hy);
      const y = gy - (Math.sin(s.a) * s.hx + Math.cos(s.a) * s.hy);
      s.vx = (x - s.x) / h;
      s.vy = (y - s.y) / h;
      s.x = x;
      s.y = y;
      // how fast the hand moves (not the sheet, so the two can't feed each other)
      s.speed += (Math.hypot(s.px - s.lx, s.py - s.ly) / h - s.speed) * (h / 0.12);
      [s.lx, s.ly] = [s.px, s.py];
    } else {
      const k = Math.exp(-h * (1 + 5 * f));
      s.vx *= k;
      s.vy *= k;
      s.va *= Math.exp(-h * (1 + 4 * f));
      s.x += s.vx * h;
      s.y += s.vy * h;
      s.a += s.va * h;
      s.speed *= k;
    }
    const target = s.held ? SHEET.up + (SHEET.low - SHEET.up) * smoothstep(0.25, 1, s.speed) : 0;
    const w = 2 * Math.PI * SHEET.liftHz;
    s.vz += (w * w * (target - s.z) - 2 * SHEET.liftDamping * w * s.vz) * h;
    s.z += s.vz * h;

    // the walls stop it while it is down in the liquid; held up it clears the rim and may turn a little more, and as it
    // comes down they ease it back in and straight
    const turn = s.z > 0.1 ? 0.14 : FITS;
    if (Math.abs(s.a) > turn) {
      const edge = Math.sign(s.a) * turn;
      s.a = edge + (s.a - edge) * Math.exp(-h * 12);
      s.va *= 0.9;
    }
    if (s.z > 0.1) return;
    const c = Math.cos(s.a);
    const n = Math.sin(s.a);
    let [lx, hx, ly, hy] = [-Infinity, Infinity, -Infinity, Infinity];
    for (const [ex, ey] of CORNERS) {
      const x = s.x + (c * ex * PRINT_W) / 2 - (n * ey * PRINT_H) / 2;
      const y = s.y + (n * ex * PRINT_W) / 2 + (c * ey * PRINT_H) / 2;
      lx = Math.max(lx, WALLS.x0 + 0.02 - x);
      hx = Math.min(hx, WALLS.x1 - 0.02 - x);
      ly = Math.max(ly, WALLS.y0 + 0.02 - y);
      hy = Math.min(hy, WALLS.y1 - 0.02 - y);
    }
    // (still coming straight and too big for the gap: sit it in the middle until it fits)
    const dx = lx > hx ? (lx + hx) / 2 : lx > 0 ? lx : hx < 0 ? hx : 0;
    const dy = ly > hy ? (ly + hy) / 2 : ly > 0 ? ly : hy < 0 ? hy : 0;
    const ease = 1 - Math.exp(-h * 12);
    if (dx) [s.x, s.vx, s.gvx] = [s.x + dx * ease, 0, 0];
    if (dy) [s.y, s.vy, s.gvy] = [s.y + dy * ease, 0, 0];
  };

  // bend the sheet down from the held point, place it, and fill positions and normals
  const bend = () => {
    const s = sheet;
    const cs = Math.cos(s.a);
    const sn = Math.sin(s.a);
    const gx = s.x + cs * s.hx - sn * s.hy;
    const gy = s.y + sn * s.hx + cs * s.hy;
    const soft = 0.02 * Math.min(1, Math.max(s.z, 0) / 0.05);
    for (let i = 0; i < positions.length; i += 3) {
      const x = s.x + cs * flat[i] - sn * flat[i + 1];
      const y = s.y + sn * flat[i] + cs * flat[i + 1];
      const dx = x - gx;
      const dy = y - gy;
      const b = s.z - SHEET.droop * (dx * dx + dy * dy);
      // max(0, b), smoothed so the bend meets the bottom without a crease
      let z = Math.max(b, 0);
      let t = b > 0 ? 1 : 0;
      if (Math.abs(b) < soft) {
        const k = (soft - Math.abs(b)) / soft;
        z += (k * k * soft) / 4;
        t = 0.5 + (0.5 * b) / soft;
      }
      const nx = 2 * SHEET.droop * dx * t;
      const ny = 2 * SHEET.droop * dy * t;
      const l = Math.hypot(nx, ny, 1);
      positions[i] = x;
      positions[i + 1] = y;
      positions[i + 2] = z;
      normals[i] = nx / l;
      normals[i + 1] = ny / l;
      normals[i + 2] = 1 / l;
    }
    sheetGeometry.attributes.position.needsUpdate = true;
    sheetGeometry.attributes.normal.needsUpdate = true;
  };

  // what the moving sheet does to the developer: edges landing ring it, edges leaving it tug it, submerged edges push
  // it ahead and pull it behind; out of it, runoff and then drops from the lowest corner
  const shed = (dt: number) => {
    const s = sheet;
    const cs = Math.cos(s.a);
    const sn = Math.sin(s.a);
    let under = 0;
    let low: { x: number; y: number; z: number } | null = null;
    edge.forEach(({ i, nx, ny }, k) => {
      const [x, y, z] = [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
      const p = was[k];
      if (dt > 0) {
        if (p.z > SURFACE && z <= SURFACE) splash(x, y, Math.min(0.03, ((p.z - z) / dt) * 0.02), 0.025);
        else if (p.z <= SURFACE && z > SURFACE) splash(x, y, -0.006, 0.02);
        else if (z <= SURFACE) {
          const push = ((x - p.x) * (cs * nx - sn * ny) + (y - p.y) * (sn * nx + cs * ny)) * 0.6;
          if (Math.abs(push) > 0.0006) splash(x, y, Math.max(-0.02, Math.min(0.02, push)), 0.025);
        }
      }
      if (z <= SURFACE) under++;
      else if (z > SURFACE + 0.01 && (!low || z < low.z)) low = { x, y, z };
      [p.x, p.y, p.z] = [x, y, z];
    });
    s.submerged = under / edge.length;

    if (low && s.outAt < 0) s.outAt = clock;
    if (!low && under === edge.length) s.outAt = -1;
    if (s.outAt >= 0 && low) {
      const { x, y, z } = low;
      const t = clock - s.outAt;
      if (t < DRIP.sheeting) splash(x, y, 0.004, 0.015);
      else {
        const rate = DRIP.rate * Math.exp(-(t - DRIP.sheeting) / DRIP.fade);
        const fall = Math.sqrt((2 * z) / DRIP.g);
        if (rate > DRIP.stop && Math.random() < rate * dt) drips.push({ at: clock + fall, x: x + (Math.random() - 0.5) * 0.02, y: y + (Math.random() - 0.5) * 0.02 });
      }
    }
    for (let k = drips.length - 1; k >= 0; k--) {
      if (drips[k].at > clock) continue;
      splash(drips[k].x, drips[k].y, 0.02, 0.012);
      drips.splice(k, 1);
    }
    wetness.value = s.outAt < 0 ? 1 : Math.exp(-(clock - s.outAt) / DRIP.drain);
  };

  const moving = () => {
    const s = sheet;
    return s.held || Math.abs(s.z) > 1e-3 || Math.abs(s.vz) > 1e-3 || Math.hypot(s.vx, s.vy) > 1e-3 || Math.abs(s.va) > 1e-3 || drips.length > 0;
  };

  // fixed substeps, as many as the frame took (at most 50 ms worth after a stall). Once everything is calm it only
  // ticks a few times a second while the print still comes up, without moving the water, and sleeps when it is done.
  let raf = 0;
  let slow = 0;
  let last = 0;
  let acc = 0;
  let calmAt = 0;
  let visible = true;
  // raf stays set while a frame runs, so splashes made during it don't ask for a second one
  const frame = (now: number) => {
    const dt = Math.min((now - last) / 1000, 0.25);
    last = now;
    const active = moving();
    if (active || now < calmAt) {
      acc = Math.min(acc + dt, 0.05);
      let stepped = 0;
      while (acc >= SUBSTEP) {
        if (active) carry(SUBSTEP);
        waves();
        acc -= SUBSTEP;
        clock += SUBSTEP;
        stepped += SUBSTEP;
      }
      if (active) {
        bend();
        shed(stepped);
        calmAt = Math.max(calmAt, now + 2000);
      }
    }
    agitation *= Math.exp(-dt / AGITATION.decay);
    develop.uDevTime.value += dt * (AGITATION.base + Math.min(agitation, AGITATION.max));

    renderer.setRenderTarget(below);
    renderer.clear();
    renderer.render(belowScene, camera);
    renderer.setRenderTarget(null);
    surface.uniforms.uState.value = read.texture;
    renderer.render(surfaceScene, flatCamera);
    if (sheet.z > 0) renderer.render(aboveScene, camera);

    raf = 0;
    if (!visible) return;
    if (now < calmAt) raf = requestAnimationFrame(frame);
    else if (develop.uDevTime.value < DEVELOPED) slow = window.setTimeout(() => wake(0), 120);
  };
  function wake(seconds = 4) {
    calmAt = Math.max(calmAt, performance.now() + seconds * 1000);
    clearTimeout(slow);
    if (!raf && visible) {
      last ||= performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

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

  bend();
  remember();
  resize();

  // (u, v) on the plane z = 0, and a point of that plane in the sheet's own frame
  const plane = (u: number, v: number): [number, number] => [(u - 0.5) * 3, (v - 0.5) * 2];
  const local = ([x, y]: [number, number]): [number, number] => {
    const [dx, dy, cs, sn] = [x - sheet.x, y - sheet.y, Math.cos(sheet.a), Math.sin(sheet.a)];
    return [cs * dx + sn * dy, -sn * dx + cs * dy];
  };
  const over = (u: number, v: number) => {
    const [lx, ly] = local(plane(u, v));
    return sheet.z < 0.02 && Math.abs(lx) < PRINT_W / 2 && Math.abs(ly) < PRINT_H / 2;
  };
  const hold = ([hx, hy]: [number, number]) => {
    const [cs, sn] = [Math.cos(sheet.a), Math.sin(sheet.a)];
    const [px, py] = [sheet.x + cs * hx - sn * hy, sheet.y + sn * hx + cs * hy];
    Object.assign(sheet, { held: true, hx, hy, gvx: sheet.vx, gvy: sheet.vy, px, py, lx: px, ly: py, speed: 0 });
    wake();
  };

  return {
    setExposure(i) {
      if (i === step) return;
      step = i;
      const x = EXPOSURE[i] ?? EXPOSURE[2];
      develop.uDmax.value = x.dmax;
      develop.uSpeed.value = x.speed;
      develop.uFog.value = x.fog;
      // a fresh sheet goes in where the first one lay: it starts blank, and its edges push the liquid as it lands
      develop.uDevTime.value = 0;
      Object.assign(sheet, { x: 0, y: 0, a: PRINT_ANGLE, vx: 0, vy: 0, va: 0, held: false, z: 0, vz: 0, speed: 0, outAt: -1 });
      drips.length = 0;
      bend();
      remember();
      edge.forEach(({ i: j }, k) => k % 2 === 0 && splash(positions[j * 3], positions[j * 3 + 1], 0.012, 0.03));
    },
    rock() {
      // along the long side, the other way each time
      tilt.x = tilt.x > 0 ? -1 : 1;
      rockAt = clock;
      agitation += AGITATION.rock;
      wake(ROCK.length + 3);
    },
    disturb,
    over,
    grab(u, v) {
      if (!over(u, v)) return false;
      hold(local(plane(u, v)));
      return true;
    },
    grabCorner() {
      hold([PRINT_W / 2 - 0.08, -(PRINT_H / 2 - 0.08)]);
    },
    move(u, v) {
      [sheet.px, sheet.py] = plane(u, v);
      wake();
    },
    nudge(dx, dy) {
      sheet.px = Math.min(WALLS.x1, Math.max(WALLS.x0, sheet.px + dx));
      sheet.py = Math.min(WALLS.y1, Math.max(WALLS.y0, sheet.py + dy));
      wake();
    },
    drop() {
      sheet.held = false;
      wake();
    },
    dispose() {
      cancelAnimationFrame(raf);
      clearTimeout(slow);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onLost);
      [read, write, below].forEach((t) => t.dispose());
      [tray, paper, card].forEach((t) => t.dispose());
      [quad, trayPlane, sheetGeometry].forEach((g) => g.dispose());
      [simScene, belowScene, surfaceScene, aboveScene].forEach((s) =>
        s.traverse((o) => {
          if (o instanceof THREE.Mesh) (o.material as THREE.Material).dispose();
        }),
      );
      renderer.dispose();
    },
  };
}
