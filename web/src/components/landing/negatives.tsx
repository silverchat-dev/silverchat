"use client";

import { useEffect, useRef } from "react";

import { EXAMPLE_NEGATIVES } from "@/lib/example";

import { useReducedMotion } from "../motion";

// the strip runs like an old projector: a frame is pulled down, then held while the lamp flickers and the film weaves
const PULL = { every: 2.8, takes: 0.16 };
const TICK = 1 / 18;

/** A strip of negatives: past polls, printed in reverse. Examples until real records exist. */
export function Negatives() {
  const gate = useRef<HTMLDivElement>(null);
  const reel = useRef<HTMLDivElement>(null);
  const dust = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const [g, r, c] = [gate.current, reel.current, dust.current];
    if (reduced || !g || !r || !c) return;
    const ctx = c.getContext("2d")!;
    let raf = 0;
    let on = false;
    let held = false;
    let frame = 0; // frames pulled so far
    let pulledAt = -1;
    let clock = 0;
    let last = 0;
    let tick = 0;
    let scratch = { x: 0, until: 0 };

    const step = (now: number) => {
      raf = requestAnimationFrame(step);
      const dt = Math.min((now - (last || now)) / 1000, 0.1);
      last = now;
      if (!held) clock += dt;
      const h = r.firstElementChild!.getBoundingClientRect().height;
      // the claw: a quick pull with a soft start and stop, then the frame sits in the gate
      if (!held && clock >= (frame + 1) * PULL.every && pulledAt < 0) pulledAt = clock;
      let pull = 0;
      if (pulledAt >= 0) {
        const t = Math.min((clock - pulledAt) / PULL.takes, 1);
        pull = t * t * (3 - 2 * t);
        if (t === 1) [frame, pulledAt, pull] = [frame + 1, -1, 0];
      }
      const offset = ((frame % EXAMPLE_NEGATIVES.length) + pull) * h;

      // the lamp and the gate move at the projector's own rate
      tick += dt;
      if (tick < TICK) return;
      tick = 0;
      const [wx, wy] = [(Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.7];
      r.style.transform = `translate3d(${wx}px, ${wy - offset}px, 0)`;
      g.style.filter = `brightness(${Math.random() < 0.04 ? 0.8 : 0.93 + Math.random() * 0.07})`;

      // dust on the film for a frame or two, and now and then a scratch that wanders
      const [w, hh] = [c.width, c.height];
      ctx.clearRect(0, 0, w, hh);
      ctx.fillStyle = "rgba(233, 228, 218, 0.7)";
      for (let i = Math.floor(Math.random() * 3); i > 0; i--) {
        const s = 0.6 + Math.random() * 1.4;
        ctx.beginPath();
        ctx.arc(Math.random() * w, Math.random() * hh, s, 0, Math.PI * 2);
        ctx.fill();
      }
      if (clock > scratch.until && Math.random() < 0.01) scratch = { x: w * (0.25 + Math.random() * 0.5), until: clock + 0.4 + Math.random() * 0.6 };
      if (clock < scratch.until) {
        scratch.x += (Math.random() - 0.5) * 1.5;
        ctx.fillStyle = "rgba(233, 228, 218, 0.22)";
        ctx.fillRect(scratch.x, 0, 1, hh);
      }
    };

    const size = () => {
      const b = g.getBoundingClientRect();
      [c.width, c.height] = [Math.round(b.width), Math.round(b.height)];
    };
    const run = () => {
      const go = on && document.visibilityState === "visible";
      if (go && !raf) raf = requestAnimationFrame(step);
      if (!go && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
        last = 0;
      }
    };
    const io = new IntersectionObserver(([e]) => {
      on = e.isIntersecting;
      run();
    });
    const ro = new ResizeObserver(size);
    // hovering holds the frame in the gate, so it can be read
    const enter = () => {
      held = true;
    };
    const leave = () => {
      held = false;
    };
    io.observe(g);
    ro.observe(g);
    g.addEventListener("pointerenter", enter);
    g.addEventListener("pointerleave", leave);
    document.addEventListener("visibilitychange", run);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      g.removeEventListener("pointerenter", enter);
      g.removeEventListener("pointerleave", leave);
      document.removeEventListener("visibilitychange", run);
      r.style.transform = "";
      g.style.filter = "";
    };
  }, [reduced]);

  return (
    <div className="relative mx-auto w-full max-w-[11rem]">
      <p className="mb-2 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-silver">Example records</p>
      <div ref={gate} className="relative max-h-[min(30rem,48vh)] overflow-hidden [mask-image:linear-gradient(to_bottom,black_80%,transparent)]">
        <div ref={reel} className="will-change-transform">
          {/* twice round, so the reel can loop without a seam */}
          {[...EXAMPLE_NEGATIVES, ...EXAMPLE_NEGATIVES].map((n, i) => (
            <div
              key={i}
              aria-hidden={i >= EXAMPLE_NEGATIVES.length}
              className="@container relative bg-[url(/plates/film.webp)] bg-cover"
              style={{ aspectRatio: "456 / 332" }}
            >
              <div className="absolute inset-y-[7%] right-[19%] left-[19%] flex flex-col justify-between p-[5cqw]">
                <span className="font-mono text-[6.5cqw] text-paper/70">#{n.block.toLocaleString("en-US")}</span>
                <span className="line-clamp-2 text-[6.2cqw] leading-tight break-words text-paper/85">{n.question}</span>
                <span className="space-y-[2cqw] font-mono text-[5.5cqw] text-paper/60">
                  {[
                    ["YES", n.yes],
                    ["NO", 100 - n.yes],
                  ].map(([k, v]) => (
                    <span key={k} className="flex items-center gap-[3cqw]">
                      <span className="w-[14cqw]">{k}</span>
                      <span className="h-[3cqw] flex-1 bg-paper/10">
                        <span className="block h-full bg-paper/55" style={{ width: `${v}%` }} />
                      </span>
                      <span className="w-[10cqw] text-right tabular-nums">{v}</span>
                    </span>
                  ))}
                </span>
              </div>
            </div>
          ))}
        </div>
        <canvas ref={dust} aria-hidden className="pointer-events-none absolute inset-0 size-full" />
      </div>
    </div>
  );
}
