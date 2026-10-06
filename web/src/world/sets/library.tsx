"use client";

/**
 * The grand library of Pafogai Du (ch. 19, 24): Records, Scores, Docs. An ornamented door painted with a river horse
 * reading in a marsh and a hamster at a computer opens on a lamp-lit hall. The back is a wall of paper books with an
 * upper walkway (every past result, the newest glowing in their answers' colours), book-lined tunnels lead off into
 * the maze, terminals stand along the left wall (the open API), a tall board ranks the forecasters (Scores), and at
 * the desk a robed robot librarian asks "What is it that you seek?" (agents: bots that answer). The green circle is
 * in front of the desk. Dusk outside; inside, warm lamps, an orrery turning under the skylight, dust in the light.
 */
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { stoneMaterial, weather } from "../kit/materials";
import { rng } from "../kit/noise";
import { sunAt } from "../stage";
import { bookMaterial, floorMaterial, layBooks, type Run } from "./library/books";
import { hamsterPanel, lunettePanel, riverHorsePanel, rugPanel, screenPanel } from "./library/paint";
import { Outside } from "./library/outside";
import { type Box, Boxes, Globe, Instances, Librarian, Motes, Orrery, ScoresBoard, Shaft } from "./library/props";
import type { SetModule, SetProps } from "./types";

/** the reserved colour (as on the hill): a green circle means "tap here", and nothing else in Meldan glows this green */
const TAP_GREEN = "#38ff86";

const HOUR = 18.8;
/** the hall: x from -W to W, z from BACK to FRONT, roof at H */
const W = 18;
const BACK = -15;
const FRONT = 15;
const H = 12;
/** the face of the shelves on the back wall, the walkway's floor and the top of the books */
const FACE = BACK + 0.4;
const DECK = 4.65;
const TOP = 9.2;
/** shelf levels of the lower and upper tiers, and the clear height between shelves */
const LOWER = Array.from({ length: 9 }, (_, k) => 0.12 + k * 0.48);
const UPPER = Array.from({ length: 9 }, (_, k) => DECK + 0.1 + k * 0.48);
const CLEAR = 0.44;
const BAY = 1.2;
/** tunnels into the maze open in the lower tier here: inner half-width, straight height, frame width */
const TUNNELS = [-9.6, 9.6];
const ARCH = { half: 1.0, straight: 2.6, frame: 0.2 };
const TUNNEL_END = -24;
/** the desk and the stop */
const DESK: [number, number, number] = [0, 0, -5];
const SPOT: [number, number, number] = [0, 0, -1.85];
/** the newest records: a bay right behind the librarian */
const NEWEST = { x0: -1.2, x1: 1.2, y0: 1.0, y1: 2.5 };
/** terminals stand in empty bays along the left wall */
const TERMINALS = [-10.4, -5.6, -0.8, 4.0, 8.8];
/** tall arched windows high in the left wall */
const WINDOWS = [-8, 0, 8];
const SKY = { x: 4.5, z0: -12.5, z1: 10.5 };
const HALL = { w: W, front: FRONT, back: BACK, h: H };
/** the ring of candles over the desk, and the pendant lamps over the reading tables */
const CHANDELIER: [number, number, number] = [0, 6.6, -4.9];
const PENDANTS: [number, number, number][] = [[6.8, 6.2, -1.3], [6.8, 6.2, 3.2], [11.4, 6.2, -1.3], [11.4, 6.2, 3.2]];

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** An arch-topped outline: a rectangle `straight` tall with a half circle on top. */
function archPath(path: THREE.Path | THREE.Shape, cx: number, y0: number, half: number, straight: number) {
  path.moveTo(cx - half, y0);
  path.lineTo(cx - half, y0 + straight);
  // from left to right over the top
  path.absarc(cx, y0 + straight, half, Math.PI, 0, true);
  path.lineTo(cx + half, y0);
  path.lineTo(cx - half, y0);
}

/** A wall in the xy plane from x0 to x1, y0 to y1, `depth` thick (towards -z), with arched and round holes. */
function wallGeometry(x0: number, x1: number, y0: number, y1: number, depth: number, arches: { cx: number; y0: number; half: number; straight: number }[], rounds: { cx: number; cy: number; r: number }[] = []) {
  const s = new THREE.Shape();
  s.moveTo(x0, y0);
  s.lineTo(x1, y0);
  s.lineTo(x1, y1);
  s.lineTo(x0, y1);
  s.lineTo(x0, y0);
  for (const a of arches) {
    const p = new THREE.Path();
    archPath(p, a.cx, a.y0, a.half, a.straight);
    s.holes.push(p);
  }
  for (const r of rounds) {
    const p = new THREE.Path();
    p.absarc(r.cx, r.cy, r.r, 0, Math.PI * 2, true);
    s.holes.push(p);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 24 });
  g.translate(0, 0, -depth);
  return g;
}

/** The moulded frame around an arched opening: a band `frame` wide, `depth` deep, open at the floor. */
function archFrame(half: number, straight: number, frame: number, depth: number) {
  const o = half + frame;
  const s = new THREE.Shape();
  s.moveTo(-o, 0);
  s.lineTo(-o, straight);
  s.absarc(0, straight, o, Math.PI, 0, true);
  s.lineTo(o, 0);
  s.lineTo(half, 0);
  s.lineTo(half, straight);
  s.absarc(0, straight, half, 0, Math.PI, false);
  s.lineTo(-half, 0);
  s.lineTo(-o, 0);
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2, curveSegments: 32 });
}

/** Is a book (centre p, height h) inside one of the tunnel openings of the back wall? */
function inArch(p: THREE.Vector3, h: number) {
  if (p.z < FACE - 0.6) return false;
  for (const ax of TUNNELS) {
    const dx = Math.abs(p.x - ax);
    const outer = ARCH.half + ARCH.frame + 0.03;
    if (dx > outer) continue;
    if (p.y - h / 2 < ARCH.straight + Math.sqrt(outer * outer - dx * dx) + 0.02) return true;
  }
  return false;
}

/**
 * Every shelf in the hall and the tunnels as runs of books, plus the wood that holds them (shelf boards, uprights,
 * the backs of the empty terminal bays).
 */
