/**
 * The contract every place in Meldan keeps. A set is one stretch of the city (the hill, the bridge, the market…),
 * built around its own (0, 0, 0) with the camera poses its stops are seen from; the world places it at its origin, so
 * sets never overlap, and mounts it only while the camera is near. Keep a set inside about 300 units of its centre.
 */
import type * as THREE from "three";

export type Vec3 = [number, number, number];

/** Where the camera stands and what it looks at, in the set's own space (the world adds the origin). */
export type Pose = { position: Vec3; target: Vec3 };

/** What the world knows that a set may show: all optional, a set must look complete with none of it. */
export type Live = {
  /** the newest fixed poll result: answer shares and their colours */
  result?: { shares: number[]; colours: string[] };
  /** a burn just happened: 0 to 1, falls back to 0 */
  burst?: React.RefObject<number>;
  /** Realm tokens to show as shop signs, already filtered: symbol and 24-hour volume in ETH */
  tokens?: { symbol: string; volume: number }[];
  /** Predict markets to show: question (short) and YES share 0 to 1 */
  markets?: { question: string; yes: number }[];
  /** the riddle: open, solved or closed, and the solved ones for the plaques */
  riddle?: { state: "open" | "solved" | "closed"; solved: string[] };
  /** 0 open sky, 1 the round room's roof closed (privacy) */
  roof?: React.RefObject<number>;
};

export type SetProps = { live: Live };

export type SetModule = {
  id: string;
  /** the set's place in the world. Scene draws in the set's own space (around 0, 0, 0): the world moves it here */
  origin: Vec3;
  /** the hour of day the set is lit at (6 dawn to 18 dusk; beyond 18 is night) */
  hour: number;
  /** camera poses by stop id, in the set's own space */
  poses: Record<string, Pose>;
  Scene: React.ComponentType<SetProps>;
};

export const add = (o: Vec3, p: Vec3): Vec3 => [o[0] + p[0], o[1] + p[1], o[2] + p[2]];

export type { THREE };
