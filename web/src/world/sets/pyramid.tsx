"use client";

/** The mountain pyramid's sealed door at night (ch. 4, 19): the riddle. Placeholder until the set is built. */
import type { SetModule } from "./types";

function Scene() {
  return (
    <mesh position={[0, 4, 0]}>
      <boxGeometry args={[8, 8, 8]} />
      <meshStandardMaterial color="#888" />
    </mesh>
  );
}

export const pyramidSet: SetModule = {
  id: "pyramid",
  origin: [0, 0, -3500],
  hour: 21,
  poses: { riddle: { position: [0, 6, 50], target: [0, 10, 0] } },
  Scene,
};
