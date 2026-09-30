"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useBlock } from "wagmi";

import { useReducedMotion } from "../motion";
import type { Tray } from "./tray-gl";

const NUDGE = 0.08;
const KEYS: Record<string, [number, number]> = { ArrowLeft: [-NUDGE, 0], ArrowRight: [NUDGE, 0], ArrowUp: [0, NUDGE], ArrowDown: [0, -NUDGE] };

/**
 * The live tray over the plate. It loads once the tray is on screen and the page is idle, only with WebGL2 and motion
 * allowed, then fades in over the plate and the HTML print, which stay underneath as the fallback.
 * The pointer stirs the developer; pressing the print picks it up (a mouse at once, a finger after a short hold, so the
 * page still scrolls), and letting go drops it back.
 */
export function TrayCanvas({ step }: { step: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const tray = useRef<Tray | null>(null);
  const stepNow = useRef(step);
  const last = useRef<{ x: number; y: number; t: number } | null>(null);
  const holding = useRef(false);
  const touchHold = useRef(0);
  const [on, setOn] = useState(false);
  const [held, setHeld] = useState(false);
  const [used, setUsed] = useState(false);
  const reduced = useReducedMotion();
  const block = useBlock({ watch: true }).data?.number;

  useEffect(() => {
    stepNow.current = step;
  });

  const letGo = () => {
    clearTimeout(touchHold.current);
    if (!holding.current) return;
    holding.current = false;
    setHeld(false);
    tray.current?.drop();
    if (canvas.current) canvas.current.style.cursor = "";
  };
  const letGoNow = useRef(letGo);
  useEffect(() => {
    letGoNow.current = letGo;
  });

  useEffect(() => {
    const el = canvas.current;
    const card = el?.parentElement?.querySelector("figure");
    if (reduced || !el || !card || !("WebGL2RenderingContext" in window)) return;
    let dead = false;
    let idle = 0;
    let timer = 0;
    const lost = () => {
      // the fallback stays for good: the plate and the HTML print are still underneath
      tray.current?.dispose();
      tray.current = null;
      setOn(false);
    };
    const start = () => {
      const phone = matchMedia("(pointer: coarse), (max-width: 767px)").matches;
      import("./tray-gl")
        .then((m) => m.mountTray(el, { card, phone, step: stepNow.current, onLost: lost }))
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
    // a finger holding the print shouldn't scroll the page
    const noScroll = (e: TouchEvent) => holding.current && e.preventDefault();
    el.addEventListener("touchmove", noScroll, { passive: false });
    const blur = () => letGoNow.current();
    const away = () => document.visibilityState === "hidden" && letGoNow.current();
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", away);
    return () => {
      dead = true;
      io.disconnect();
      if (idle) cancelIdleCallback(idle);
      clearTimeout(timer);
      el.removeEventListener("touchmove", noScroll);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", away);
      tray.current?.dispose();
      tray.current = null;
      setOn(false);
    };
  }, [reduced]);

  // a new exposure is a new print, once the dial has settled
  useEffect(() => {
    const id = setTimeout(() => {
      letGoNow.current();
      tray.current?.setExposure(step);
    }, 250);
    return () => clearTimeout(id);
  }, [step]);

  // each new block, the tray is rocked once, the way printers keep the developer moving
  useEffect(() => {
    if (block) tray.current?.rock();
  }, [block]);

  const at = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const [x, y] = [e.clientX - r.left, e.clientY - r.top];
    return { x, y, u: x / r.width, v: 1 - y / r.height };
  };

  const pickUp = (el: HTMLCanvasElement, id: number, u: number, v: number) => {
    if (!tray.current?.grab(u, v)) return;
    holding.current = true;
    setHeld(true);
    setUsed(true);
    el.setPointerCapture(id);
    el.style.cursor = "grabbing";
  };

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    const t = tray.current;
    if (!t) return;
    const { x, y, u, v } = at(e);
    last.current = { x, y, t: e.timeStamp };
    if (!t.over(u, v)) {
      t.disturb(u, v, 0.05, 0.025);
      return;
    }
    const [el, id] = [e.currentTarget, e.pointerId];
    if (e.pointerType === "touch") touchHold.current = window.setTimeout(() => pickUp(el, id, u, v), 150);
    else pickUp(el, id, u, v);
  };

  // a fingertip drawn through the liquid leaves a wake along its path, deeper the faster it moves
  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const t = tray.current;
    if (!t) return;
    const { x, y, u, v } = at(e);
    if (holding.current) return t.move(u, v);
    if (e.pointerType === "mouse") e.currentTarget.style.cursor = t.over(u, v) ? "grab" : "";
    const p = last.current;
    if (p && Math.hypot(x - p.x, y - p.y) < 3) return;
    // a finger that moves before the hold is up is stirring, or scrolling
    clearTimeout(touchHold.current);
    last.current = { x, y, t: e.timeStamp };
    if (!p) return;
    const dist = Math.hypot(x - p.x, y - p.y);
    const amp = Math.min(0.04, (0.016 * dist) / Math.max(e.timeStamp - p.t, 8));
    const n = Math.min(6, Math.ceil(dist / 12));
    const w = e.currentTarget.clientWidth;
    const h = e.currentTarget.clientHeight;
    setUsed(true);
    for (let i = 1; i <= n; i++) t.disturb((p.x + ((x - p.x) * i) / n) / w, 1 - (p.y + ((y - p.y) * i) / n) / h, amp, 0.018);
  };

  // keyboard: lift the print by its corner, move it with the arrows, drop it again
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Escape") return letGo();
    const d = KEYS[e.key];
    if (!d || !holding.current) return;
    e.preventDefault();
    tray.current?.nudge(...d);
  };
  const toggle = () => {
    if (holding.current) return letGo();
    tray.current?.grabCorner();
    holding.current = true;
    setHeld(true);
    setUsed(true);
  };

  return (
    <>
      <canvas
        ref={canvas}
        aria-hidden
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={letGo}
        onPointerCancel={letGo}
        onPointerLeave={() => (last.current = null)}
        className={`absolute inset-0 size-full touch-pan-y transition-opacity duration-700 ${on ? "opacity-100" : "opacity-0"}`}
      />
      <p
        aria-hidden
        className={`pointer-events-none absolute bottom-[8.5%] left-1/2 -translate-x-1/2 font-mono text-[10px] whitespace-nowrap uppercase tracking-[0.2em] text-paper/70 transition-opacity duration-700 ${on && !used ? "opacity-100" : "opacity-0"}`}
      >
        Stir the tray or pick up the print
      </p>
      {on && (
        <button
          type="button"
          onClick={toggle}
          onKeyDown={onKeyDown}
          onBlur={letGo}
          className="sr-only font-mono text-[11px] uppercase tracking-[0.18em] focus:not-sr-only focus:absolute focus:top-[10%] focus:left-[8%] focus:bg-developer/85 focus:px-3 focus:py-2 focus:text-paper"
        >
          {held ? "Drop the print (arrows move it)" : "Lift the print"}
        </button>
      )}
    </>
  );
}
