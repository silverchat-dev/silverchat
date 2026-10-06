"use client";

/** Hun Min street, the electronics market (ch. 2, 18): Realm. Placeholder until the set is built. */
import type { SetModule } from "./types";

function Scene() {
  return (
    <mesh position={[0, 4, 0]}>
      <boxGeometry args={[8, 8, 8]} />
      <meshStandardMaterial color="#888" />
    </mesh>
  );
}

export const marketSet: SetModule = {
  id: "market",
  origin: [0, 0, -1400],
  hour: 13.5,
  poses: { realm: { position: [0, 4, 40], target: [0, 4, 0] } },
  Scene,
};
