"use client";

/**
 * The gate at "/": shown once per visit while the world loads. It carries the pitch and the stops as links that work
 * at once, so nobody waits on it; the bar follows real steps (the world's code, the music, the first frames drawn).
 * Enter starts the music from the click, as browsers require; Enter without sound and Skip are always there.
 */
import Link from "next/link";
import { useEffect, useState } from "react";

import { playMusic, prepareMusic } from "./audio";
import { world, useWorld } from "./state";
import { STOPS } from "./stops";

const SEEN = "meldan:entered";

export function Gate() {
  const open = useWorld((s) => s.gate);
  const [steps, setSteps] = useState({ code: false, music: false });
  const ready = useWorld((s) => s.ready);
  const tier = useWorld((s) => s.tier);
  const failed = useWorld((s) => s.failed);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN) === "1";
    } catch {}
    if (seen) return world.set({ entered: true });
    world.set({ gate: true });
    void import("./world").then(() => setSteps((s) => ({ ...s, code: true })));
    prepareMusic()
      .then(() => setSteps((s) => ({ ...s, music: true })))
      .catch(() => setSteps((s) => ({ ...s, music: true })));
  }, []);

  // the world beneath must not take focus or clicks while the gate is up
  useEffect(() => {
    const main = document.getElementById("walk");
    if (main) main.inert = open;
  }, [open]);

  if (!open) return null;
  const stills = tier === 0 || failed;
  const done = [steps.code, steps.music, ready || stills].filter(Boolean).length;
  const enter = (sound: boolean) => {
    try {
      sessionStorage.setItem(SEEN, "1");
    } catch {}
    world.set({ entered: true, gate: false, sound });
    if (sound) void playMusic().catch(() => world.set({ sound: false }));
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="gate-title" className="fixed inset-0 z-40 flex items-end bg-developer/80 px-5 pb-[10svh] sm:px-10">
      <div className="max-w-2xl space-y-6">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-silver">silverchat · from Snowmoon, ch. 27</p>
        <h1 id="gate-title" className="text-[clamp(2.6rem,7vw,5rem)] leading-[1.02]">
          A day in Meldan.
        </h1>
        <p className="max-w-xl text-lg text-paper/85">
          The polling network from the book, as a walk through its city. Each place is one thing you can do: answer, ask, bet,
          launch, go private, read the record, open the riddle.
        </p>
        <div className="h-px w-full max-w-md bg-silver/25" role="progressbar" aria-valuemin={0} aria-valuemax={3} aria-valuenow={done} aria-label="Loading the city">
          <div className="h-px bg-paper transition-[width] duration-700" style={{ width: `${(done / 3) * 100}%` }} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => enter(true)} disabled={done < 3} className="rounded-full bg-tap px-6 py-3 font-mono text-sm text-black transition-[filter] hover:brightness-110 disabled:opacity-40">
            {done < 3 ? "Loading the city…" : "Enter Meldan"}
          </button>
          <button type="button" onClick={() => enter(false)} disabled={done < 3} className="rounded-full border border-paper/40 px-5 py-3 font-mono text-sm text-paper/90 transition-colors hover:border-paper disabled:opacity-40">
            Enter without sound
          </button>
          <button type="button" onClick={() => enter(false)} className="px-2 py-3 font-mono text-sm text-paper/70 underline-offset-4 hover:underline">
            Skip
          </button>
        </div>
        <nav aria-label="Go straight to" className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs text-paper/70">
          {STOPS.slice(1)
            .filter((s) => s.live)
            .map((s) => (
              <Link key={s.id} href={s.routes[0]} scroll={false} onClick={() => enter(false)} className="underline-offset-4 hover:text-paper hover:underline">
                {s.name}
              </Link>
            ))}
        </nav>
      </div>
    </div>
  );
}
