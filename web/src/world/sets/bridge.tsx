"use client";

/**
 * The sky bridge and the Order of Steering's tower (ch. 1, 6): Predict. The Kalimar path rises "smoothly, and
 * suddenly" into a bridge over a busy road; beyond it a straight stair climbs a rocky spur to the tower, and behind
 * that stands a tree-covered mountain with apartments shaped like oversized castle towers. At the tower's top, stakes
 * go into a stone box as sealed purple letters, the markets hang as banners and a plaque ranks the forecaster bots.
 */
import { useMemo } from "react";
import * as THREE from "three";

import { groundMaterial, stoneMaterial } from "../kit/materials";
import { Bushes, CastleApartments, FarWoods, Grass, NearWoods, Ranges, Rocks } from "./bridge/city";
import { SPUR, groundGeometry } from "./bridge/land";
import { Road, SkyBridge, Staircase, Traffic } from "./bridge/road";
import { TOWER, Tower, type Market } from "./bridge/tower";
import type { SetModule, SetProps } from "./types";

const DEMO_MARKETS: Market[] = [
  { question: "Will the burn pass 1M SC this month?", yes: 0.62 },
  { question: "Will Realm list a tenth token by Friday?", yes: 0.35 },
  { question: "Will today's poll get over 500 answers?", yes: 0.81 },
  { question: "Will ETH close the week higher?", yes: 0.5 },
];

/** where full trees grow: around the bridge and up the spur, where the camera passes */
const near = (x: number, z: number) => Math.hypot(x, z - 10) < 80 || Math.hypot(x - SPUR.x, z - SPUR.z) < 45;

function Ground() {
  const geometry = useMemo(() => groundGeometry(600, 300), []);
  const material = useMemo(() => groundMaterial(), []);
  return <mesh geometry={geometry} material={material} receiveShadow />;
}

/** The paved top of the spur, around the tower's foot, where the stair arrives. */
function Terrace() {
  const stone = useMemo(() => stoneMaterial({ a: "#cfc2a5", b: "#9d8f76", brick: [0.9, 0.7], moss: 0.3, radial: new THREE.Vector3(SPUR.x, 0, SPUR.z) }), []);
  return (
    <mesh rotation-x={-Math.PI / 2} position={[SPUR.x, SPUR.top + 0.04, SPUR.z]} material={stone} receiveShadow>
      <circleGeometry args={[SPUR.plateau + 0.5, 72]} />
    </mesh>
  );
}

function SkyBridgeScene({ live }: SetProps) {
  const markets = live.markets?.length ? live.markets : DEMO_MARKETS;
  const centre = useMemo(() => new THREE.Vector3(SPUR.x, 0, SPUR.z), []);
  return (
    <group>
      <Ground />
      <Road />
      <Traffic />
      <SkyBridge />
      <Staircase />
      <Terrace />
      <group position={[SPUR.x, SPUR.top, SPUR.z]}>
        <Tower markets={markets} centre={centre} />
      </group>
      <NearWoods near={near} />
      <FarWoods near={near} />
      <Rocks />
      <Bushes />
      <Grass count={45000} />
      <CastleApartments />
      <Ranges />
    </group>
  );
}

const TOP = SPUR.top + TOWER.floor;

/** Stop 3: the sky bridge (arrive) and the top of the Order's tower (predict). */
export const bridgeSet: SetModule = {
  id: "bridge",
  origin: [0, 0, -700],
  hour: 11,
  poses: {
    arrive: { position: [14, 14, 64], target: [19, 27, -60] },
    predict: { position: [16, TOP + 13, SPUR.z + 22], target: [6, TOP + 1, SPUR.z - 4] },
  },
  Scene: SkyBridgeScene,
};