function useShelves() {
  return useMemo(() => {
    const runs: Run[] = [];
    const wood: Box[] = [];
    const shelf = "#5a3824";
    const post = "#45291a";
    const back = "#2a1a10";
    const tiers = [
      [LOWER, DECK - 0.2],
      [UPPER, TOP],
    ] as const;
    // the back wall, both tiers, facing +z
    for (let k = 0; k < (2 * W) / BAY; k++) {
      const x0 = -W + k * BAY;
      const mid = x0 + BAY / 2;
      for (const [levels, top] of tiers) {
        for (const y of levels) {
          // in the bays of a tunnel only the shelves above its arch remain
          const arched = TUNNELS.some((ax) => Math.abs(mid - ax) < BAY) && y < ARCH.straight + ARCH.half + ARCH.frame + 0.1;
          if (arched) continue;
          runs.push({ start: v3(x0 + 0.03, y, FACE), along: v3(1, 0, 0), out: v3(0, 0, 1), length: BAY - 0.06, clear: CLEAR });
          wood.push({ p: [mid, y - 0.016, FACE - 0.2], s: [BAY, 0.032, 0.42], c: shelf });
        }
        const y0 = levels[0] - 0.12;
        // the middle upright of a tunnel's two bays would stand in its doorway: only its top part remains
        const inDoor = TUNNELS.some((ax) => Math.abs(x0 - ax) < 0.1) && levels === LOWER;
        const from = inDoor ? ARCH.straight + ARCH.half + ARCH.frame : y0;
        wood.push({ p: [x0, (from + top) / 2, FACE - 0.2], s: [0.06, top - from, 0.44], c: post });
      }
    }
    wood.push({ p: [W, TOP / 2, FACE - 0.2], s: [0.06, TOP, 0.44], c: post });
    // the right wall, both tiers, facing -x
    for (let z0 = FACE; z0 + BAY <= FRONT - 1; z0 += BAY) {
      for (const [levels, top] of tiers) {
        for (const y of levels) {
          runs.push({ start: v3(W - 0.4, y, z0 + 0.03), along: v3(0, 0, 1), out: v3(-1, 0, 0), length: BAY - 0.06, clear: CLEAR });
          wood.push({ p: [W - 0.2, y - 0.016, z0 + BAY / 2], s: [0.42, 0.032, BAY], c: shelf });
        }
        wood.push({ p: [W - 0.2, (levels[0] - 0.12 + top) / 2, z0], s: [0.44, top - levels[0] + 0.12, 0.06], c: post });
      }
    }
    // the left wall, lower tier only, with an empty bay for each terminal
    for (let z0 = FACE; z0 + BAY <= FRONT - 1; z0 += BAY) {
      const mid = z0 + BAY / 2;
      const terminal = TERMINALS.some((t) => Math.abs(t - mid) < 0.2);
      if (terminal) wood.push({ p: [-W + 0.05, DECK / 2 - 0.1, mid], s: [0.1, DECK - 0.2, BAY], c: back });
      else
        for (const y of LOWER) {
          runs.push({ start: v3(-W + 0.4, y, z0 + BAY - 0.03), along: v3(0, 0, -1), out: v3(1, 0, 0), length: BAY - 0.06, clear: CLEAR });
          wood.push({ p: [-W + 0.2, y - 0.016, mid], s: [0.42, 0.032, BAY], c: shelf });
        }
      wood.push({ p: [-W + 0.2, DECK / 2 - 0.1, z0], s: [0.44, DECK - 0.2, 0.06], c: post });
    }
    // the tunnels: books on both sides and across the far end; the outer side opens near the end, where the maze turns
    for (const ax of TUNNELS) {
      const outward = Math.sign(ax);
      const levels = LOWER.slice(0, 5);
      for (const side of [-1, 1]) {
        const x = ax + side * ARCH.half;
        const z1 = side === outward ? TUNNEL_END + 2.6 : TUNNEL_END;
        let z0 = BACK - 0.8;
        for (; z0 - BAY >= z1 - 0.01; z0 -= BAY) {
          for (const y of levels) runs.push({ start: v3(x, y, z0 - 0.02), along: v3(0, 0, -1), out: v3(-side, 0, 0), length: BAY - 0.04, clear: CLEAR, depth: 0.24 });
          wood.push({ p: [x + side * 0.13, 1.3, z0], s: [0.26, 2.6, 0.05], c: post });
        }
        for (const y of levels) wood.push({ p: [x + side * 0.13, y - 0.016, (BACK - 0.8 + z0) / 2], s: [0.28, 0.032, BACK - 0.8 - z0], c: shelf });
        wood.push({ p: [x + side * 0.3, 1.3, (BACK - 0.8 + z0) / 2], s: [0.06, 2.6, BACK - 0.8 - z0], c: back });
      }
      for (const y of levels) runs.push({ start: v3(ax - ARCH.half, y, TUNNEL_END), along: v3(1, 0, 0), out: v3(0, 0, 1), length: ARCH.half * 2, clear: CLEAR, depth: 0.24 });
      // the wall of the next corridor, seen through the turn
      for (const y of levels) runs.push({ start: v3(ax + outward * (ARCH.half + 2.2), y, TUNNEL_END + 2.8), along: v3(0, 0, -1), out: v3(-outward, 0, 0), length: 3.4, clear: CLEAR, depth: 0.24 });
    }
    return { runs, wood };
  }, []);
}

/** The books themselves, and the newest records (glowing in the colours of the newest result) as a second mesh. */
function Books({ runs, colours }: { runs: Run[]; colours: string[] }) {
  const material = useMemo(() => bookMaterial(), []);
  const glowMaterial = useMemo(() => bookMaterial(2.4), []);
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const laid = useMemo(() => {
    const { matrices, colours: cols } = layBooks(runs, rng(19), inArch);
    const plain: THREE.Matrix4[] = [];
    const plainC: THREE.Color[] = [];
    const glow: THREE.Matrix4[] = [];
    const glowC: THREE.Color[] = [];
    const p = new THREE.Vector3();
    const g = rng(24);
    matrices.forEach((m, i) => {
      p.setFromMatrixPosition(m);
      const newest = p.z > FACE - 0.4 && p.x > NEWEST.x0 && p.x < NEWEST.x1 && p.y > NEWEST.y0 && p.y < NEWEST.y1;
      if ((newest && g() < 0.42) || g() < 0.0025) {
        glow.push(m);
        glowC.push(new THREE.Color(colours[glow.length % colours.length]));
      } else {
        plain.push(m);
        plainC.push(cols[i]);
      }
    });
    return { plain, plainC, glow, glowC };
  }, [runs, colours]);
  return (
    <>
      <Instances geometry={geometry} material={material} matrices={laid.plain} colours={laid.plainC} />
      <Instances geometry={geometry} material={glowMaterial} matrices={laid.glow} colours={laid.glowC} />
    </>
  );
}

