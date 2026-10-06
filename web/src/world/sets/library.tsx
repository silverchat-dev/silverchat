"use client";

/** The grand library of Pafogai Du (ch. 19): Records, Scores, Docs, agents. Placeholder until the set is built. */
import type { SetModule } from "./types";

function Scene() {
  return (
    <mesh position={[0, 4, 0]}>
      <boxGeometry args={[8, 8, 8]} />
      <meshStandardMaterial color="#888" />
    </mesh>
  );
}

export const librarySet: SetModule = {
  id: "library",
  origin: [0, 0, -2800],
  hour: 18.5,
  poses: { library: { position: [0, 4, 24], target: [0, 4, 0] } },
  Scene,
};
