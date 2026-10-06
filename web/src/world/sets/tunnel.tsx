"use client";

/** The tunnel and its Y-fork (ch. 3, 6, 18): Cash to the left, Zinc to the right. Placeholder until the set is built. */
import type { SetModule } from "./types";

function Scene() {
  return (
    <mesh position={[0, 4, 0]}>
      <boxGeometry args={[8, 8, 8]} />
      <meshStandardMaterial color="#888" />
    </mesh>
  );
}

export const tunnelSet: SetModule = {
  id: "tunnel",
  origin: [0, 0, -2100],
  hour: 16,
  poses: { fork: { position: [0, 3, 30], target: [0, 3, 0] } },
  Scene,
};