/** The hall's shell: floor, walls with their openings, the roof with its long skylight, the tunnels' vaults. */
function Shell() {
  const mats = useMemo(() => {
    const stone = stoneMaterial({ a: "#b89f7c", b: "#8f775a", mortar: "#7d6a52", brick: [0.62, 0.3], moss: 0.05 });
    stone.envMapIntensity = 0.2;
    const floor = floorMaterial();
    const facade = stoneMaterial({ a: "#c7b08a", b: "#a38b69", mortar: "#86735a", brick: [1.15, 0.52], moss: 0.12 });
    const plaza = stoneMaterial({ a: "#bfb29a", b: "#8d816c", mortar: "#5d554a", brick: [1.5, 0.75], moss: 0.3 });
    const roof = new THREE.MeshStandardMaterial({ roughness: 0.8, envMapIntensity: 0.3 });
    return { stone, floor, facade, plaza, roof };
  }, []);
  const geo = useMemo(() => {
    const back = wallGeometry(-W - 0.8, W + 0.8, 0, H + 0.5, 0.8, TUNNELS.map((cx) => ({ cx, y0: 0, half: ARCH.half, straight: ARCH.straight })));
    back.translate(0, 0, BACK);
    // the facade: wider and taller than the hall, with the door, two tall windows and two round ones
    const front = wallGeometry(
      -22, 22, -0.5, 14, 0.8,
      [{ cx: 0, y0: -0.01, half: 2.2, straight: 4.2 }, { cx: -9, y0: 1.4, half: 1.0, straight: 2.6 }, { cx: 9, y0: 1.4, half: 1.0, straight: 2.6 }],
      [{ cx: -9, cy: 8.6, r: 1.2 }, { cx: 9, cy: 8.6, r: 1.2 }],
    );
    front.translate(0, 0, FRONT + 0.8);
    // the side walls are drawn in their own plane (u runs along -z) and turned into place
    const left = wallGeometry(-FRONT - 0.8, -BACK + 0.8, 0, H + 0.5, 0.8, WINDOWS.map((z) => ({ cx: -z, y0: DECK + 0.8, half: 1.1, straight: 4.0 })));
    left.rotateY(Math.PI / 2);
    left.translate(-W, 0, 0);
    const right = wallGeometry(-FRONT - 0.8, -BACK + 0.8, 0, H + 0.5, 0.8, []);
    right.rotateY(-Math.PI / 2);
    right.translate(W, 0, 0);
    const len = BACK - 0.8 - TUNNEL_END + 0.2;
    const vault = new THREE.CylinderGeometry(ARCH.half + 0.02, ARCH.half + 0.02, len, 24, 1, true, Math.PI / 2, Math.PI);
    vault.rotateX(Math.PI / 2);
    return { back, front, left, right, vault, len, frame: archFrame(ARCH.half, ARCH.straight, ARCH.frame, 0.2) };
  }, []);
  const roof = useMemo<Box[]>(() => {
    const y = H + 0.25;
    const c = "#26315c";
    return [
      // the facade stands in front of the roof's edge, so the roof stops at the hall's front
      { p: [(-W - 0.8 - SKY.x) / 2, y, (BACK - 0.8 + FRONT) / 2], s: [W + 0.8 - SKY.x, 0.5, FRONT - BACK + 0.8], c },
      { p: [(W + 0.8 + SKY.x) / 2, y, (BACK - 0.8 + FRONT) / 2], s: [W + 0.8 - SKY.x, 0.5, FRONT - BACK + 0.8], c },
      { p: [0, y, (SKY.z1 + FRONT) / 2], s: [2 * SKY.x, 0.5, FRONT - SKY.z1], c },
      { p: [0, y, (SKY.z0 + BACK - 0.8) / 2], s: [2 * SKY.x, 0.5, SKY.z0 - BACK + 0.8], c },
    ];
  }, []);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, (BACK + FRONT) / 2 - 5]} material={mats.floor} receiveShadow>
        <planeGeometry args={[2 * W + 1.6, FRONT - BACK + 10.4]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, (BACK + FRONT + 70) / 2 - 1]} material={mats.plaza} receiveShadow>
        <planeGeometry args={[90, FRONT - BACK + 72]} />
      </mesh>
      {/* the park around the square, out to the edge of the set */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.56, 0]} receiveShadow>
        <circleGeometry args={[300, 64]} />
        <meshStandardMaterial color="#3c4a2f" roughness={0.95} />
      </mesh>
      <mesh geometry={geo.back} material={mats.stone} castShadow receiveShadow />
      <mesh geometry={geo.front} material={mats.facade} castShadow receiveShadow />
      <mesh geometry={geo.left} material={mats.stone} castShadow receiveShadow />
      <mesh geometry={geo.right} material={mats.stone} castShadow receiveShadow />
      <Boxes items={roof} material={mats.roof} />
      {TUNNELS.map((ax) => (
        <group key={ax}>
          <mesh geometry={geo.frame} position={[ax, 0, FACE]} castShadow>
            <meshStandardMaterial color="#6b4428" roughness={0.55} />
          </mesh>
          <mesh geometry={geo.vault} position={[ax, ARCH.straight, BACK - 0.8 - geo.len / 2 + 0.1]}>
            <meshStandardMaterial color="#3a2618" roughness={0.8} side={THREE.DoubleSide} />
          </mesh>
          {/* the maze beyond is closed in: dark walls and a low ceiling all round */}
          <mesh position={[ax + Math.sign(ax) * 1.6, 2.0, (BACK - 0.8 + TUNNEL_END - 1.5) / 2]}>
            <boxGeometry args={[7.4, 4.8, BACK - 0.8 - TUNNEL_END + 1.5]} />
            <meshStandardMaterial color="#1c130c" roughness={0.95} side={THREE.BackSide} />
          </mesh>
          {/* a lamp hung in each tunnel, so its mouth glows */}
          <mesh position={[ax, ARCH.straight + 0.55, BACK - 4]}>
            <sphereGeometry args={[0.12, 12, 8]} />
            <meshStandardMaterial color="#ffe2a8" emissive="#ffb35c" emissiveIntensity={2.4} toneMapped={false} />
          </mesh>
          <pointLight position={[ax, ARCH.straight, BACK - 5]} color="#ffb468" intensity={6} distance={11} decay={1.5} />
        </group>
      ))}
    </group>
  );
}

