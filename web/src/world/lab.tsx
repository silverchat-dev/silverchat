"use client";

/**
 * A bench for building sets: one set on its own (?set=<id>), the stage at its hour, free orbit, its camera poses as
 * buttons. window.lab exposes the renderer state, so scripts/world-shot.mjs can render frames from it. Not linked.
 */
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useRef, useState } from "react";
import * as THREE from "three";

import { setById } from "./sets";
import { Stage } from "./stage";

const params = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
// ?off=sky,cards,ao,shadow switches parts off, to find what costs the most
const off = (params.get("off") ?? "").split(",");
export const labOff = (k: string) => off.includes(k);

export function Lab() {
  const set = setById(params.get("set") ?? "hill");
  const poses = Object.entries(set.poses);
  const [hour, setHour] = useState(Number(params.get("hour") ?? set.hour));
  const [view, setView] = useState(params.get("view") ?? poses[0][0]);
  const roof = useRef(0);
  const burst = useRef(0);
  const [roofValue, setRoofValue] = useState(0);
  const pose = set.poses[view] ?? poses[0][1];
  return (
    <div className="fixed inset-0 z-50 bg-black">
      <Canvas
        key={view}
        shadows="soft"
        dpr={[1, 2]}
        gl={{ antialias: false, toneMapping: THREE.NoToneMapping, powerPreference: "high-performance", preserveDrawingBuffer: false }}
        camera={{ position: pose.position, fov: 38, near: 0.3, far: 1600 }}
        onCreated={(s) => void ((window as unknown as { lab: unknown }).lab = s)}
      >
        <Stage hour={hour} />
        <set.Scene live={{ roof, burst }} />
        <OrbitControls target={pose.target} makeDefault />
      </Canvas>
      <div className="absolute bottom-4 left-4 flex flex-wrap items-center gap-3 bg-black/60 p-3 font-mono text-xs text-white">
        <span>{set.id}</span>
        {poses.map(([k]) => (
          <button key={k} type="button" onClick={() => setView(k)} className={k === view ? "underline" : ""}>
            {k}
          </button>
        ))}
        <label>
          hour {hour.toFixed(1)}
          <input type="range" min={6} max={23} step={0.1} value={hour} onChange={(e) => setHour(Number(e.target.value))} />
        </label>
        <label>
          roof
          <input type="range" min={0} max={1} step={0.01} value={roofValue} onChange={(e) => ((roof.current = Number(e.target.value)), setRoofValue(Number(e.target.value)))} />
        </label>
        <button type="button" onClick={() => ((burst.current = 1), setTimeout(() => (burst.current = 0), 2500))}>
          burn
        </button>
      </div>
    </div>
  );
}
