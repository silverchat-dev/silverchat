"use client";

/**
 * Meldan itself: one canvas behind the whole site. The camera follows the walk (state.ts) along the rail (rail.ts);
 * only the one or two places near it are mounted. Quality starts low and steps up while frames stay fast, and the
 * level reached is remembered; nothing is drawn while the tab is hidden or a panel covers the screen.
 */
import { PerformanceMonitor } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import { SEGMENTS, newView, viewAt } from "./rail";
import { setById } from "./sets";
import type { Live } from "./sets/types";
import { Stage } from "./stage";
import { world, useWorld, type Tier } from "./state";

const TIER_KEY = "meldan:tier";
// rendered pixels, not device pixel ratio, is what the GPU pays for: a 4K screen at ratio 2 is 4 times a laptop's
const PIXELS = { 1: 1.4e6, 2: 2.6e6, 3: 3.7e6 } as const;

function Scene({ live }: { live: Live }) {
  const { camera, setFrameloop } = useThree();
  const view = useRef(newView());
  const veil = useMemo(() => ({ value: 0 }), []);
  const current = useRef<number | null>(null);
  // a far jump from the menu: into the haze, across, and out at the new stop (0 to 2)
  const fade = useRef<{ phase: number; to: number } | null>(null);
  const [frame, setFrame] = useState({ hour: 8.5, sets: ["hill"], shown: "hill" });
  const tier = useWorld((s) => s.tier);
  const covered = useWorld((s) => s.covered);
  const frames = useRef(0);

  useEffect(() => {
    const sync = () => setFrameloop(document.hidden || world.get().covered ? "never" : "always");
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [setFrameloop, covered]);

  useFrame((_, rawDt) => {
    if (++frames.current === 4) world.set({ ready: true });
    const dt = Math.min(rawDt, 0.05);
    const { target, jump } = world.get();
    if (current.current === null) current.current = target;
    if (jump && !fade.current && Math.abs(target - current.current) > 1.01 / SEGMENTS) fade.current = { phase: 0, to: target };
    let fadeVeil = 0;
    if (fade.current) {
      fade.current.phase += dt / 0.45;
      if (fade.current.phase >= 1 && current.current !== fade.current.to) current.current = fade.current.to;
      fadeVeil = fade.current.phase < 1 ? THREE.MathUtils.smoothstep(fade.current.phase, 0, 1) : 1 - THREE.MathUtils.smoothstep(fade.current.phase, 1, 2);
      if (fade.current.phase >= 2) {
        fade.current = null;
        world.set({ jump: false });
      }
    } else {
      // a short glide: scroll and short hops ease in, never snap
      current.current += (target - current.current) * (1 - Math.exp(-dt * (jump ? 2.2 : 3.4)));
      if (jump && Math.abs(target - current.current) < 1e-4) world.set({ jump: false });
    }
    const v = viewAt(current.current, view.current);
    camera.position.copy(v.pos);
    camera.lookAt(v.look);
    veil.value = Math.max(v.veil, fadeVeil);
    if (Math.abs(v.hour - frame.hour) > 0.05 || v.shown !== frame.shown || v.sets.join() !== frame.sets.join()) {
      setFrame({ hour: v.hour, sets: [...v.sets], shown: v.shown });
    }
  });

  return (
    <>
      <Stage hour={frame.hour} veil={veil} quality={tier >= 3 ? "high" : "low"} centre={setById(frame.shown).origin} />
      {frame.sets.map((id) => {
        const set = setById(id);
        return (
          <group key={id} position={set.origin} visible={id === frame.shown}>
            <set.Scene live={live} />
          </group>
        );
      })}
    </>
  );
}

function Pixels({ tier }: { tier: Tier }) {
  const { gl, size } = useThree();
  useEffect(() => {
    const budget = PIXELS[tier as 1 | 2 | 3] ?? PIXELS[1];
    gl.setPixelRatio(Math.min(window.devicePixelRatio, Math.sqrt(budget / (size.width * size.height))));
  }, [gl, size, tier]);
  return null;
}

/** The canvas. Mounted by mount.tsx only where WebGL2 works; `live` carries the site's data into the places. */
export default function World({ live }: { live: Live }) {
  const tier = useWorld((s) => s.tier);
  const step = (d: 1 | -1) => {
    const next = Math.max(1, Math.min(3, world.get().tier + d)) as Tier;
    if (next === world.get().tier) return;
    world.set({ tier: next });
    try {
      localStorage.setItem(TIER_KEY, String(next));
    } catch {}
  };
  return (
    <Canvas
      shadows="soft"
      dpr={1}
      gl={{ antialias: false, toneMapping: THREE.NoToneMapping, powerPreference: "high-performance", alpha: false }}
      camera={{ fov: 38, near: 0.3, far: 1600 }}
      aria-hidden
      style={{ pointerEvents: "none" }}
      onCreated={(state) => {
        const { gl } = state;
        if (process.env.NODE_ENV === "development") (window as unknown as { meldanGl: unknown }).meldanGl = state;
        // iOS drops the GL context when the tab is put away; the still behind the canvas takes over
        gl.domElement.addEventListener("webglcontextlost", () => world.set({ failed: true }));
      }}
    >
      <PerformanceMonitor onIncline={() => step(1)} onDecline={() => step(-1)} flipflops={3} onFallback={() => world.set({ tier: 1 })} />
      <Pixels tier={tier} />
      <Scene live={live} />
    </Canvas>
  );
}

/** The tier to start at: what this browser reached before, or low on phones and medium elsewhere. 0 means stills. */
export function startTier(): Tier {
  const gl = document.createElement("canvas").getContext("webgl2");
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  if (!gl || matchMedia("(prefers-reduced-motion: reduce)").matches || nav.connection?.saveData || (nav.deviceMemory ?? 8) <= 4) return 0;
  try {
    const saved = Number(localStorage.getItem(TIER_KEY));
    if (saved >= 1 && saved <= 3) return saved as Tier;
  } catch {}
  return matchMedia("(pointer: coarse)").matches ? 1 : 2;
}