/** The walkway along the book wall, its railing and posts, the spiral stair up to it, a rolling ladder, the roof's beams. */
function useJoinery() {
  return useMemo(() => {
    const out: Box[] = [];
    const deck = "#5e3b25";
    const rail = "#3e2616";
    const beam = "#3f2617";
    const bar = "#2a1a10";
    const railZ = FACE + 1.36;
    out.push({ p: [0, DECK - 0.075, FACE + 0.7], s: [2 * W, 0.15, 1.4], c: deck });
    out.push({ p: [0, DECK - 0.24, FACE + 1.38], s: [2 * W, 0.34, 0.06], c: rail });
    for (let x = -W + 0.3; x < W - 1.4; x += 0.4) out.push({ p: [x, DECK + 0.48, railZ], s: [0.035, 0.86, 0.035], c: rail });
    out.push({ p: [-0.55, DECK + 0.94, railZ], s: [2 * W - 1.1, 0.07, 0.1], c: rail });
    out.push({ p: [-0.55, DECK + 0.1, railZ], s: [2 * W - 1.1, 0.05, 0.06], c: rail });
    // posts under the walkway, clear of the tunnels and the newest bay
    for (const x of [-16.8, -13.2, -6, -3, 3, 6, 13.2]) {
      out.push({ p: [x, (DECK - 0.15) / 2, railZ], s: [0.2, DECK - 0.15, 0.2], c: rail });
      out.push({ p: [x, DECK - 0.35, railZ], s: [0.32, 0.12, 0.32], c: rail });
      out.push({ p: [x, 0.08, railZ], s: [0.32, 0.16, 0.32], c: rail });
    }
    // the spiral stair at the right end, rising to the walkway
    const sx = 16.4;
    const sz = FACE + 3.2;
    const steps = 16;
    const rise = DECK / steps;
    for (let i = 0; i < steps; i++) {
      const a = Math.PI / 2 - (steps - 1 - i) * 0.4;
      const c = Math.cos(a);
      const s = -Math.sin(a);
      out.push({ p: [sx + c * 0.68, rise * (i + 1) - 0.03, sz + s * 0.68], s: [1.2, 0.06, 0.42], r: [0, a, 0], c: deck });
      out.push({ p: [sx + c * 1.24, rise * (i + 1) + 0.45, sz + s * 1.24], s: [0.04, 0.9, 0.04], c: rail });
    }
    out.push({ p: [sx, DECK / 2 + 0.5, sz], s: [0.16, DECK + 1, 0.16], c: rail });
    // the rolling ladder leaning on the lower tier
    const lx = -5.4;
    const reach = 1.15;
    const tall = DECK - 0.3;
    const tilt = Math.atan2(reach, tall);
    const len = Math.hypot(reach, tall);
    for (const dx of [-0.24, 0.24]) out.push({ p: [lx + dx, tall / 2, FACE + reach / 2], s: [0.05, len, 0.07], r: [-tilt, 0, 0], c: rail });
    for (let t = 0.06; t < 1; t += 0.075) out.push({ p: [lx, t * tall, FACE + reach - t * reach], s: [0.5, 0.035, 0.05], c: deck });
    // the roof's beams in a grid of coffers, and the glazing bars across the skylight
    for (let z = BACK + 1.5; z < FRONT; z += 3) {
      out.push({ p: [(-W - SKY.x) / 2, H - 0.2, z], s: [W - SKY.x, 0.4, 0.3], c: beam });
      out.push({ p: [(W + SKY.x) / 2, H - 0.2, z], s: [W - SKY.x, 0.4, 0.3], c: beam });
    }
    for (const x of [-16.5, -13.5, -10.5, -7.5, 7.5, 10.5, 13.5, 16.5, -SKY.x, SKY.x]) out.push({ p: [x, H - 0.2, 0], s: [0.3, 0.4, 2 * FRONT], c: beam });
    for (let z = SKY.z0 + 1.5; z < SKY.z1; z += 1.5) out.push({ p: [0, H + 0.2, z], s: [2 * SKY.x, 0.14, 0.1], c: bar });
    for (const x of [-1.5, 1.5]) out.push({ p: [x, H + 0.2, (SKY.z0 + SKY.z1) / 2], s: [0.1, 0.14, SKY.z1 - SKY.z0], c: bar });
    // cornices over the book walls
    out.push({ p: [0, TOP + 0.1, FACE - 0.1], s: [2 * W, 0.2, 0.7], c: rail });
    out.push({ p: [W - 0.25, TOP + 0.1, 0], s: [0.7, 0.2, 2 * FRONT - 2], c: rail });
    out.push({ p: [-W + 0.25, DECK - 0.2, 0], s: [0.6, 0.18, 2 * FRONT - 2], c: rail });
    // mullions in the left wall's tall windows
    for (const z of WINDOWS) {
      out.push({ p: [-W - 0.4, DECK + 3.2, z], s: [0.08, 5, 0.08], c: bar });
      for (const y of [DECK + 2, DECK + 3.6]) out.push({ p: [-W - 0.4, y, z], s: [0.08, 0.08, 2.2], c: bar });
    }
    return out;
  }, []);
}

