"use client";

/**
 * The walk at "/": one section per stop, the length of a screen each. Scrolling the page moves the camera along the
 * walk (it never changes the route); the hash follows the stop you are at, so reload and Back return there. Each
 * section says plainly what you can do at that stop and opens it.
 */
import Link from "next/link";
import { useEffect } from "react";

import { Footer } from "@/components/footer";

import { tOfStop } from "./rail";
import { world } from "./state";
import { STOPS, type Stop } from "./stops";

function Card({ stop, first }: { stop: Stop; first: boolean }) {
  const Title = first ? "h1" : "h2";
  return (
    <section id={stop.id} className="relative flex h-[100svh] snap-start items-end px-5 pb-[12svh] sm:px-10">
      {/* a soft shade under the words, so they read over a bright sky or grass */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_75%_55%_at_0%_100%,rgba(10,12,8,0.62),rgba(10,12,8,0.25)_55%,transparent_80%)]" />
      <div className="relative max-w-xl space-y-4">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-paper/75">{first ? "silverchat · Snowmoon, ch. 27" : stop.name}</p>
        <Title className="text-[clamp(2.4rem,6vw,4.6rem)] leading-[1.02] text-paper drop-shadow-[0_2px_18px_rgba(0,0,0,0.45)]">
          {first ? "Ask the network." : stop.label}
        </Title>
        <p className="max-w-lg text-lg leading-snug text-paper/90 drop-shadow-[0_1px_10px_rgba(0,0,0,0.5)]">{stop.line}</p>
        {stop.live ? (
          <div className="flex flex-wrap gap-3 pt-2">
            <Link href={stop.routes[0]} scroll={false} className="rounded-full bg-tap px-5 py-3 font-mono text-sm text-black transition-[filter] hover:brightness-110">
              {first ? "Try it without a wallet" : `Open ${stop.name}`}
            </Link>
            {stop.also && (
              <Link href={stop.also.route} scroll={false} className="rounded-full border border-tap/80 px-5 py-3 font-mono text-sm text-paper transition-colors hover:bg-tap/15">
                {stop.also.label}
              </Link>
            )}
            {first && (
              <a href="#pulse" className="px-2 py-3 font-mono text-sm text-paper/80 underline-offset-4 hover:underline">
                Walk in ↓
              </a>
            )}
          </div>
        ) : (
          <p className="font-mono text-sm text-paper/70">Not open yet.</p>
        )}
      </div>
    </section>
  );
}

export function Walk() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("walk");
    history.scrollRestoration = "manual";
    // start where the hash says (a reload, Back, or Close from a stop)
    const at = STOPS.findIndex((s) => `#${s.id}` === location.hash);
    if (at > 0) document.getElementById(STOPS[at].id)?.scrollIntoView({ behavior: "instant" });
    let last = -1;
    const onScroll = () => {
      const max = root.scrollHeight - innerHeight - (document.getElementById("walk-end")?.offsetHeight ?? 0);
      const t = Math.min(1, Math.max(0, scrollY / Math.max(1, max)));
      world.set({ target: t, jump: false });
      const near = Math.round(t * (STOPS.length - 1));
      if (near !== last) {
        last = near;
        history.replaceState(history.state, "", near === 0 ? location.pathname : `#${STOPS[near].id}`);
      }
    };
    world.set({ target: at > 0 ? tOfStop(at) : 0, jump: at > 0 });
    onScroll();
    addEventListener("scroll", onScroll, { passive: true });
    return () => {
      removeEventListener("scroll", onScroll);
      root.classList.remove("walk");
    };
  }, []);
  return (
    <div id="walk">
      {STOPS.map((s, i) => (
        <Card key={s.id} stop={s} first={i === 0} />
      ))}
      <div id="walk-end" className="bg-developer">
        <Footer />
      </div>
    </div>
  );
}
