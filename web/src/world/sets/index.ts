/**
 * Every set in walk order. The stops (stops.ts) name a set and a pose in it; the world mounts a set while the camera is
 * near its origin. Sets sit 700 units apart along -z, so two never draw over each other.
 */
import { bridgeSet } from "./bridge";
import { hillSet } from "./hill";
import { librarySet } from "./library";
import { marketSet } from "./market";
import { pyramidSet } from "./pyramid";
import { tunnelSet } from "./tunnel";
import type { SetModule } from "./types";

export const SETS: SetModule[] = [hillSet, bridgeSet, marketSet, tunnelSet, librarySet, pyramidSet];

export const setById = (id: string) => SETS.find((s) => s.id === id) ?? hillSet;