/** The reading tables on the right, with chairs, lamps, open books and sealed teas. */
function useTables() {
  return useMemo(() => {
    const wood: Box[] = [];
    const lamps: THREE.Matrix4[] = [];
    const cups: THREE.Matrix4[] = [];
    const r = rng(5);
    for (const tx of [6.8, 11.4]) {
      const z0 = -4;
      const z1 = 5;
      wood.push({ p: [tx, 0.78, (z0 + z1) / 2], s: [1.4, 0.07, z1 - z0], c: "#6e4527" });
      for (const lz of [z0 + 0.3, z1 - 0.3]) for (const lx of [-0.6, 0.6]) wood.push({ p: [tx + lx, 0.38, lz], s: [0.1, 0.76, 0.1], c: "#4a2e1d" });
      wood.push({ p: [tx, 0.62, (z0 + z1) / 2], s: [0.1, 0.06, z1 - z0 - 0.6], c: "#4a2e1d" });
      for (let z = z0 + 0.9; z < z1; z += 1.5) {
        lamps.push(new THREE.Matrix4().makeTranslation(tx, 0.82, z));
        for (const side of [-1, 1]) {
          const cx = tx + side * (1.0 + r() * 0.35);
          const turn = (r() - 0.5) * 0.3;
          wood.push({ p: [cx, 0.46, z + 0.6], s: [0.46, 0.05, 0.46], r: [0, turn, 0], c: "#5a3824" });
          wood.push({ p: [cx + side * 0.21, 0.9, z + 0.6], s: [0.05, 0.85, 0.44], r: [0, turn, 0], c: "#5a3824" });
          for (const dz of [-0.19, 0.19]) for (const dx of [-0.19, 0.19]) wood.push({ p: [cx + dx, 0.22, z + 0.6 + dz], s: [0.04, 0.44, 0.04], c: "#4a2e1d" });
          // an open book in front of some chairs, a sealed tea by others
          if (r() < 0.6) wood.push({ p: [tx + side * 0.35, 0.83, z + 0.6 + (r() - 0.5) * 0.2], s: [0.3, 0.025, 0.42], r: [0, (r() - 0.5) * 0.5, 0], c: "#efe4c8" });
          if (r() < 0.45) cups.push(new THREE.Matrix4().makeTranslation(tx + side * 0.55, 0.815, z + 0.2 + r() * 0.3));
        }
      }
    }
    return { wood, lamps, cups };
  }, []);
}

/** A sealed cup of tea: a pale cup, a gold seal on top and a straw through it, as one coloured geometry. */
function useCupGeometry() {
  return useMemo(() => {
    const paint = (g: THREE.BufferGeometry, hex: string) => {
      const c = new THREE.Color(hex);
      const n = g.attributes.position.count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      return g.toNonIndexed();
    };
    const parts = [
      paint(new THREE.CylinderGeometry(0.045, 0.036, 0.11, 14).translate(0, 0.055, 0), "#f4efe4"),
      paint(new THREE.CylinderGeometry(0.047, 0.047, 0.012, 14).translate(0, 0.114, 0), "#c9973e"),
      paint(new THREE.CylinderGeometry(0.006, 0.006, 0.12, 6).rotateZ(0.2).translate(0.012, 0.17, 0), "#b04a4a"),
    ];
    const merged = new THREE.BufferGeometry();
    for (const name of ["position", "normal", "color"]) {
      const arrays = parts.map((g) => g.attributes[name].array as Float32Array);
      const out = new Float32Array(arrays.reduce((a, b) => a + b.length, 0));
      let o = 0;
      for (const a of arrays) {
        out.set(a, o);
        o += a.length;
      }
      merged.setAttribute(name, new THREE.BufferAttribute(out, 3));
    }
    return merged;
  }, []);
}

/** The librarian's desk: a curved counter, its terminal with a data cable down to the floor, a lamp, books, tea. */
function Desk() {
  const geo = useMemo(() => {
    const sector = (r0: number, r1: number, a0: number, a1: number, depth: number) => {
      const s = new THREE.Shape();
      s.absarc(0, 0, r1, a0, a1, false);
      s.absarc(0, 0, r0, a1, a0, true);
      const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 48 });
      g.rotateX(-Math.PI / 2);
      return g;
    };
    const a0 = (195 / 180) * Math.PI;
    const a1 = (345 / 180) * Math.PI;
    const cable = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        v3(-0.86, 1.02, 1.35), v3(-0.7, 1.0, 1.7), v3(-0.62, 0.98, 1.98), v3(-0.6, 0.6, 2.05), v3(-0.55, 0.04, 2.1), v3(-0.25, 0.03, 2.45), v3(0.15, 0.03, 2.3), v3(0.05, 0.03, 2.05), v3(-0.3, 0.03, 2.2),
      ]),
      80,
      0.022,
      8,
    );
    return {
      body: sector(1.45, 1.95, a0, a1, 0.95),
      top: sector(1.36, 2.05, a0 - 0.03, a1 + 0.03, 0.06),
      plinth: sector(1.5, 1.99, a0, a1, 0.12),
      cable,
    };
  }, []);
  const screen = useMemo(() => screenPanel(3), []);
  const cupGeo = useCupGeometry();
  const mats = useMemo(
    () => ({
      cup: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35 }),
      brass: new THREE.MeshStandardMaterial({ color: "#b8893e", metalness: 0.85, roughness: 0.32 }),
    }),
    [],
  );
  const glow = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (glow.current) glow.current.emissiveIntensity = 1.25 + Math.sin(clock.elapsedTime * 1.7) * 0.08;
  });
  // the terminal turns towards the visitor at the green circle
  const termYaw = Math.atan2(SPOT[0] - (DESK[0] - 0.86), SPOT[2] - (DESK[2] + 1.49));
  return (
    <group position={DESK}>
      <mesh geometry={geo.body} castShadow receiveShadow>
        <meshStandardMaterial color="#7a4a2c" roughness={0.5} envMapIntensity={0.5} />
      </mesh>
      <mesh geometry={geo.plinth} castShadow receiveShadow>
        <meshStandardMaterial color="#3a2216" roughness={0.7} />
      </mesh>
      <mesh geometry={geo.top} position={[0, 0.95, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#8a5a36" roughness={0.45} envMapIntensity={0.5} />
      </mesh>
      {[0.16, 0.86].map((y) => (
        <mesh key={y} material={mats.brass} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, (195 / 180) * Math.PI]}>
          <torusGeometry args={[1.965, 0.022, 6, 64, (150 / 180) * Math.PI]} />
        </mesh>
      ))}
      {/* the terminal: a brass case, a glowing screen of the open API, a keyboard */}
      <group position={[-0.86, 1.01, 1.49]} rotation={[0, termYaw, 0]}>
        <mesh material={mats.brass} position={[0, 0.06, -0.05]}>
          <cylinderGeometry args={[0.12, 0.16, 0.12, 16]} />
        </mesh>
        <group position={[0, 0.4, -0.08]} rotation={[-0.12, 0, 0]}>
          <mesh material={mats.brass} castShadow>
            <boxGeometry args={[0.72, 0.52, 0.22]} />
          </mesh>
          <mesh position={[0, 0, 0.111]}>
            <planeGeometry args={[0.62, 0.42]} />
            <meshStandardMaterial ref={glow} map={screen} emissiveMap={screen} emissive="#ffffff" emissiveIntensity={1.25} toneMapped={false} />
          </mesh>
        </group>
        <mesh position={[0, 0.02, 0.24]} rotation={[0.08, 0, 0]}>
          <boxGeometry args={[0.5, 0.025, 0.18]} />
          <meshStandardMaterial color="#e6dcc6" roughness={0.5} />
        </mesh>
      </group>
      {/* the data cable, from the terminal over the edge to the floor, its plug by the circle */}
      <mesh geometry={geo.cable} castShadow>
        <meshStandardMaterial color="#232628" roughness={0.5} />
      </mesh>
      <mesh material={mats.brass} position={[-0.3, 0.035, 2.2]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.035, 0.035, 0.12, 12]} />
      </mesh>
      {/* the lamp */}
      <group position={[0.92, 1.01, 1.44]}>
        <mesh material={mats.brass} position={[0, 0.25, 0]}>
          <cylinderGeometry args={[0.02, 0.08, 0.5, 10]} />
        </mesh>
        <mesh position={[0, 0.52, 0]}>
          <sphereGeometry args={[0.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#ffb24a" emissive="#ff9a2e" emissiveIntensity={1.6} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
        <pointLight position={[0, 0.4, 0.1]} color="#ffb060" intensity={4} distance={5} decay={1.8} />
      </group>
      {/* a stack of books waiting to be shelved */}
      {[0, 1, 2, 3].map((k) => (
        <mesh key={k} position={[-1.5, 1.04 + k * 0.065, 0.82]} rotation={[0, 0.5 + k * 0.23, 0]} castShadow>
          <boxGeometry args={[0.32, 0.06, 0.24]} />
          <meshStandardMaterial color={["#2f4a6b", "#9c3b2e", "#c08a3e", "#1f5e63"][k]} roughness={0.7} />
        </mesh>
      ))}
      {/* sealed teas with straws on a brass tray */}
      <group position={[1.62, 1.01, 0.95]}>
        <mesh material={mats.brass}>
          <cylinderGeometry args={[0.24, 0.24, 0.02, 24]} />
        </mesh>
        {[0, 1, 2].map((k) => (
          <mesh key={k} geometry={cupGeo} material={mats.cup} position={[Math.cos(k * 2.1) * 0.12, 0.01, Math.sin(k * 2.1) * 0.12]} rotation={[0, k, 0]} />
        ))}
      </group>
      <pointLight position={[0.4, 2.2, 3.0]} color="#ffc98a" intensity={6} distance={7} decay={2} />
      <group position={[0, 0, -1.0]} scale={1.4}>
        <Librarian />
      </group>
    </group>
  );
}

