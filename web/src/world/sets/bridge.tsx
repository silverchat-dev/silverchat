"use client";

/** The sky bridge and the Order of Steering's tower (ch. 1, 6): Predict. Placeholder until the set is built. */
import type { SetModule } from "./types";

function Scene() {
  return (
    <mesh position={[0, 4, 0]}>
      <boxGeometry args={[8, 8, 8]} />
      <meshStandardMaterial color="#888" />
    </mesh>
  );
}

export const bridgeSet: SetModule = {
  id: "bridge",
  origin: [0, 0, -700],
  hour: 11,
  poses: { predict: { position: [0, 8, 60], target: [0, 12, 0] } },
  Scene,
};
