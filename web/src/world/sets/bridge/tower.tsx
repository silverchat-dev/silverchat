"use client";

/**
 * The Order of Steering's tower (ch. 6), as Predict's home: an open-sky stone floor at the top with ten robed members
 * seated around the edge, the big green circle, and in front of it a stone box with a slot where stakes go in as sealed
 * dark-purple letters (ch. 7), revealed only when a market closes. Each live market is a banner on the tower, its gold
 * part the YES share and its blue part the NO share; a bronze plaque ranks the forecaster bots (ch. 27).
 */
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { stoneMaterial, weather } from "../../kit/materials";
import { rng } from "../../kit/noise";

/** the reserved colour: a green circle means "tap here", and nothing else in Meldan glows this green */
const TAP_GREEN = "#38ff86";

export const TOWER = { radius: 8.6, floor: 20, parapet: 1.4, inner: 8.25 };
export const YES = "#f2c14e";
export const NO = "#4f68b0";
const LETTER = "#3d1f57";

/** `yes` is null while the sides are sealed (the market still takes stakes, or no side is revealed yet) */
export type Market = { question: string; yes: number | null };

/** Several static parts as one geometry (one draw call): each part placed by position, rotation (Euler) and scale. */
function merged(parts: [THREE.BufferGeometry, [number, number, number], [number, number, number]?, number?][]) {
  const m = new THREE.Matrix4();
  return mergeGeometries(
    parts.map(([g, p, r = [0, 0, 0], k = 1]) => {
      const out = (g.index ? g.toNonIndexed() : g).applyMatrix4(m.compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(k, k, k)));
      out.deleteAttribute("uv");
      return out;
    }),
  )!;
}

/**
 * A market as a banner: blue (NO) all over, gold (YES) rising from the bottom to its share, the two numbers on it.
 * While the sides are sealed it shows no split, only a wax seal: nobody can know them yet.
 */
