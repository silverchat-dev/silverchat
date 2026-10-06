"use client";

/**
 * The cabin swap (ch. 18): "Like a mixnet, but for people." Ten black cars come down the tunnel and stop in a row in
 * the left way. Hoists lift some of the cabins, carry them along the rails and set each one down on another car, and
 * the cars drive on into the dark. Cabins going deeper ride one rail and cabins coming back the other, each group in
 * its own order, so no two ever pass through each other. Then the next ten come. This is SilverCash: what goes in
 * cannot be matched to what comes out.
 */
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { weather } from "../../kit/materials";
import { rng } from "../../kit/noise";
import { at, axes, bay, ENTRANCE, floorY } from "./plan";

export const CARS = 10;
export const GAP = 6.2;
/** where the row starts along the left way, and the road's line across it */
export const FIRST = 9;
export const ROAD_U = -1.8;
/** the two rails the hoists run on: deeper on the outer, back on the inner */
const LANE_DEEP = ROAD_U - 1.3;
const LANE_BACK = ROAD_U + 1.3;
const RAIL_Y = 5.7;

/** one train's life, in seconds */
const T = { arrive: 9, lift: 9.6, out: 10.8, carry: 11.6, back: 14.6, drop: 15.4, down: 16.6, leave: 17.2, gone: 25.2 };
const PERIOD = 22;
const IN_RUN = 150;
const OUT_RUN = 110;

/** cabin lacquers: none is the green of a green circle */
export const CABINS = ["#d0553f", "#e6a94e", "#3f7fb0", "#8a63b8", "#efe0bd", "#2f9c9a", "#d47c9b", "#6c7a86", "#f2cf5b", "#a0603f"];

const left = bay("left");

/** where the road starts outside; it runs straight to the portal, so the portal is this far along it */
const START = 296;
const PORTAL = START - (ENTRANCE - 3);

/** The road the cars drive: down the tunnel's left lane, round into the left way, and on along it. */
export function makeRoad() {
  {
    const p = (x: number, z: number) => new THREE.Vector3(x, floorY(z), z);
    const bend = new THREE.CatmullRomCurve3(
      [p(-3.5, START), p(-3.5, 200), p(-3.5, 60), p(-3.6, 26), p(-5.2, 8), at(left, 0, ROAD_U), at(left, 8, ROAD_U)],
      false,
      "centripetal",
    );
    const road = new THREE.CurvePath<THREE.Vector3>();
    road.add(bend);
    road.add(new THREE.LineCurve3(at(left, 8, ROAD_U), at(left, 160, ROAD_U)));
    const length = road.getLength();
    const bendLength = bend.getLength();
    /** distance along the road of a point s along the left way */
    const along = (s: number) => bendLength + (s - 8);
    return { road, length, along };
  }
}

/**
 * Shuffles in which cabins going the same way keep their order, so the two rails never cross. Seeded, so every
 * visitor sees the same sequence.
 */
function useShuffles() {
  return useMemo(() => {
    const r = rng(18);
    const out: number[][] = [];
    while (out.length < 6) {
      const p = Array.from({ length: CARS }, (_, i) => i);
      for (let i = CARS - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [p[i], p[j]] = [p[j], p[i]];
      }
      let ok = p.filter((v, i) => v !== i).length >= 7;
      for (let i = 0; i < CARS && ok; i++)
        for (let j = i + 1; j < CARS && ok; j++) {
          const deeperI = p[i] > i;
          const deeperJ = p[j] > j;
          if (p[i] !== i && p[j] !== j && deeperI === deeperJ && p[i] > p[j]) ok = false;
        }
      if (ok) out.push(p);
    }
    return out;
  }, []);
}

const ease = (x: number) => {
  const t = Math.min(Math.max(x, 0), 1);
  return t * t * (3 - 2 * t);
};
const span = (t: number, a: number, b: number) => ease((t - a) / (b - a));