/** The green circle: where the visitor stands to ask. */
function TapCircle() {
  const ring = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (ring.current) ring.current.emissiveIntensity = 2.4 + Math.sin(clock.elapsedTime * 2.2) * 0.6;
  });
  return (
    <group position={SPOT}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[0.82, 1.02, 96]} />
        <meshStandardMaterial ref={ring} color="#0f2a18" emissive={TAP_GREEN} emissiveIntensity={2.4} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
        <circleGeometry args={[0.82, 64]} />
        <meshStandardMaterial color="#13261a" emissive={TAP_GREEN} emissiveIntensity={0.18} roughness={0.4} />
      </mesh>
    </group>
  );
}

/** The terminals along the left wall: wooden stands with slanted glowing screens, a lamp over each. */
function Terminals() {
  const screen = useMemo(() => screenPanel(11), []);
  const parts = useMemo(() => {
    const wood: Box[] = [];
    const screens: THREE.Matrix4[] = [];
    const lamps: THREE.Matrix4[] = [];
    const o = new THREE.Object3D();
    for (const z of TERMINALS) {
      wood.push({ p: [-W + 0.55, 0.55, z], s: [0.5, 1.1, 0.8], c: "#5a3824" });
      wood.push({ p: [-W + 0.6, 1.12, z], s: [0.6, 0.05, 0.9], c: "#3e2616" });
      wood.push({ p: [-W + 0.62, 1.38, z], s: [0.08, 0.5, 0.72], r: [0, 0, 0.5], c: "#8a6a3e" });
      o.position.set(-W + 0.68, 1.4, z);
      o.rotation.set(-0.5, Math.PI / 2, 0, "YXZ");
      o.updateMatrix();
      screens.push(o.matrix.clone());
      lamps.push(new THREE.Matrix4().makeTranslation(-W + 0.25, 3.2, z));
    }
    return { wood, screens, lamps };
  }, []);
  const mats = useMemo(
    () => ({
      wood: new THREE.MeshStandardMaterial({ roughness: 0.65, envMapIntensity: 0.35 }),
      screen: new THREE.MeshStandardMaterial({ map: screen, emissiveMap: screen, emissive: "#ffffff", emissiveIntensity: 1.1, toneMapped: false }),
      lamp: new THREE.MeshStandardMaterial({ color: "#ffe2a8", emissive: "#ffb35c", emissiveIntensity: 2.2, toneMapped: false }),
      plane: new THREE.PlaneGeometry(0.6, 0.4),
      bulb: new THREE.SphereGeometry(0.12, 16, 12),
    }),
    [screen],
  );
  return (
    <>
      <Boxes items={parts.wood} material={mats.wood} />
      <Instances geometry={mats.plane} material={mats.screen} matrices={parts.screens} />
      <Instances geometry={mats.bulb} material={mats.lamp} matrices={parts.lamps} />
    </>
  );
}

