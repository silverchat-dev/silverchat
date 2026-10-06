"use client";

/** A bench for building stops: one stop on its own, the stage around it, free orbit and a few dials. Not linked. */
import { OrbitControls, Stats } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useRef, useState } from "react";
import * as THREE from "three";

import { Stage } from "./stage";
import { EvelorHill } from "./stops/hill";

const VIEWS = {
  approach: { pos: [4, 6.5, 128], target: [0, 16, 0] },
  arch: { pos: [9, 6, 66], target: [0, 6, 40] },
  room: { pos: [0, 44, 22], target: [0, 22, 0] },
  aerial: { pos: [120, 90, 160], target: [0, 10, 20] },
} as const;

// ?off=sky,cards,ao,shadow switches parts off, to find what costs the most
const off = typeof window === "undefined" ? [] : (new URLSearchParams(window.location.search).get("off") ?? "").split(",");
export const labOff = (k: string) => off.includes(k);

export function Lab() {
  const [hour, setHour] = useState(8);
  const [view, setView] = useState<keyof typeof VIEWS>("approach");
  const closed = useRef(0);
  const [roof, setRoof] = useState(0);
  const v = VIEWS[view];
  return (
    <div className="fixed inset-0 bg-black">
      <Canvas
        key={view}
        shadows="soft"
        dpr={[1, 2]}
        gl={{ antialias: false, toneMapping: THREE.NoToneMapping, powerPreference: "high-performance" }}
        camera={{ position: v.pos as unknown as THREE.Vector3Tuple, fov: 38, near: 0.3, far: 1600 }}
        onCreated={(s) => void ((window as unknown as { lab: unknown }).lab = s)}
      >
        <Stage hour={hour} />
        <EvelorHill closed={closed} />
        <OrbitControls target={v.target as unknown as THREE.Vector3Tuple} makeDefault />
        <Stats />
      </Canvas>
      <div className="absolute bottom-4 left-4 flex flex-wrap items-center gap-3 bg-black/60 p-3 font-mono text-xs text-white">
        {(Object.keys(VIEWS) as (keyof typeof VIEWS)[]).map((k) => (
          <button key={k} type="button" onClick={() => setView(k)} className={k === view ? "underline" : ""}>
            {k}
          </button>
        ))}
        <label>
          hour {hour.toFixed(1)}
          <input type="range" min={6} max={18} step={0.1} value={hour} onChange={(e) => setHour(Number(e.target.value))} />
        </label>
        <label>
          roof
          <input type="range" min={0} max={1} step={0.01} value={roof} onChange={(e) => ((closed.current = Number(e.target.value)), setRoof(Number(e.target.value)))} />
        </label>
      </div>
    </div>
  );
}