/** The parts of a car, one merged mesh each so a row of twenty is a few draw calls. */
function useParts() {
  return useMemo(() => {
    const paint = (g: THREE.BufferGeometry, c: THREE.Color | [number, number, number]) => {
      const col = c instanceof THREE.Color ? [c.r, c.g, c.b] : c;
      const n = g.attributes.position.count;
      const a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) a.set(col, i * 3);
      g.setAttribute("color", new THREE.BufferAttribute(a, 3));
      if (g.index) g = g.toNonIndexed();
      g.deleteAttribute("uv");
      return g;
    };
    // the chassis: a low black body, a skirt of foil, and four wheels (front is +z)
    const body = new RoundedBoxGeometry(2.05, 0.62, 4.7, 3, 0.18);
    body.translate(0, 0.62, 0);
    const skirt = new THREE.BoxGeometry(2.08, 0.1, 4.3);
    skirt.translate(0, 0.36, 0);
    const wheels = [-1, 1].flatMap((sx) =>
      [-1, 1].map((sz) => {
        const w = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 18);
        w.rotateZ(Math.PI / 2);
        w.translate(sx * 0.92, 0.36, sz * 1.5);
        return paint(w, [0.05, 0.05, 0.055]);
      }),
    );
    const chassis = mergeGeometries([paint(body, [0.06, 0.065, 0.075]), paint(skirt, [0.5, 0.52, 0.55]), ...wheels]);
    chassis.computeVertexNormals();

    // the cabin: a lacquered pod (white, so the instance colour paints it) with a band of camera windows, near black
    const shell = new RoundedBoxGeometry(1.9, 1.42, 3.5, 4, 0.32);
    shell.translate(0, 0.71, 0);
    const band = new RoundedBoxGeometry(1.95, 0.42, 3.05, 2, 0.12);
    band.translate(0, 0.98, 0);
    const door = new THREE.BoxGeometry(1.96, 1.0, 0.04);
    door.translate(0, 0.62, 0.35);
    const cabin = mergeGeometries([paint(shell, [1, 1, 1]), paint(band, [0.05, 0.05, 0.06]), paint(door, [0.55, 0.55, 0.55])]);
    cabin.computeVertexNormals();

    // lights: red at the back (what the walker sees as the row drives away), warm white at the front
    const tail = [-0.72, 0.72].map((x) => {
      const g = new THREE.BoxGeometry(0.42, 0.1, 0.05);
      g.translate(x, 0.74, -2.36);
      return paint(g, [4, 0.35, 0.25]);
    });
    const head = [-0.7, 0.7].map((x) => {
      const g = new THREE.BoxGeometry(0.36, 0.12, 0.05);
      g.translate(x, 0.7, 2.36);
      return paint(g, [3.2, 3, 2.6]);
    });
    const lamps = mergeGeometries([...tail, ...head]);
    return { chassis, cabin, lamps };
  }, []);
}

/** The rails and hoists over the row, with a cool light along their undersides: the left way's colour. */
function Rails({ cool }: { cool: THREE.Color }) {
  const { d } = axes(left);
  const rails = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    const yaw = Math.atan2(d.x, d.y);
    const length = GAP * (CARS + 1);
    const mid = FIRST + (GAP * (CARS - 1)) / 2;
    for (const u of [LANE_DEEP, ROAD_U, LANE_BACK]) {
      const g = new THREE.BoxGeometry(0.22, 0.3, length);
      g.rotateY(yaw);
      const p = at(left, mid, u, RAIL_Y + 0.15);
      g.translate(p.x, p.y, p.z);
      parts.push(g);
    }
    // a cross beam at each stop, and hangers up into the vault
    for (let k = -1; k <= CARS; k++) {
      const s = FIRST + k * GAP;
      const g = new THREE.BoxGeometry(LANE_BACK - LANE_DEEP + 0.6, 0.22, 0.22);
      g.rotateY(yaw);
      const p = at(left, s, ROAD_U, RAIL_Y + 0.42);
      g.translate(p.x, p.y, p.z);
      parts.push(g);
      for (const u of [LANE_DEEP, LANE_BACK]) {
        const h = new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6);
        const q = at(left, s, u, RAIL_Y + 1.6);
        h.translate(q.x, q.y, q.z);
        parts.push(h);
      }
    }
    return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => (g.deleteAttribute("uv"), g)));
  }, [d]);
  const strips = useMemo(() => {
    const yaw = Math.atan2(d.x, d.y);
    const mid = FIRST + (GAP * (CARS - 1)) / 2;
    const parts = [LANE_DEEP, LANE_BACK].map((u) => {
      const g = new THREE.BoxGeometry(0.08, 0.04, GAP * (CARS + 1) - 0.4);
      g.rotateY(yaw);
      const p = at(left, mid, u, RAIL_Y - 0.02);
      g.translate(p.x, p.y, p.z);
      return g;
    });
    return mergeGeometries(parts);
  }, [d]);
  return (
    <>
      <mesh geometry={rails} castShadow>
        <meshStandardMaterial color="#5d6670" metalness={0.75} roughness={0.42} />
      </mesh>
      <mesh geometry={strips}>
        <meshBasicMaterial color={cool.clone().multiplyScalar(2.6)} toneMapped={false} />
      </mesh>
    </>
  );
}

