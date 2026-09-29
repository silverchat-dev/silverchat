"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useBlock } from "wagmi";

import { MIN_HOLD_USD } from "@/lib/algorithm";
import { SPLIT } from "@/lib/pricing";

import { useReducedMotion } from "../motion";

const share = (i: number) => `${Number(SPLIT[i][1]) / 100}%`;

const PRINTS: { title: string; body: string; foot: string; image: ReactNode }[] = [
  {
    title: "Ask",
    body: "Write a question and pay in $ZC. Choose how many holders it reaches, from 100 to a million, and how high it sits in the feed.",
    foot: "priced per person, in ZC",
    image: (
      <svg viewBox="0 0 120 80" className="size-full">
        {/* the dial: five stops, one set */}
        <line x1="14" y1="46" x2="106" y2="46" stroke="currentColor" strokeOpacity=".45" />
        {[14, 37, 60, 83, 106].map((x, i) => (
          <g key={x}>
            <line x1={x} y1="42" x2={x} y2="50" stroke="currentColor" strokeOpacity=".6" />
            <text x={x} y="62" textAnchor="middle" fontSize="6.5" fill="currentColor" fillOpacity={i === 2 ? 1 : 0.55} fontFamily="var(--font-jetbrains)">
              {["100", "1K", "10K", "100K", "1M"][i]}
            </text>
          </g>
        ))}
        <circle cx="60" cy="46" r="4.5" fill="currentColor" />
        <text x="60" y="30" textAnchor="middle" fontSize="9" fill="currentColor" fontFamily="var(--font-caslon)">
          10,000 people
        </text>
      </svg>
    ),
  },
  {
    title: "Answer",
    body: `Hold $${MIN_HOLD_USD} of ZC or SC at the block a poll opens and you can answer it. You sign, you don't pay gas. One answer per wallet.`,
    foot: "a sample of the network, not everyone",
    image: (
      <svg viewBox="0 0 120 80" className="size-full">
        {/* a signature on the line */}
        <path
          d="M18 50c8-14 13-20 16-16s-6 18-2 18 10-22 15-22-3 20 2 20 9-15 13-15-2 12 3 12 8-9 12-9 3 6 7 6 6-3 10-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <line x1="14" y1="58" x2="106" y2="58" stroke="currentColor" strokeOpacity=".4" />
        <text x="60" y="70" textAnchor="middle" fontSize="6.5" fill="currentColor" fillOpacity=".6" fontFamily="var(--font-jetbrains)">
          signed · 0 gas
        </text>
      </svg>
    ),
  },
  {
    title: "Fix",
    body: "A minute after close, the result goes on Ethereum as a root over every signed answer. Then nobody, us included, can change it.",
    foot: "not fixed in 7 days? the asker is refunded",
    image: (
      <svg viewBox="0 0 120 80" className="size-full">
        {/* blocks in a chain, the last one sealed */}
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <rect x={12 + i * 34} y="26" width="26" height="26" fill="none" stroke="currentColor" strokeOpacity={i === 2 ? 1 : 0.45} />
            {i < 2 && <line x1={38 + i * 34} y1="39" x2={46 + i * 34} y2="39" stroke="currentColor" strokeOpacity=".45" />}
          </g>
        ))}
        <path d="M86 39l4 4 8-9" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <text x="60" y="66" textAnchor="middle" fontSize="6.5" fill="currentColor" fillOpacity=".6" fontFamily="var(--font-jetbrains)">
          root 0x9f3c…e1a4
        </text>
      </svg>
    ),
  },
  {
    title: "Claim",
    body: `${share(0)} of what the asker paid goes to the people who answered. Claim yours in one transaction, any time in the next 90 days.`,
    foot: "unclaimed shares are burned",
    image: (
      <svg viewBox="0 0 120 80" className="size-full">
        {/* a claim slip: a few polls answered, one total */}
        {[
          ["poll 12", "1.84"],
          ["poll 15", "0.92"],
          ["poll 19", "3.10"],
        ].map(([k, v], i) => (
          <g key={k} fontSize="6.5" fill="currentColor" fillOpacity=".7" fontFamily="var(--font-jetbrains)">
            <text x="22" y={24 + i * 11}>{k}</text>
            <text x="98" y={24 + i * 11} textAnchor="end">
              {v} ZC
            </text>
          </g>
        ))}
        <line x1="22" y1="54" x2="98" y2="54" stroke="currentColor" strokeOpacity=".45" />
        <text x="98" y="66" textAnchor="end" fontSize="8" fill="currentColor" fontFamily="var(--font-jetbrains)">
          5.86 ZC
        </text>
        <text x="22" y="66" fontSize="6.5" fill="currentColor" fillOpacity=".6" fontFamily="var(--font-jetbrains)">
          one claim
        </text>
      </svg>
    ),
  },
  {
    title: "Recount",
    body: "Your browser downloads every answer and recounts the result against the root on-chain. The rules for the feed are one public file, its hash on-chain.",
    foot: "don't trust it, check it",
    image: (
      <svg viewBox="0 0 120 80" className="size-full">
        {/* tally marks, counted twice */}
        {[0, 1, 2].map((g) => (
          <g key={g} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            {[0, 1, 2, 3].map((k) => (
              <line key={k} x1={20 + g * 30 + k * 5} y1="26" x2={20 + g * 30 + k * 5} y2="46" />
            ))}
            <line x1={17 + g * 30} y1="42" x2={40 + g * 30} y2="30" />
          </g>
        ))}
        <text x="60" y="66" textAnchor="middle" fontSize="6.5" fill="currentColor" fillOpacity=".6" fontFamily="var(--font-jetbrains)">
          9,481 = 9,481
        </text>
      </svg>
    ),
  },
];

