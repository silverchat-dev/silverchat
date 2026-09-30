"use client";

import { useEffect, useRef } from "react";

import { EXAMPLE_NEGATIVES } from "@/lib/example";

import { useReducedMotion } from "../motion";

// the strip runs like an old projector: a frame is pulled through, then held while the lamp flickers and the film weaves
const PULL = { every: 2.8, takes: 0.16 };
const TICK = 1 / 18;

export type Negative = { block: number; question: string; options: [string, number][] };

export const EXAMPLES: Negative[] = EXAMPLE_NEGATIVES.map((n) => ({
  block: n.block,
  question: n.question,
  options: [
    ["Yes", n.yes],
    ["No", 100 - n.yes],
  ],
}));

/**
 * One frame of film with a record on it, as a negative: light marks on the dark base. `across` is the strip lying on its
 * side, sprockets top and bottom; `print` is the same record printed on paper, for a frame that is being printed.
 */
export function Frame({ n, across = false, print = false }: { n: Negative; across?: boolean; print?: boolean }) {
  const ink = print ? "text-developer" : "text-paper";
  return (
    <div
      className={`@container absolute flex flex-col justify-between p-[4%] ${across ? "inset-x-[5%] inset-y-[19%]" : "inset-x-[19%] inset-y-[7%]"} ${print ? "bg-[url(/plates/paper.webp)] bg-cover" : ""}`}
    >
      <span className={`font-mono text-[7cqw] ${ink} opacity-70`}>#{n.block.toLocaleString("en-US")}</span>
      <span className={`line-clamp-3 text-[9cqw] leading-tight break-words ${ink} opacity-90`}>{n.question}</span>
      <span className={`space-y-[2.5cqw] font-mono text-[6cqw] ${ink} opacity-70`}>
        {n.options.map(([o, v], k) => (
          <span key={o} className="flex items-center gap-[3cqw]">
            <span className="w-[16cqw] truncate uppercase">{o}</span>
            <span className={`h-[3.5cqw] flex-1 ${print ? "bg-developer/12" : "bg-paper/10"}`}>
              <span
                className={`block h-full ${print ? (k ? "bg-developer/60" : "bg-developer") : k ? "bg-paper/40" : "bg-paper/70"}`}
                style={{ width: `${v}%` }}
              />
            </span>
            <span className="w-[11cqw] text-right tabular-nums">{v}</span>
          </span>
        ))}
      </span>
    </div>
  );
}

/** A strip of negatives: past polls, printed in reverse. Examples until real records exist. */
export function Negatives({ across = false }: { across?: boolean }) {
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
    let size = 0; // one frame along the strip, measured on resize

    const step = (now: number) => {
      raf = requestAnimationFrame(step);
      const dt = Math.min((now - (last || now)) / 1000, 0.1);
      last = now;
      if (!held) clock += dt;
      // the claw: a quick pull with a soft start and stop, then the frame sits in the gate
      if (!held && clock >= (frame + 1) * PULL.every && pulledAt < 0) pulledAt = clock;
      let pull = 0;
      if (pulledAt >= 0) {
        const t = Math.min((clock - pulledAt) / PULL.takes, 1);
        pull = t * t * (3 - 2 * t);
        if (t === 1) [frame, pulledAt, pull] = [frame + 1, -1, 0];
      }
      const offset = ((frame % EXAMPLES.length) + pull) * size;

      // the lamp and the gate move at the projector's own rate
      tick += dt;
      if (tick < TICK) return;
      tick = 0;
      const [wx, wy] = [(Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.7];
      r.style.transform = across ? `translate3d(${wx - offset}px, ${wy}px, 0)` : `translate3d(${wx}px, ${wy - offset}px, 0)`;
      g.style.filter = `brightness(${Math.random() < 0.04 ? 0.8 : 0.93 + Math.random() * 0.07})`;

      // dust on the film for a frame or two, and now and then a scratch that wanders along the film
      const [w, h] = [c.width, c.height];
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(233, 228, 218, 0.7)";
      for (let i = Math.floor(Math.random() * 3); i > 0; i--) {
        ctx.beginPath();
        ctx.arc(Math.random() * w, Math.random() * h, 0.6 + Math.random() * 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      if (clock > scratch.until && Math.random() < 0.01) scratch = { x: (across ? h : w) * (0.25 + Math.random() * 0.5), until: clock + 0.4 + Math.random() * 0.6 };
      if (clock < scratch.until) {
        scratch.x += (Math.random() - 0.5) * 1.5;
        ctx.fillStyle = "rgba(233, 228, 218, 0.22)";
        if (across) ctx.fillRect(0, scratch.x, w, 1);
        else ctx.fillRect(scratch.x, 0, 1, h);
      }
    };

    const measure = () => {
      const b = g.getBoundingClientRect();
      [c.width, c.height] = [Math.round(b.width), Math.round(b.height)];
      const f = r.firstElementChild as HTMLElement;
      size = across ? f.offsetWidth : f.offsetHeight;
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
    const ro = new ResizeObserver(measure);
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
  }, [reduced, across]);

  // twice round, so the reel can loop without a seam
  const frames = [...EXAMPLES, ...EXAMPLES].map((n, i) => (
    <div
      key={i}
      aria-hidden={i >= EXAMPLES.length}
      className={`relative shrink-0 bg-cover ${across ? "w-[38vw] max-w-[10rem] bg-[url(/plates/film-across.webp)]" : "bg-[url(/plates/film.webp)]"}`}
      style={{ aspectRatio: across ? "332 / 456" : "456 / 332" }}
    >
      <Frame n={n} across={across} />
    </div>
  ));

  return (
    <div className={`relative mx-auto w-full ${across ? "" : "max-w-[11rem]"}`}>
      <p className={`mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-silver ${across ? "" : "text-center"}`}>Example records</p>
      <div
        ref={gate}
        className={`relative overflow-hidden ${
          across
            ? "[mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]"
            : "max-h-[min(30rem,48vh)] [mask-image:linear-gradient(to_bottom,black_80%,transparent)]"
        }`}
      >
        <div ref={reel} className={`will-change-transform ${across ? "flex" : ""}`}>
          {frames}
        </div>
        <canvas ref={dust} aria-hidden className="pointer-events-none absolute inset-0 size-full" />
      </div>
    </div>
  );
}