/** The ornamented door, both leaves swung inwards, the lunette over it, the lamps either side, the steps outside. */
function Door() {
  const parts = useMemo(() => {
    const top = lunettePanel();
    // the half disc takes the upper half of the texture square: stretch the painting over it
    top.repeat.set(1, 2);
    top.offset.set(0, -1);
    return {
      left: riverHorsePanel(),
      right: hamsterPanel(),
      top,
      lunette: new THREE.CircleGeometry(2.2, 48, 0, Math.PI),
      frame: archFrame(2.2, 4.2, 0.45, 0.3),
      stone: stoneMaterial({ a: "#e2d2b0", b: "#c4b08c", mortar: "#a8957a", brick: [0.6, 0.32], moss: 0.15 }),
    };
  }, []);
  const open = 1.08;
  const leaf = (map: THREE.Texture, side: number) => (
    <group position={[side * 2.2, 0, FRONT + 0.05]} rotation={[0, -side * open, 0]}>
      <mesh position={[-side * 1.1, 2.1, -0.06]} castShadow receiveShadow>
        <boxGeometry args={[2.2, 4.2, 0.12]} />
        <meshStandardMaterial color="#4a2c1a" roughness={0.6} />
      </mesh>
      <mesh position={[-side * 1.1, 2.1, 0.002]}>
        <planeGeometry args={[2.12, 4.12]} />
        <meshStandardMaterial map={map} emissiveMap={map} emissive="#ffffff" emissiveIntensity={0.18} roughness={0.5} />
      </mesh>
    </group>
  );
  const stone = useMemo<Box[]>(
    () => [
      // three steps down to the square
      ...[0, 1, 2].map((k): Box => ({ p: [0, -0.5 + ((3 - k) * 0.166) / 2, FRONT + 1.1 + k * 0.6], s: [9 - k * 0.6, 0.166 * (3 - k), 0.6] })),
      // pilasters, the entablature over the door, the cornice, the plinth and a raised panel on top
      ...[-3.3, 3.3, -14.5, 14.5, -21.5, 21.5].map((x): Box => ({ p: [x, 3.6, FRONT + 1.0], s: [0.9, 8.2, 0.4] })),
      { p: [0, 8.0, FRONT + 1.05], s: [9, 0.6, 0.5] },
      { p: [0, 13.9, FRONT + 1.1], s: [45, 0.5, 0.7] },
      { p: [0, -0.1, FRONT + 0.95], s: [44.4, 0.8, 0.3] },
      { p: [0, 14.6, FRONT + 0.8], s: [12, 0.9, 0.5] },
      // the keystone of the door's arch
      { p: [0, 6.85, FRONT + 1.15], s: [0.8, 1.0, 0.6] },
    ],
    [],
  );
  return (
    <group>
      {leaf(parts.left, -1)}
      {leaf(parts.right, 1)}
      <mesh geometry={parts.lunette} position={[0, 4.2, FRONT + 0.4]}>
        <meshStandardMaterial map={parts.top} emissiveMap={parts.top} emissive="#ffffff" emissiveIntensity={0.25} roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 4.2, FRONT + 0.4]}>
        <boxGeometry args={[4.4, 0.16, 0.9]} />
        <meshStandardMaterial color="#b8893e" metalness={0.8} roughness={0.35} />
      </mesh>
      <mesh geometry={parts.frame} material={parts.stone} position={[0, 0, FRONT + 0.8]} castShadow receiveShadow />
      <Boxes items={stone} material={parts.stone} />
      {[-3.3, 3.3].map((x) => (
        <group key={x} position={[x, 5.2, FRONT + 1.45]}>
          <mesh>
            <boxGeometry args={[0.36, 0.5, 0.36]} />
            <meshStandardMaterial color="#ffe2a8" emissive="#ffb35c" emissiveIntensity={2.4} toneMapped={false} />
          </mesh>
          <mesh position={[0, 0.34, 0]}>
            <coneGeometry args={[0.32, 0.22, 4]} />
            <meshStandardMaterial color="#3a2a1c" roughness={0.8} />
          </mesh>
        </group>
      ))}
      <pointLight position={[0, 5.6, FRONT + 3.2]} color="#ffbf73" intensity={14} distance={14} decay={1.6} />
      {/* inside the door, lighting the painted leaves */}
      <pointLight position={[0, 3.0, FRONT - 1.6]} color="#ffcf8a" intensity={6} distance={6} decay={2} />
    </group>
  );
}

/** A ring of candle lamps over the desk, hung on chains from the roof. */
function Chandelier({ at }: { at: [number, number, number] }) {
  const parts = useMemo(() => {
    const chain = H - at[1];
    const len = Math.hypot(chain, 0.65);
    const up = new THREE.Vector3(0, 1, 0);
    const brass: THREE.BufferGeometry[] = [new THREE.TorusGeometry(1.3, 0.05, 8, 64).rotateX(Math.PI / 2)];
    const wax: THREE.BufferGeometry[] = [];
    const flames: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 3; k++) {
      // three chains from the ring up to one hook in the roof
      const a = (k / 3) * Math.PI * 2;
      const foot = new THREE.Vector3(Math.cos(a) * 1.3, 0, Math.sin(a) * 1.3);
      const dir = new THREE.Vector3(0, chain, 0).sub(foot).normalize();
      const g = new THREE.CylinderGeometry(0.012, 0.012, len, 4).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir));
      brass.push(g.translate(...foot.clone().addScaledVector(dir, len / 2).toArray()));
    }
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const x = Math.cos(a) * 1.3;
      const z = Math.sin(a) * 1.3;
      wax.push(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 8).translate(x, 0.17, z));
      flames.push(new THREE.SphereGeometry(0.05, 10, 8).scale(1, 1.4, 1).translate(x, 0.33, z));
    }
    return {
      brass: mergeGeometries(brass),
      wax: mergeGeometries(wax),
      flames: mergeGeometries(flames),
    };
  }, [at]);
  const flame = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(() => {
    const t = weather.time.value;
    if (flame.current) flame.current.emissiveIntensity = 2.6 + Math.sin(t * 11) * 0.15 + Math.sin(t * 23) * 0.1;
  });
  return (
    <group position={at}>
      <mesh geometry={parts.brass}>
        <meshStandardMaterial color="#b8893e" metalness={0.85} roughness={0.32} />
      </mesh>
      <mesh geometry={parts.wax}>
        <meshStandardMaterial color="#f4ead2" roughness={0.6} />
      </mesh>
      <mesh geometry={parts.flames}>
        <meshStandardMaterial ref={flame} color="#fff0c8" emissive="#ffb24a" emissiveIntensity={2.6} toneMapped={false} />
      </mesh>
      <pointLight position={[0, 0.2, 0]} color="#ffb768" intensity={34} distance={16} decay={2} />
    </group>
  );
}