function bannerTexture(yes: number | null) {
  const W = 256;
  const H = 768;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const top = 40;
  const bottom = H - 46;
  g.fillStyle = "#2c2a3a";
  g.fillRect(0, 0, W, H);
  if (yes === null) return sealedBanner(c, g, top, bottom);
  g.fillStyle = NO;
  g.fillRect(14, top, W - 28, bottom - top);
  const split = bottom - (bottom - top) * THREE.MathUtils.clamp(yes, 0, 1);
  g.fillStyle = YES;
  g.fillRect(14, split, W - 28, bottom - split);
  g.fillStyle = "#fff4dc";
  g.fillRect(14, split - 4, W - 28, 8);
  // a fringe of tassels along the bottom hem
  g.fillStyle = "#d9a93c";
  for (let x = 18; x < W - 14; x += 20) g.fillRect(x, bottom + 6, 10, 34);
  g.textAlign = "center";
  g.textBaseline = "middle";
  const yesPct = Math.round(yes * 100);
  const label = (text: string, sub: string, y: number, colour: string) => {
    g.fillStyle = colour;
    g.font = "600 44px sans-serif";
    g.fillText(text, W / 2, y);
    g.font = "700 64px sans-serif";
    g.fillText(sub, W / 2, y + 58);
  };
  if (bottom - split > 150) label("YES", `${yesPct}%`, split + 50, "#3a2a0c");
  else label("YES", `${yesPct}%`, split - 128, "#fff4dc");
  if (split - top > 150) label("NO", `${100 - yesPct}%`, top + 52, "#eef0ff");
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** The sealed banner: the Order's purple, a gold wax seal, and the word SEALED. */
function sealedBanner(c: HTMLCanvasElement, g: CanvasRenderingContext2D, top: number, bottom: number) {
  const W = c.width;
  g.fillStyle = "#4b3a78";
  g.fillRect(14, top, W - 28, bottom - top);
  g.fillStyle = "#d9a93c";
  for (let x = 18; x < W - 14; x += 20) g.fillRect(x, bottom + 6, 10, 34);
  const cy = (top + bottom) / 2 - 40;
  g.fillStyle = "#c9932e";
  g.beginPath();
  g.arc(W / 2, cy, 62, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#8a5f17";
  g.lineWidth = 6;
  g.beginPath();
  g.arc(W / 2, cy, 44, 0, Math.PI * 2);
  g.stroke();
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "#f3e7c9";
  g.font = "700 44px sans-serif";
  g.fillText("SEALED", W / 2, cy + 130);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Cloth that hangs from its top edge and stirs in the breeze: the further down, the more it moves. */
function clothMaterial(map: THREE.Texture, phase: number) {
  const m = new THREE.MeshStandardMaterial({ map, roughness: 0.85, side: THREE.DoubleSide, emissive: "#ffffff", emissiveMap: map, emissiveIntensity: 0.12 });
  m.onBeforeCompile = (s) => {
    s.uniforms.uTime = weather.time;
    s.uniforms.uPhase = { value: phase };
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform float uPhase;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float hang = clamp(-position.y / 6.0, 0.0, 1.0);
        float t = uTime + uPhase;
        transformed.z += hang * hang * (0.35 * sin(t * 1.3 + position.y * 0.6) + 0.12 * sin(t * 2.9 + position.x * 2.0)) + hang * 0.15;
        transformed.x += hang * hang * 0.08 * sin(t * 1.1 + position.y);`,
      );
  };
  return m;
}

/** One banner `w` by `h`, hanging down from (0, 0, 0). */
function Banner({ yes, w, h, phase }: { yes: number | null; w: number; h: number; phase: number }) {
  const geometry = useMemo(() => new THREE.PlaneGeometry(w, h, 4, 16).translate(0, -h / 2, 0), [w, h]);
  const material = useMemo(() => clothMaterial(bannerTexture(yes), phase), [yes, phase]);
  return <mesh geometry={geometry} material={material} />;
}

/** The forecaster bots' leaderboard: five ranks, a little bot face for each, its score as a bar. */
function boardTexture() {
  const W = 512;
  const H = 600;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#2a2733";
  g.fillRect(0, 0, W, H);
  g.strokeStyle = "#c9a35a";
  g.lineWidth = 10;
  g.strokeRect(12, 12, W - 24, H - 24);
  // the heading: a bot's face and a crown over it
  g.fillStyle = "#c9a35a";
  g.beginPath();
  g.moveTo(206, 70);
  g.lineTo(226, 40);
  g.lineTo(256, 64);
  g.lineTo(286, 40);
  g.lineTo(306, 70);
  g.closePath();
  g.fill();
  g.fillStyle = "#e9e2d2";
  g.beginPath();
  g.roundRect(216, 72, 80, 56, 16);
  g.fill();
  g.fillStyle = "#2a2733";
  g.beginPath();
  g.arc(238, 100, 8, 0, Math.PI * 2);
  g.arc(274, 100, 8, 0, Math.PI * 2);
  g.fill();
  const rows = [
    { score: 92, medal: "#f2c14e", face: "#e9e2d2" },
    { score: 88, medal: "#d8dde6", face: "#cfe0ea" },
    { score: 83, medal: "#d08a52", face: "#ead9c4" },
    { score: 77, medal: "#8f8aa3", face: "#d9d3e8" },
    { score: 71, medal: "#8f8aa3", face: "#d5e3d0" },
  ];
  g.textAlign = "center";
  g.textBaseline = "middle";
  rows.forEach((r, i) => {
    const y = 180 + i * 84;
    g.fillStyle = r.medal;
    g.beginPath();
    g.arc(62, y, 26, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#2a2733";
    g.font = "700 34px sans-serif";
    g.fillText(String(i + 1), 62, y + 2);
    g.fillStyle = r.face;
    g.beginPath();
    g.roundRect(104, y - 22, 54, 44, 12);
    g.fill();
    g.fillStyle = "#2a2733";
    g.fillRect(117, y - 6, 8, 10);
    g.fillRect(137, y - 6, 8, 10);
    const len = ((r.score - 50) / 50) * 250;
    g.fillStyle = "#3a3646";
    g.fillRect(176, y - 15, 250, 30);
    g.fillStyle = i === 0 ? "#f2c14e" : "#c9a35a";
    g.fillRect(176, y - 15, len, 30);
    g.fillStyle = "#f3ead6";
    g.font = "600 34px sans-serif";
    g.fillText(String(r.score), 462, y + 2);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** One seated member, facing +z: a robe from hood to ankle, the lap and shins, sleeves folded on the lap. */
function seatedGeometry() {
  const flat = (g: THREE.BufferGeometry) => (g.index ? g.toNonIndexed() : g);
  const torso = new THREE.LatheGeometry(
    [[0, 0], [0.42, 0], [0.4, 0.3], [0.31, 0.7], [0.22, 0.95], [0.1, 1.04], [0, 1.05]].map(([x, y]) => new THREE.Vector2(x, y)),
    16,
  ).translate(0, 0, -0.12);
  const lap = new RoundedBoxGeometry(0.66, 0.28, 0.62, 2, 0.1).translate(0, 0.12, 0.22);
  const shins = new RoundedBoxGeometry(0.64, 0.6, 0.3, 2, 0.1).translate(0, -0.2, 0.45);
  const sleeves = new THREE.CapsuleGeometry(0.11, 0.42, 4, 8).rotateZ(Math.PI / 2).translate(0, 0.36, 0.3);
  const hood = new THREE.SphereGeometry(0.26, 16, 12).scale(1, 1.18, 1.08).translate(0, 1.2, -0.1);
  const peak = new THREE.ConeGeometry(0.14, 0.3, 10).rotateX(-0.9).translate(0, 1.42, -0.24);
  return mergeGeometries([torso, lap, shins, sleeves, hood, peak].map(flat))!;
}

/** The ten members of the Order, in dark purple robes, seated on the bench around the edge and facing the circle. */
function Order({ radius }: { radius: number }) {
  const robe = useRef<THREE.InstancedMesh>(null);
  const face = useRef<THREE.InstancedMesh>(null);
  const body = useMemo(() => seatedGeometry(), []);
  const N = 10;
  useLayoutEffect(() => {
    const r = rng(10);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < N; i++) {
      // a gap is left at the front, where the stairs come up
      const a = ((i + 0.5) / N) * Math.PI * 2;
      const x = Math.sin(a) * radius;
      const z = Math.cos(a) * radius;
      // local +z faces the centre; each turns a little towards the circle or a neighbour
      q.setFromAxisAngle(up, a + Math.PI + (r() - 0.5) * 0.3);
      const k = 0.95 + r() * 0.12;
      m.compose(new THREE.Vector3(x, 0.48, z), q, new THREE.Vector3(k, k, k));
      robe.current!.setMatrixAt(i, m);
      // the shadow inside the hood
      const f = new THREE.Vector3(0, 1.17, 0.08).multiplyScalar(k).applyQuaternion(q);
      m.compose(new THREE.Vector3(x + f.x, 0.48 + f.y, z + f.z), q, new THREE.Vector3(k, k, k * 0.7));
      face.current!.setMatrixAt(i, m);
      c.set(["#3a2350", "#432a5c", "#34204a"][i % 3]).multiplyScalar(0.92 + r() * 0.16);
      robe.current!.setColorAt(i, c);
    }
    for (const mesh of [robe, face]) mesh.current!.instanceMatrix.needsUpdate = true;
    robe.current!.instanceColor!.needsUpdate = true;
  }, [radius]);
  return (
    <>
      <instancedMesh ref={robe} args={[body, undefined, N]} castShadow receiveShadow>
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={face} args={[undefined, undefined, N]}>
        <sphereGeometry args={[0.17, 12, 8]} />
        <meshStandardMaterial color="#120a18" roughness={1} />
      </instancedMesh>
    </>
  );
}

/** A sealed letter: a dark-purple envelope (its seal is a separate gold disc). */
function letterGeometry() {
  return new RoundedBoxGeometry(0.86, 0.04, 0.58, 1, 0.015);
}

/** where a letter is at phase p (0 to 1) of its flight from the circle to the slot, and how far it has turned */
const flight = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 1.0, 2.7),
  new THREE.Vector3(0.2, 2.6, 2.3),
  new THREE.Vector3(0, 3.3, 0.9),
  new THREE.Vector3(0, 2.75, 0),
]);

/**
 * The box where stakes are sealed: a stone pillar holding a purple box bound in brass, a dark slot on top. From the
 * green circle a letter rises, turns on its edge over the box and slips into the slot; beside it, a stack of sealed
 * letters waits for the market to close.
 */
function SealBox({ stone, slotY }: { stone: THREE.Material; slotY: number }) {
  const pillar = useMemo(
    () =>
      new THREE.LatheGeometry(
        [[0, 0], [0.95, 0], [0.95, 0.16], [0.7, 0.26], [0.6, 0.8], [0.8, 0.9], [0.8, 1.0], [0, 1.0]].map(([x, y]) => new THREE.Vector2(x, y)),
        32,
      ),
    [],
  );
  const box = useMemo(() => new RoundedBoxGeometry(1.5, 1.2, 1.1, 3, 0.12), []);
  const letter = useMemo(() => letterGeometry(), []);
  const brass = useMemo(
    () =>
      merged([
        [new THREE.BoxGeometry(0.1, 1.22, 1.13), [-0.48, 1.6, 0]],
        [new THREE.BoxGeometry(0.1, 1.22, 1.13), [0.48, 1.6, 0]],
        [new THREE.BoxGeometry(1.15, 0.06, 0.5), [0, slotY - 0.03, 0]],
        [new THREE.CylinderGeometry(0.24, 0.24, 0.04, 24), [0, 1.6, 0.56], [Math.PI / 2, 0, 0]],
      ]),
    [slotY],
  );
  const stack = useMemo(
    () => merged([0, 1, 2, 3, 4].map((k) => [letterGeometry(), [(k % 2) * 0.04 - 0.02, 0.63 + k * 0.045, (k % 3) * 0.03 - 0.03], [0, (k - 2) * 0.14, 0]])),
    [],
  );
  const letters = useRef<THREE.Group[]>([]);
  const p = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const t = weather.time.value;
    letters.current.forEach((g, i) => {
      if (!g) return;
      const k = (t * 0.13 + i / 2) % 1;
      const fly = THREE.MathUtils.smoothstep(k, 0.05, 0.7);
      const slide = THREE.MathUtils.smoothstep(k, 0.7, 0.88);
      flight.getPoint(fly, p);
      g.position.set(p.x, p.y - slide * 1.1 - (2.75 - slotY - 0.3) * fly, p.z);
      g.rotation.set(THREE.MathUtils.smoothstep(fly, 0.55, 1) * Math.PI * 0.5 - (1 - fly) * 0.25, Math.sin(t * 0.8 + i) * 0.25 * (1 - fly), Math.sin(t * 1.3 + i) * 0.15 * (1 - fly));
      // it appears out of the circle and is gone once inside the box
      g.scale.setScalar(THREE.MathUtils.smoothstep(k, 0.0, 0.08));
      g.visible = k < 0.88;
    });
  });
  return (
    <group>
      <mesh geometry={pillar} material={stone} castShadow receiveShadow />
      <mesh geometry={box} position={[0, 1.0 + 0.6, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#4a3361" roughness={0.5} />
      </mesh>
      {/* brass bands, the slot plate and, pressed into the front, a seal: what goes in stays sealed */}
      <mesh geometry={brass} castShadow>
        <meshStandardMaterial color="#c79a52" metalness={0.85} roughness={0.3} />
      </mesh>
      <mesh position={[0, slotY + 0.005, 0]}>
        <boxGeometry args={[0.96, 0.02, 0.09]} />
        <meshBasicMaterial color="#07040a" />
      </mesh>
      {[0, 1].map((i) => (
        <group key={i} ref={(g) => void (letters.current[i] = g!)}>
          <mesh geometry={letter} castShadow>
            <meshStandardMaterial color={LETTER} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.03, 0.05]}>
            <cylinderGeometry args={[0.1, 0.1, 0.025, 16]} />
            <meshStandardMaterial color="#d6a548" metalness={0.6} roughness={0.35} />
          </mesh>
        </group>
      ))}
      {/* sealed letters waiting on a low stone beside the box */}
      <group position={[1.55, 0, 0.35]}>
        <mesh material={stone} position={[0, 0.3, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.0, 0.6, 0.8]} />
        </mesh>
        <mesh geometry={stack} castShadow>
          <meshStandardMaterial color={LETTER} roughness={0.6} />
        </mesh>
        <mesh position={[0.02, 0.83, 0.03]}>
          <cylinderGeometry args={[0.1, 0.1, 0.025, 16]} />
          <meshStandardMaterial color="#d6a548" metalness={0.6} roughness={0.35} />
        </mesh>
      </group>
    </group>
  );
}

/** The tower itself and everything at its top. Drawn with its foot at (0, 0, 0); the front faces +z. `centre` is where
 * it stands in the set, so the floor's rings of flagstones are laid around it. */
export function Tower({ markets, centre }: { markets: Market[]; centre: THREE.Vector3 }) {
  const stone = useMemo(() => stoneMaterial({ a: "#cbbd9f", b: "#958670", brick: [1.0, 0.44], moss: 0.5 }), []);
  const floorStone = useMemo(() => stoneMaterial({ a: "#d4c7aa", b: "#a39479", brick: [1.0, 0.9], moss: 0.08, radial: centre }), [centre]);
  const { radius: R, floor: F, parapet: P, inner: I } = TOWER;
  const body = useMemo(
    () =>
      new THREE.LatheGeometry(
        [
          [I, F], [I, F + P], [R + 0.75, F + P], [R + 0.75, F - 1.0], [R, F - 2.0], [R + 0.55, -3], [0.1, -3],
        ].map(([x, y]) => new THREE.Vector2(x, y)).reverse(),
        72,
      ),
    [R, F, P, I],
  );
  const bench = useMemo(
    () =>
      new THREE.LatheGeometry(
        [[I, 0], [I - 1.0, 0], [I - 1.0, 0.42], [I - 1.1, 0.48], [I, 0.48]].map(([x, y]) => new THREE.Vector2(x, y)),
        72,
      ),
    [I],
  );
  // the battlements: merlons around the parapet, a gap left for each banner
  const merlons = useRef<THREE.InstancedMesh>(null);
  const corbels = useRef<THREE.InstancedMesh>(null);
  const MERLONS = 24;
  const CORBELS = 48;
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let i = 0; i < MERLONS; i++) {
      // none at the front, where the stairs come up: the parapet stays low there
      const a = ((i + 0.5) / MERLONS) * Math.PI * 2;
      if (Math.cos(a) > 0.55) {
        merlons.current!.setMatrixAt(i, m.makeScale(0, 0, 0));
        continue;
      }
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
      m.compose(new THREE.Vector3(Math.sin(a) * (R + 0.25), F + P + 0.45, Math.cos(a) * (R + 0.25)), q, new THREE.Vector3(1, 1, 1));
      merlons.current!.setMatrixAt(i, m);
    }
    for (let i = 0; i < CORBELS; i++) {
      const a = (i / CORBELS) * Math.PI * 2;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
      m.compose(new THREE.Vector3(Math.sin(a) * (R + 0.35), F - 1.45, Math.cos(a) * (R + 0.35)), q, new THREE.Vector3(1, 1, 1));
      corbels.current!.setMatrixAt(i, m);
    }
    merlons.current!.instanceMatrix.needsUpdate = true;
    corbels.current!.instanceMatrix.needsUpdate = true;
  }, [R, F, P]);

  const door = useMemo(
    () =>
      merged([
        [new THREE.PlaneGeometry(2.0, 3.4), [0, 1.7, R + 0.52]],
        [new THREE.CircleGeometry(1.0, 24, 0, Math.PI), [0, 3.4, R + 0.52]],
      ]),
    [R],
  );
  const slits = useMemo(
    () =>
      merged(
        [0.9, 2.3, -1.0, -2.4, 3.3, 1.6, -1.7].map((a, i) => {
          const y = 4 + (i % 3) * 3.5;
          const r = R + 0.55 - (0.55 * (y + 3)) / (F + 1) + 0.03;
          return [new THREE.BoxGeometry(0.28, 1.5, 0.1), [Math.sin(a) * r, y, Math.cos(a) * r], [0, a, 0]];
        }),
      ),
    [R, F],
  );
  const circle = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(() => {
    if (circle.current) circle.current.emissiveIntensity = 3.4 + Math.sin(weather.time.value * 2.2) * 0.7;
  });

  const shown = markets.slice(0, 4);
  // a banner's pole: a staff with a gilt crossbar and finial
  const pole = useMemo(
    () =>
      merged([
        [new THREE.CylinderGeometry(0.07, 0.09, 8.2, 8), [0, 4.1, -0.15]],
        [new THREE.CylinderGeometry(0.06, 0.06, 2.6, 8), [0, 7.85, 0], [0, 0, Math.PI / 2]],
        [new THREE.SphereGeometry(0.16, 12, 8), [0, 8.3, -0.15]],
      ]),
    [],
  );
  const board = useMemo(() => boardTexture(), []);
  // banners stand on poles along the back of the parapet, facing the circle and the bridge
  const backAngles = [0.78, 0.26, -0.26, -0.78].slice(0, shown.length).map((a) => Math.PI + a);
  const plaqueAngle = Math.PI + 1.42;

  return (
    <group>
      <mesh geometry={body} material={stone} castShadow receiveShadow />
      <instancedMesh ref={merlons} args={[undefined, stone, MERLONS]} castShadow receiveShadow>
        <boxGeometry args={[1.2, 0.9, 1.0]} />
      </instancedMesh>
      <instancedMesh ref={corbels} args={[undefined, stone, CORBELS]} castShadow>
        <boxGeometry args={[0.36, 0.9, 0.7]} />
      </instancedMesh>
      {/* the door at the foot, facing the stairs, and arrow slits up the wall */}
      <mesh geometry={door}>
        <meshStandardMaterial color="#4a3020" roughness={0.8} />
      </mesh>
      <mesh geometry={slits}>
        <meshBasicMaterial color="#120d0a" />
      </mesh>

      <group position={[0, F, 0]}>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 0]} material={floorStone} receiveShadow>
          <circleGeometry args={[I + 0.05, 72]} />
        </mesh>
        <mesh geometry={bench} material={stone} castShadow receiveShadow />
        <Order radius={I - 0.55} />
        <group position={[0, 0, -0.9]} scale={1.25}>
          <SealBox stone={stone} slotY={2.23} />
        </group>
        {/* the green circle, larger and brighter than usual (ch. 6): stand here to seal a stake */}
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.05, 2.1]}>
          <ringGeometry args={[1.55, 1.95, 96]} />
          <meshStandardMaterial ref={circle} color="#0f2a18" emissive={TAP_GREEN} emissiveIntensity={3.4} toneMapped={false} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.045, 2.1]}>
          <circleGeometry args={[1.55, 64]} />
          <meshStandardMaterial color="#13261a" emissive={TAP_GREEN} emissiveIntensity={0.1} roughness={0.4} />
        </mesh>

        {shown.map((mk, i) => {
          const a = backAngles[i];
          const r = R + 0.25;
          return (
            <group key={i} position={[Math.sin(a) * r, P, Math.cos(a) * r]} rotation-y={a + Math.PI}>
              <mesh geometry={pole} castShadow>
                <meshStandardMaterial color="#9a7442" metalness={0.6} roughness={0.4} />
              </mesh>
              <group position={[0, 7.8, 0]}>
                <Banner yes={mk.yes} w={2.3} h={6.2} phase={i * 1.7} />
              </group>
            </group>
          );
        })}

        {/* the forecaster bots' leaderboard, a bronze plaque standing on the parapet */}
        <group position={[Math.sin(plaqueAngle) * (R + 0.1), P, Math.cos(plaqueAngle) * (R + 0.1)]} rotation-y={plaqueAngle + Math.PI - 0.35}>
          <mesh material={stone} position={[0, 2.0, -0.1]} castShadow>
            <boxGeometry args={[3.4, 4.0, 0.5]} />
          </mesh>
          <mesh position={[0, 2.05, 0.16]}>
            <planeGeometry args={[3.0, 3.5]} />
            <meshStandardMaterial map={board} emissiveMap={board} emissive="#ffffff" emissiveIntensity={0.18} roughness={0.5} metalness={0.2} />
          </mesh>
        </group>
      </group>

      {/* the same markets hang as long banners down the tower's front, so they read from the bridge */}
      {shown.map((mk, i) => {
        const a = (i - (shown.length - 1) / 2) * 0.3;
        return (
          <group key={i} position={[Math.sin(a) * (R + 0.95), F - 2.2, Math.cos(a) * (R + 0.95)]} rotation-y={a}>
            <Banner yes={mk.yes} w={1.9} h={7.5} phase={i * 2.3 + 1} />
          </group>
        );
      })}
    </group>
  );
}
