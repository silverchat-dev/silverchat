"use client";

/**
 * The site inside Meldan. Behind everything: the stop's still image, and over it the live world when this device can
 * draw it (never a parent of the page, so a failure of the world never touches a payment). In front: the header, and
 * either the walk (at "/") or the page of the stop you are at, in a panel beside the world. Scroll belongs to one thing
 * at a time: the walk at "/", the panel everywhere else.
 */
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Component, useEffect, useState, type ReactNode } from "react";

import { Footer } from "@/components/footer";

import { Hud } from "./hud";
import { useLive } from "./live";
import { tOfStop } from "./rail";
import { world, useWorld } from "./state";
import { STOPS, stopIndex, stopOf, type Stop } from "./stops";

const World = dynamic(() => import("./world"), { ssr: false });

class Guard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    world.set({ failed: true });
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** The still of a stop: what slow devices see, what shows while the world loads, and what stays if it fails. */
function Still({ stop }: { stop: Stop }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/world/stills/${stop.id}.webp`}
      alt=""
      aria-hidden
      className="absolute inset-0 h-full w-full object-cover"
      // a missing still leaves the dark ground, not a broken picture
      onError={(e) => void (e.currentTarget.style.visibility = "hidden")}
      onLoad={(e) => void (e.currentTarget.style.visibility = "visible")}
    />
  );
}

function Backdrop({ stop }: { stop: Stop }) {
  const live = useLive();
  const tier = useWorld((s) => s.tier);
  const failed = useWorld((s) => s.failed);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // the tier is decided in the browser only: on the server and in the first paint, the still shows
    void import("./world").then(({ startTier }) => {
      world.set({ tier: startTier() });
      setReady(true);
    });
  }, []);
  return (
    <div className="fixed inset-0 z-0 bg-developer" aria-hidden>
      <Still stop={stop} />
      {ready && tier > 0 && !failed && (
        <Guard>
          <div className="absolute inset-0">
            <World live={live} />
          </div>
        </Guard>
      )}
      {/* the bottom of the screen darkens a little, so text over the world stays readable */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/45 to-transparent" />
    </div>
  );
}

/** A stop's page, in a panel beside the world: the right half on a desk, a sheet over the lower screen on a phone. */
function Panel({ stop, children }: { stop: Stop; children: ReactNode }) {
  const next = STOPS.slice(stopIndex(stop.id) + 1).find((s) => s.live);
  // the panel stays open from page to page: each new page starts at its top, or at the part a link names (/docs#api)
  const pathname = usePathname();
  useEffect(() => {
    const part = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (part) part.scrollIntoView();
    else document.getElementById("panel")?.scrollTo({ top: 0 });
  }, [pathname]);
  return (
    <div className="journal fixed inset-x-0 bottom-0 z-10 flex h-[80dvh] flex-col rounded-t-2xl shadow-[0_-20px_60px_rgba(0,0,0,0.35)] md:top-[4.5rem] md:right-5 md:bottom-5 md:left-auto md:h-auto md:w-[min(720px,50vw)] md:rounded-2xl md:shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
      <nav aria-label="The walk" className="flex items-center justify-between gap-4 border-b border-silver/25 px-5 pt-4 pb-3 font-mono text-xs tracking-[0.06em] text-silver sm:px-8">
        <Link href={`/#${stop.id}`} scroll={false} className="shrink-0 whitespace-nowrap py-1 hover:text-paper">
          ← The walk
        </Link>
        {next && (
          <Link href={next.routes[0]} scroll={false} className="min-w-0 truncate py-1 hover:text-paper">
            Next<span className="hidden sm:inline">: {next.label}</span> →
          </Link>
        )}
      </nav>
      <div className="flex-1 overflow-y-auto overscroll-contain" id="panel">
        {children}
        <Footer />
      </div>
    </div>
  );
}

/** The music, on or off: the first thing after the skip link, remembered for the visit. */
function Sound() {
  const sound = useWorld((s) => s.sound);
  const entered = useWorld((s) => s.entered);
  if (!entered) return null;
  const toggle = async () => {
    const audio = await import("./audio");
    const on = !sound;
    world.set({ sound: on });
    if (on) await audio.playMusic().catch(() => world.set({ sound: false }));
    else audio.setVolume(false);
  };
  return (
    <button type="button" onClick={toggle} aria-pressed={sound} className="fixed right-4 bottom-4 z-30 border border-paper/30 bg-black/40 px-3 py-2 font-mono text-xs text-paper/85 hover:border-paper">
      {sound ? "Sound on" : "Sound off"}
    </button>
  );
}

export function WorldShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const stop = stopOf(pathname);
  const lab = pathname.startsWith("/world-lab");

  // a stop's route parks the camera there; the walk (at "/") moves it with the scroll instead
  useEffect(() => {
    if (stop) world.set({ target: tOfStop(stopIndex(stop.id)), jump: true, parked: true });
    else world.set({ parked: false });
  }, [stop]);

  // a phone's sheet covers most of the world: draw nothing behind it
  useEffect(() => {
    const mq = matchMedia("(max-width: 767px)");
    const sync = () => world.set({ covered: !!stop && mq.matches });
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [stop]);

  if (lab) return <>{children}</>;
  return (
    <>
      <a href="#panel" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-paper focus:px-3 focus:py-2 focus:text-developer">
        Skip to content
      </a>
      <Sound />
      <Backdrop stop={stop ?? STOPS[0]} />
      <div className="fixed inset-x-0 top-0 z-20 bg-gradient-to-b from-black/50 to-transparent">
        <Hud />
      </div>
      {stop ? <Panel stop={stop}>{children}</Panel> : <div className="relative z-10">{children}</div>}
    </>
  );
}