/** Pendant lamps over the reading tables, each pouring a warm cone of light onto the table. */
function Pendants({ spots }: { spots: [number, number, number][] }) {
  const parts = useMemo(() => {
    const metal: THREE.BufferGeometry[] = [];
    const bulbs: THREE.BufferGeometry[] = [];
    const cones: THREE.BufferGeometry[] = [];
    for (const [x, y, z] of spots) {
      metal.push(new THREE.CylinderGeometry(0.012, 0.012, H - y, 4).translate(x, (H + y) / 2, z));
      metal.push(new THREE.CylinderGeometry(0.12, 0.42, 0.34, 24, 1, true).translate(x, y + 0.1, z));
      bulbs.push(new THREE.SphereGeometry(0.15, 16, 12).translate(x, y - 0.02, z));
      cones.push(new THREE.CylinderGeometry(0.28, 1.5, 5.2, 32, 1, true).translate(x, y - 2.65, z));
    }
    return { metal: mergeGeometries(metal), bulbs: mergeGeometries(bulbs), cones: mergeGeometries(cones) };
  }, [spots]);
  return (
    <>
      <mesh geometry={parts.metal}>
        <meshStandardMaterial color="#b8893e" metalness={0.8} roughness={0.35} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={parts.bulbs}>
        <meshStandardMaterial color="#fff0c8" emissive="#ffc070" emissiveIntensity={3} toneMapped={false} />
      </mesh>
      <Shaft geometry={parts.cones} colour="#ffb867" strength={0.05} />
    </>
  );
}

/** Shafts of dusk light falling through the skylight's bays, slanting with the low light outside. */
function SkyShafts() {
  const geometry = useMemo(() => {
    const d = sunAt(HOUR).clone().negate().normalize();
    const len = H / -d.y;
    // boxes standing up, leaned so their long axis follows the light, one under each of four bays
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), d);
    return mergeGeometries(
      [-8, -4, 0, 4].map((z) => {
        const mid = new THREE.Vector3(0, H, z).addScaledVector(d, len / 2);
        return new THREE.BoxGeometry(2 * SKY.x - 0.6, len, 1.1).applyQuaternion(q).translate(mid.x, mid.y, mid.z);
      }),
    );
  }, []);
  return <Shaft geometry={geometry} colour="#a9b8ff" strength={0.05} slab />;
}

const DEMO_RESULT = { shares: [46, 31, 15, 8], colours: ["#f2c14e", "#7fc8f8", "#f78c6b", "#b8a1e8"] };

function GrandLibrary({ live }: SetProps) {
  const { runs, wood } = useShelves();
  const joinery = useJoinery();
  const tables = useTables();
  const cupGeo = useCupGeometry();
  const mats = useMemo(
    () => ({
      wood: new THREE.MeshStandardMaterial({ roughness: 0.62, envMapIntensity: 0.35 }),
      lamp: new THREE.MeshStandardMaterial({ color: "#ffd9a0", emissive: "#ffa64a", emissiveIntensity: 2, toneMapped: false }),
      lampGeo: new THREE.SphereGeometry(0.13, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.32, 0),
      cup: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35 }),
      rug: rugPanel(),
    }),
    [],
  );
  const allWood = useMemo(() => [...wood, ...joinery, ...tables.wood], [wood, joinery, tables]);
  const colours = (live.result ?? DEMO_RESULT).colours;
  return (
    <group>
      <Shell />
      <Books runs={runs} colours={colours} />
      <Boxes items={allWood} material={mats.wood} />
      <Instances geometry={mats.lampGeo} material={mats.lamp} matrices={tables.lamps} />
      <Instances geometry={cupGeo} material={mats.cup} matrices={tables.cups} />
      {/* the long rug from the door towards the desk */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, (FRONT - 0.8) / 2]} receiveShadow>
        <planeGeometry args={[2.4, FRONT]} />
        <meshStandardMaterial map={mats.rug} roughness={0.95} />
      </mesh>
      <Desk />
      <TapCircle />
      <group position={[-2.75, 0, -3.1]}>
        <Globe />
      </group>
      <group position={[-7.2, 0, -8.4]} rotation={[0, 0.45, 0]}>
        <ScoresBoard />
      </group>
      <group position={[-3.4, 7.5, -10.5]}>
        <Orrery rod={H - 7.5} />
      </group>
      <Terminals />
      <Chandelier at={CHANDELIER} />
      <Pendants spots={PENDANTS} />
      {/* one light for each pair of pendants, low over the tables */}
      <pointLight position={[6.8, 4.2, 1]} color="#ffb768" intensity={16} distance={10} decay={2} />
      <pointLight position={[11.4, 4.2, 1]} color="#ffb768" intensity={16} distance={10} decay={2} />
      <SkyShafts />
      {/* light washing the record wall from the front */}
      <pointLight position={[-6, 7.2, -10]} color="#ffc27a" intensity={12} distance={14} decay={1.8} />
      <pointLight position={[7, 7.2, -10]} color="#ffc27a" intensity={12} distance={14} decay={1.8} />
      <Motes
        regions={[
          { at: [0, 3.5, -4.5], size: [6, 6, 5], count: 320, colour: "#ffd9a0" },
          { at: [3, 6, -5], size: [9, 10, 14], count: 420, colour: "#dfe6ff" },
          { at: [9, 3.5, 1], size: [8, 6, 9], count: 300, colour: "#ffd9a0" },
          { at: [0, 2.5, 11], size: [4, 4, 6], count: 120, colour: "#ffe6c0" },
        ]}
      />
      <Door />
      <Outside hall={HALL} sky={SKY} />
    </group>
  );
}

/** Stop 6: the grand library (Records, Scores, Docs). */
export const librarySet: SetModule = {
  id: "library",
  origin: [0, 0, -2800],
  hour: HOUR,
  poses: {
    arrive: { position: [0.3, 2.2, 26], target: [0, 3.5, 0] },
    library: { position: [6.4, 2.5, 5.6], target: [1.2, 2.1, -6.0] },
  },
  Scene: GrandLibrary,
};
