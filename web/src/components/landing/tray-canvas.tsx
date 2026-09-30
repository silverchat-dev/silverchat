"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useBlock } from "wagmi";

import { useReducedMotion } from "../motion";
import type { Tray } from "./tray-gl";

/**
 * The live tray over the plate. It loads once the tray is on screen and the page is idle, only with WebGL2 and motion
 * allowed, then fades in over the plate and the HTML print, which stay underneath as the fallback.
 */
export function TrayCanvas({ step }: { step: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const tray = useRef<Tray | null>(null);
  const stepNow = useRef(step);
  const last = useRef<{ x: number; y: number; t: number } | null>(null);
  const [on, setOn] = useState(false);
  const [stirred, setStirred] = useState(false);
  const reduced = useReducedMotion();
  const block = useBlock({ watch: true }).data?.number;

  useEffect(() => {
    stepNow.current = step;
  });

  useEffect(() => {
    const el = canvas.current;
    const card = el?.parentElement?.querySelector("figure");
    if (reduced || !el || !card || !("WebGL2RenderingContext" in window)) return;
    let dead = false;
    let idle = 0;
    let timer = 0;
    const start = () => {
      const phone = matchMedia("(pointer: coarse), (max-width: 767px)").matches;
      import("./tray-gl")
        .then((m) => m.mountTray(el, { card, phone, step: stepNow.current, onLost: () => setOn(false) }))
        .then((t) => {
          if (dead) return t.dispose();
          tray.current = t;
          setOn(true);
        })
        // no WebGL after all: the plate and the HTML print stay
        .catch(() => {});
    };
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      // Safari has no idle callback
      if (typeof requestIdleCallback === "function") idle = requestIdleCallback(start, { timeout: 1500 });
      else timer = window.setTimeout(start, 300);
    });
    io.observe(el);
    return () => {
      dead = true;
      io.disconnect();
      if (idle) cancelIdleCallback(idle);
      clearTimeout(timer);
      tray.current?.dispose();
      tray.current = null;
      setOn(false);
    };
  }, [reduced]);

  // a new exposure is a new print, once the dial has settled
  useEffect(() => {
    const id = setTimeout(() => tray.current?.setExposure(step), 250);
    return () => clearTimeout(id);
  }, [step]);

  // each new block, the tray is rocked once, the way printers keep the developer moving
  useEffect(() => {
    if (block) tray.current?.rock();
  }, [block]);

  const at = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
  };

  // a fingertip drawn through the liquid leaves a wake along its path, deeper the faster it moves
  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const t = tray.current;
    if (!t) return;
    const { x, y, w, h } = at(e);
    const p = last.current;
    if (p && Math.hypot(x - p.x, y - p.y) < 3) return;
    last.current = { x, y, t: e.timeStamp };
    if (!p) return;
    const dist = Math.hypot(x - p.x, y - p.y);
    const amp = Math.min(0.04, (0.016 * dist) / Math.max(e.timeStamp - p.t, 8));
    const n = Math.min(6, Math.ceil(dist / 12));
    setStirred(true);
    for (let i = 1; i <= n; i++) t.disturb((p.x + ((x - p.x) * i) / n) / w, 1 - (p.y + ((y - p.y) * i) / n) / h, amp, 0.018);
  };

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    const { x, y, w, h } = at(e);
    tray.current?.disturb(x / w, 1 - y / h, 0.05, 0.025);
  };

  return (
    <>
      <canvas
        ref={canvas}
        aria-hidden
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerLeave={() => (last.current = null)}
        className={`absolute inset-0 size-full touch-pan-y transition-opacity duration-700 ${on ? "opacity-100" : "opacity-0"}`}
      />
      <p
        aria-hidden
        className={`pointer-events-none absolute bottom-[8.5%] left-1/2 -translate-x-1/2 font-mono text-[10px] whitespace-nowrap uppercase tracking-[0.2em] text-paper/70 transition-opacity duration-700 ${on && !stirred ? "opacity-100" : "opacity-0"}`}
      >
        Stir the tray to develop the print
      </p>
    </>
  );
}
