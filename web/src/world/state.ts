/**
 * The walk's shared state, outside React so the frame loop can read it every frame without re-rendering anything:
 * where the camera is going (target, 0 at the gate to 1 at the riddle), whether a stop is open in a panel, the quality
 * tier, and the sound. Components that show it subscribe with useWorld.
 */
import { useSyncExternalStore } from "react";

export type Tier = 0 | 1 | 2 | 3;

type State = {
  /** where the walk wants the camera, 0 to 1 */
  target: number;
  /** set by the walk's scroll (smooth) or by opening a stop (a flight or a fade) */
  jump: boolean;
  /** a stop is open in a panel: the camera is parked there */
  parked: boolean;
  /** the panel covers the whole screen (phones): no frames are drawn behind it */
  covered: boolean;
  /** 0 = still images only, 1 = low, 2 = medium, 3 = high */
  tier: Tier;
  /** the walk's music is wanted (the visitor's choice) */
  sound: boolean;
  /** the gate has been passed this visit */
  entered: boolean;
  /** the world failed to start: stills only from here on */
  failed: boolean;
  /** the world has drawn its first frames (its shaders are compiled) */
  ready: boolean;
};

let state: State = { target: 0, jump: false, parked: false, covered: false, tier: 2, sound: false, entered: false, failed: false, ready: false };
const listeners = new Set<() => void>();

export const world = {
  get: () => state,
  set(next: Partial<State>) {
    state = { ...state, ...next };
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
};

// in development, the state can be read from the console as window.meldan
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") (window as unknown as { meldan: typeof world }).meldan = world;

const SERVER: State = { ...state };
export function useWorld<T>(pick: (s: State) => T) {
  return useSyncExternalStore(
    world.subscribe,
    () => pick(state),
    () => pick(SERVER),
  );
}