/** scratch objects for the frame loop, so it makes no garbage */
const SCRATCH = {
  m: new THREE.Matrix4(),
  p: new THREE.Vector3(),
  t: new THREE.Vector3(),
  q: new THREE.Vector3(),
  up: new THREE.Vector3(0, 1, 0),
  c: new THREE.Color(),
  hide: new THREE.Matrix4().makeScale(0, 0, 0),
};

export function CabinSwap({ cool }: { cool: THREE.Color }) {
  const { road, length, along } = useMemo(() => makeRoad(), []);
  const shuffles = useShuffles();
  const parts = useParts();
  const chassis = useRef<THREE.InstancedMesh>(null);
  const cabins = useRef<THREE.InstancedMesh>(null);
  const lamps = useRef<THREE.InstancedMesh>(null);
  const hoists = useRef<THREE.InstancedMesh>(null);
  const cables = useRef<THREE.InstancedMesh>(null);
  const mats = useMemo(
    () => ({
      chassis: new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        roughness: 0.32,
        metalness: 0.35,
        clearcoat: 1,
        clearcoatRoughness: 0.12,
      }),
      cabin: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.38, clearcoat: 0.8, clearcoatRoughness: 0.18 }),
      lamps: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
      steel: new THREE.MeshStandardMaterial({ color: "#3a4048", metalness: 0.8, roughness: 0.4 }),
    }),
    [],
  );
  const hoistGeometry = useMemo(() => new THREE.BoxGeometry(0.7, 0.34, 1.1), []);
  const cableGeometry = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.025, 0.025, 1, 5);
    g.translate(0, -0.5, 0);
    return g;
  }, []);
  const { n } = axes(left);
  const side = useMemo(() => new THREE.Vector3(n.x, 0, n.y), [n]);
  useFrame(() => {
    const ch = chassis.current;
    const cb = cabins.current;
    const lm = lamps.current;
    const ho = hoists.current;
    const ca = cables.current;
    if (!ch || !cb || !lm || !ho || !ca) return;
    const { m, p, t, q, up, c, hide } = SCRATCH;
    const time = weather.time.value;
    const now = Math.floor(time / PERIOD);
    // where a car stands on the road: on the floor, pointing along the road
    const place = (dist: number, lift = 0, shift = 0) => {
      const k = THREE.MathUtils.clamp(dist / length, 0, 1);
      road.getPointAt(k, p);
      road.getTangentAt(k, t);
      p.y = floorY(p.z) + lift;
      p.addScaledVector(side, shift);
      q.copy(p).add(t);
      m.lookAt(q, p, up);
      m.setPosition(p);
      return m;
    };
    let hoist = 0;
    for (let w = 0; w < 2; w++) {
      const train = now - w;
      const local = time - train * PERIOD;
      const order = shuffles[((train % shuffles.length) + shuffles.length) % shuffles.length];
      // the train slows to a stop on arrival and gathers speed as it leaves
      const offset =
        local < T.arrive
          ? -IN_RUN * Math.pow(1 - local / T.arrive, 2)
          : local > T.leave
            ? OUT_RUN * Math.pow(Math.min((local - T.leave) / (T.gone - T.leave), 1), 2)
            : 0;
      const shown = local < T.gone;
      const slot = train * 3;
      for (let k = 0; k < CARS; k++) {
        const i = w * CARS + k;
        // car k stops at the k-th place from the hall; the row fills from the deep end
        const stop = along(FIRST + (CARS - 1 - k) * GAP);
        const dist = stop + offset;
        // cars come into being just inside the portal, where the tunnel is dark, and leave deep in the left way
        const visible = shown && dist > PORTAL && dist < length - 6;
        ch.setMatrixAt(i, visible ? place(dist) : hide);
        lm.setMatrixAt(i, visible ? place(dist) : hide);
        // cabin k rides car k until the swap, then car order[k]
        const target = order[k];
        const moves = target !== k;
        let lift = 0.78;
        let shift = 0;
        let cabinDist = dist;
        if (moves && local > T.lift && local < T.down) {
          const deeper = target < k;
          const lane = (deeper ? LANE_DEEP : LANE_BACK) - ROAD_U;
          const from = stop;
          const to = along(FIRST + (CARS - 1 - target) * GAP);
          lift += 1.62 * (span(local, T.lift, T.out) - span(local, T.drop, T.down));
          shift = lane * (span(local, T.out, T.carry) - span(local, T.back, T.drop));
          cabinDist = from + (to - from) * span(local, T.carry, T.back);
        } else if (moves && local >= T.down) {
          cabinDist = along(FIRST + (CARS - 1 - target) * GAP) + offset;
        }
        const cabinVisible = shown && cabinDist > PORTAL && cabinDist < length - 6;
        cb.setMatrixAt(i, cabinVisible ? place(cabinDist, lift, shift) : hide);
        c.set(CABINS[(((k + slot) % CABINS.length) + CABINS.length) % CABINS.length]);
        cb.setColorAt(i, c);
        // the hoist over each moving cabin, and its two cables
        if (w === 0 && moves && local > T.lift - 0.6 && local < T.down + 0.6) {
          place(cabinDist, RAIL_Y - 0.17, shift);
          ho.setMatrixAt(hoist, m);
          const top = lift + 1.42;
          const reach = (RAIL_Y - 0.17 - top) * Math.min(span(local, T.lift - 0.6, T.lift), 1 - span(local, T.down, T.down + 0.6));
          for (const sz of [-1.1, 1.1]) {
            place(cabinDist, RAIL_Y - 0.17, shift);
            p.addScaledVector(t, sz);
            m.makeScale(1, Math.max(reach, 0.001), 1).setPosition(p);
            ca.setMatrixAt(hoist * 2 + (sz < 0 ? 0 : 1), m);
          }
          hoist++;
        }
      }
    }
    for (let h = hoist; h < CARS; h++) {
      ho.setMatrixAt(h, hide);
      ca.setMatrixAt(h * 2, hide);
      ca.setMatrixAt(h * 2 + 1, hide);
    }
    for (const mesh of [ch, cb, lm, ho, ca]) mesh.instanceMatrix.needsUpdate = true;
    if (cb.instanceColor) cb.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={chassis} args={[parts.chassis, mats.chassis, CARS * 2]} castShadow frustumCulled={false} />
      <instancedMesh ref={cabins} args={[parts.cabin, mats.cabin, CARS * 2]} castShadow frustumCulled={false} />
      <instancedMesh ref={lamps} args={[parts.lamps, mats.lamps, CARS * 2]} frustumCulled={false} />
      <instancedMesh ref={hoists} args={[hoistGeometry, mats.steel, CARS]} frustumCulled={false} />
      <instancedMesh ref={cables} args={[cableGeometry, mats.steel, CARS * 2]} frustumCulled={false} />
      <Rails cool={cool} />
    </group>
  );
}