/*
 * The line is a light cord pegged with prints: between pegs it runs nearly straight and it kinks at each one. It bobs
 * as a string of masses fixed at both walls; each print swings on its peg towards and away from you, a little in the
 * plane of the wall, and twists slowly. A draft moves along the line, each new block sends a gust down it, and a hand
 * brushing past or a tap nudges a print.
 */
const CORD = { sag: 0.07, k: 178, damping: 1.2 }; // sag as a share of the line's width; spring and damping per mass
const SWING = [
  { w: 2 * Math.PI * 1.3, damping: 1.1 }, // towards and away from you
  { w: 2 * Math.PI * 1.6, damping: 3 }, // in the plane of the wall, held back by the peg
  { w: 2 * Math.PI * 0.5, damping: 0.35 }, // twist
];

const LIMIT = [12, 4, 9]; // degrees

export function Line() {
  const wrap = useRef<HTMLDivElement>(null);
  const cord = useRef<SVGPathElement>(null);
  const prints = useRef<(HTMLLIElement | null)[]>([]);
  const kick = useRef<(i: number, a: [number, number, number], dip: number) => void>(() => {});
  const reduced = useReducedMotion();
  const block = useBlock({ watch: true }).data?.number;

  useEffect(() => {
    const el = wrap.current;
    const path = cord.current;
    if (!el || !path) return;
    const n = PRINTS.length;
    const u = new Float64Array(n); // how far each peg has moved down from rest, in px
    const uv = new Float64Array(n);
    const a = Array.from({ length: n }, () => [0, 0, 0]); // swing angles in degrees
    const av = Array.from({ length: n }, () => [0, 0, 0]);
    let width = 0;
    let pegs: number[] = [];
    let rest: number[] = [];
    let top = 0;

    const measure = () => {
      width = el.scrollWidth;
      el.style.setProperty("--line-width", `${width}px`);
      top = parseFloat(getComputedStyle(el).getPropertyValue("--cord-top")) || 48;
      pegs = prints.current.map((p) => (p ? p.offsetLeft + p.offsetWidth / 2 : 0));
      // point loads on a light cord: the pegs sit on a parabola, the cord runs straight between them
      rest = pegs.map((x) => top + CORD.sag * width * 4 * (x / width) * (1 - x / width));
    };

    const draw = () => {
      const pts = [[0, top], ...pegs.map((x, i) => [x, rest[i] + u[i]]), [width, top]];
      // each run between pegs hangs a touch under its own weight
      let d = `M${pts[0][0]},${pts[0][1]}`;
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1];
        const [x1, y1] = pts[i];
        d += ` Q${(x0 + x1) / 2},${(y0 + y1) / 2 + ((x1 - x0) / width) * 10} ${x1},${y1}`;
      }
      path.setAttribute("d", d);
      prints.current.forEach((p, i) => {
        if (p) p.style.transform = `translate3d(0, ${rest[i] - top + u[i]}px, 0) rotateX(${a[i][0]}deg) rotateZ(${a[i][1]}deg) rotateY(${a[i][2]}deg)`;
      });
    };

    measure();
    if (reduced) {
      // still, but not ruler straight
      a.forEach((s, i) => (s[1] = [0.6, -0.4, 0.3, -0.7, 0.5][i]));
      draw();
      const ro = new ResizeObserver(() => (measure(), draw()));
      ro.observe(el);
      return () => ro.disconnect();
    }

    kick.current = (i, imp, dip) => {
      if (i < 0 || i >= n) return;
      av[i][0] += imp[0];
      av[i][1] += imp[1];
      av[i][2] += imp[2];
      uv[i] += dip;
    };

    let raf = 0;
    let last = 0;
    let t = Math.random() * 100;
    const H = 1 / 120;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      let dt = Math.min((now - (last || now)) / 1000, 0.05);
      last = now;
      while (dt > 0) {
        const h = Math.min(H, dt);
        dt -= h;
        t += h;
        for (let i = 0; i < n; i++) {
          // the cord: neighbours pull each peg back into line, the walls hold the ends
          const f = CORD.k * ((i ? u[i - 1] : 0) - 2 * u[i] + (i < n - 1 ? u[i + 1] : 0)) - CORD.damping * uv[i];
          uv[i] += f * h;
          // the draft, arriving a little later down the line; mostly pushes prints back, a little sideways
          const x = pegs[i] / width;
          const draft = Math.sin(0.9 * t - 3 * x) * 0.6 + Math.sin(1.7 * t - 5 * x + 1.3) * 0.3 + Math.sin(0.37 * t + 2 * x) * 0.5;
          const push = [2.6 * draft, 0.5 * draft, 1.2 * Math.sin(0.23 * t + 4 * x)];
          for (let k = 0; k < 3; k++) {
            const { w, damping } = SWING[k];
            av[i][k] += (w * w * (push[k] - a[i][k]) * 0.35 - w * w * 0.65 * a[i][k] - damping * av[i][k]) * h;
          }
        }
        for (let i = 0; i < n; i++) {
          u[i] += uv[i] * h;
          for (let k = 0; k < 3; k++) {
            a[i][k] += av[i][k] * h;
            // a peg only lets a print go so far
            if (Math.abs(a[i][k]) > LIMIT[k]) [a[i][k], av[i][k]] = [Math.sign(a[i][k]) * LIMIT[k], av[i][k] * -0.3];
          }
        }
      }
      draw();
    };

    const run = (on: boolean) => {
      if (on && document.visibilityState === "visible" && !raf) {
        last = 0;
        raf = requestAnimationFrame(frame);
      } else if (!on && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };
    let visible = false;
    const io = new IntersectionObserver(([e]) => run((visible = e.isIntersecting)));
    const ro = new ResizeObserver(() => {
      measure();
      draw();
    });
    const onVisibility = () => run(visible);
    // on a phone the line is flung sideways: the prints lag behind the change in speed and swing
    let sx = el.scrollLeft;
    let sv = 0;
    let st = 0;
    const onScroll = (e: Event) => {
      const dt = Math.max((e.timeStamp - st) / 1000, 1 / 120);
      const v = (el.scrollLeft - sx) / dt;
      const dv = Math.max(-4000, Math.min(4000, v - sv));
      [sx, sv, st] = [el.scrollLeft, v, e.timeStamp];
      for (let i = 0; i < n; i++) av[i][1] += dv * 0.004;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    io.observe(el);
    ro.observe(el);
    document.addEventListener("visibilitychange", onVisibility);
    draw();
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      el.removeEventListener("scroll", onScroll);
      kick.current = () => {};
    };
  }, [reduced]);

  // each new block, a gust runs down the line from the left
  useEffect(() => {
    if (!block) return;
    const ids = PRINTS.map((_, i) => window.setTimeout(() => kick.current(i, [14, 3, 5], 18), 120 + i * 140));
    return () => ids.forEach(clearTimeout);
  }, [block]);

  // a hand brushing past pushes a print sideways and turns it; a tap pushes it back
  const last = useRef<{ x: number; t: number } | null>(null);
  const brush = (i: number) => (e: React.PointerEvent<HTMLLIElement>) => {
    const p = last.current;
    last.current = { x: e.clientX, t: e.timeStamp };
    if (!p || e.pointerType !== "mouse") return;
    const vx = Math.max(-3, Math.min(3, (e.clientX - p.x) / Math.max(e.timeStamp - p.t, 8)));
    const r = e.currentTarget.getBoundingClientRect();
    const off = (e.clientX - r.left) / r.width - 0.5;
    kick.current(i, [Math.abs(vx) * 4, vx * 7, vx * 10 * off], Math.abs(vx) * 6);
  };
  const tap = (i: number) => () => kick.current(i, [40, 0, 8], 30);

  return (
    <section aria-labelledby="line-title" className="relative overflow-hidden py-20 md:py-28">
      <div className="mx-auto max-w-6xl space-y-4 px-5 sm:px-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-silver">How it works</p>
        <h2 id="line-title" className="max-w-2xl text-[clamp(2rem,4.2vw,3.5rem)] leading-[1.05]">
          How a question becomes a record
        </h2>
        <p className="max-w-xl text-lg leading-relaxed text-paper/75">
          Every poll goes through the same five steps. Each one leaves a trace you can check.
        </p>
      </div>

      <div
        ref={wrap}
        tabIndex={0}
        role="region"
        aria-label="Five steps, scroll sideways"
        className="relative mt-14 snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [--cord-top:48px] xl:snap-none xl:overflow-visible [&::-webkit-scrollbar]:hidden"
      >
        <svg aria-hidden className="pointer-events-none absolute inset-y-0 left-0 h-full overflow-visible" style={{ width: "var(--line-width, 100%)" }}>
          <path ref={cord} fill="none" stroke="var(--color-silver)" strokeOpacity=".55" strokeWidth="1.5" />
        </svg>
        <ol className="relative flex w-max gap-6 px-[12vw] pt-[48px] pb-10 [perspective:1400px] xl:w-full xl:justify-between xl:gap-0 xl:px-[6vw]">
          {PRINTS.map((p, i) => (
            <li
              key={p.title}
              ref={(e) => {
                prints.current[i] = e;
              }}
              onPointerMove={brush(i)}
              onPointerLeave={() => (last.current = null)}
              onPointerDown={tap(i)}
              className="relative w-[70vw] max-w-[15rem] shrink-0 origin-top snap-center will-change-transform xl:w-[17%] xl:max-w-[14.5rem]"
            >
              <Peg />
              <article className="flex h-[25rem] flex-col bg-[url(/plates/paper.webp)] bg-cover p-3 pb-4 text-developer ">
                <div className="aspect-[3/2] bg-developer text-paper/90">{p.image}</div>
                <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-developer/60">{String(i + 1).padStart(2, "0")}</p>
                <h3 className="mt-1 text-2xl leading-tight">{p.title}</h3>
                <p className="mt-2 text-[0.95rem] leading-snug text-developer/85">{p.body}</p>
                <p className="mt-auto pt-3 font-mono text-[10px] text-developer/55">{p.foot}</p>
              </article>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// a wooden peg in silver tones, gripping the cord and the top of the print
function Peg() {
  return (
    <svg aria-hidden viewBox="0 0 14 40" className="absolute -top-[22px] left-1/2 z-10 h-10 w-3.5 -translate-x-1/2">
      <rect x="1" y="0" width="5.5" height="40" rx="1.5" fill="#8f8a82" />
      <rect x="7.5" y="0" width="5.5" height="40" rx="1.5" fill="#a39e95" />
      <rect x="0" y="15" width="14" height="4" rx="1" fill="#5d5a55" />
      <line x1="7" y1="2" x2="7" y2="14" stroke="#141312" strokeOpacity=".5" />
    </svg>
  );
}
