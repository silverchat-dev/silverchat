/**
 * The camera's rail: for any point of the walk (t, 0 at the gate to 1 at the riddle) where the camera stands, what it
 * looks at, the hour, and how thick the haze is. Between two stops in one set the camera flies; between sets it walks
 * forward into haze, and the next set forms out of it, from that set's wide "arrive" view in to the stop.
 */
import * as THREE from "three";

import { setById } from "./sets";
import type { Pose, Vec3 } from "./sets/types";
import { STOPS } from "./stops";

const world = (origin: Vec3, p: Vec3) => new THREE.Vector3(origin[0] + p[0], origin[1] + p[1], origin[2] + p[2]);

type Point = { set: string; origin: Vec3; ground?: (x: number, z: number) => number; pos: THREE.Vector3; look: THREE.Vector3; arrive: { pos: THREE.Vector3; look: THREE.Vector3 }; hour: number };

const POINTS: Point[] = STOPS.map((s) => {
  const set = setById(s.set);
  const pose: Pose = set.poses[s.pose] ?? Object.values(set.poses)[0];
  const arrive: Pose = set.poses.arrive ?? pose;
  return {
    set: set.id,
    origin: set.origin,
    ground: set.ground,
    pos: world(set.origin, pose.position),
    look: world(set.origin, pose.target),
    arrive: { pos: world(set.origin, arrive.position), look: world(set.origin, arrive.target) },
    hour: set.hour,
  };
});

export const SEGMENTS = POINTS.length - 1;
export const tOfStop = (i: number) => i / SEGMENTS;

export type View = { pos: THREE.Vector3; look: THREE.Vector3; hour: number; veil: number; sets: string[]; shown: string };

const ease = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);

/** The view at t, written into `out` so the frame loop allocates nothing. */
export function viewAt(t: number, out: View): View {
  const x = THREE.MathUtils.clamp(t, 0, 1) * SEGMENTS;
  const i = Math.min(Math.floor(x), SEGMENTS - 1);
  const f = x - i;
  const a = POINTS[i];
  const b = POINTS[i + 1];
  out.hour = THREE.MathUtils.lerp(a.hour, b.hour, ease(f));
  if (a.set === b.set) {
    const e = ease(f);
    out.pos.copy(a.pos).lerp(b.pos, e);
    // a flight rises a little over the ground between the two views, the way a crane shot does
    out.pos.y += Math.sin(Math.PI * e) * Math.min(14, a.pos.distanceTo(b.pos) * 0.12);
    // and stays clear of the ground on the way: a few metres at the ends, well above the grass in between
    if (a.ground) {
      const floor = a.ground(out.pos.x - a.origin[0], out.pos.z - a.origin[2]) + a.origin[1] + 2 + 14 * Math.sqrt(Math.sin(Math.PI * f));
      out.pos.y = Math.max(out.pos.y, floor);
    }
    out.look.copy(a.look).lerp(b.look, e);
    out.veil = 0;
    out.sets = [a.set];
    out.shown = a.set;
    return out;
  }
  // between sets: forward into the haze from a, then out of it from b's wide view in to b
  if (f < 0.5) {
    const g = f * 2;
    const dir = a.look.clone().sub(a.pos).normalize();
    // a few steps only: rooms and streets have walls close ahead, and the haze closes in before them
    out.pos.copy(a.pos).addScaledVector(dir, ease(g) * 5);
    out.look.copy(a.look).addScaledVector(dir, ease(g) * 5);
    out.veil = THREE.MathUtils.smoothstep(g, 0, 0.6);
    out.shown = a.set;
  } else {
    const g = (f - 0.5) * 2;
    const e = ease(g);
    out.pos.copy(b.arrive.pos).lerp(b.pos, e);
    out.look.copy(b.arrive.look).lerp(b.look, e);
    out.veil = 1 - THREE.MathUtils.smoothstep(g, 0, 0.75);
    out.shown = b.set;
  }
  out.sets = [a.set, b.set];
  return out;
}

export const newView = (): View => ({ pos: new THREE.Vector3(), look: new THREE.Vector3(), hour: 8, veil: 0, sets: [], shown: "hill" });
