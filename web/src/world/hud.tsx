"use client";

/**
 * The bar over Meldan: the wordmark home, the walk's stops as a row of marks (the one you are at lit, each with its
 * plain label), and on the right the block, rewards, You and the wallet. On a phone the stops fold into a menu that
 * lists them with their one line, and carries the site's small print.
 */
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { BlockClock } from "@/components/block-clock";
import { Rewards } from "@/components/rewards";
import { YouLink } from "@/components/you";

import { STOPS, stopOf } from "./stops";

function Menu({ onClose, at }: { onClose: () => void; at: string | null }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label="The walk" className="journal fixed inset-0 z-50 overflow-y-auto px-6 py-6 sm:px-10">
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-silver">A day in Meldan</p>
        <button type="button" onClick={onClose} className="font-mono text-xs uppercase tracking-[0.14em] text-silver hover:text-paper" autoFocus>
          Close ✕
        </button>
      </div>
      <nav aria-label="Stops" className="mt-8">
        <ol className="space-y-6">
          {STOPS.map((s, i) => (
            <li key={s.id} className="grid grid-cols-[2.2rem_minmax(0,1fr)] gap-x-3">
              <span className="pt-1 font-mono text-xs text-silver">{String(i + 1).padStart(2, "0")}</span>
              <div className="space-y-1">
                {s.live ? (
                  <Link href={i === 0 ? "/" : s.routes[0]} scroll={false} onClick={onClose} aria-current={at === s.id ? "page" : undefined} className="text-2xl leading-tight hover:underline aria-[current=page]:underline">
                    {s.label}
                  </Link>
                ) : (
                  <span className="text-2xl leading-tight text-silver">{s.label}</span>
                )}
                <p className="max-w-md text-sm leading-snug text-silver">
                  {s.name} · {s.line}
                </p>
                {s.also && s.live && (
                  <Link href={s.also.route} scroll={false} onClick={onClose} className="font-mono text-xs underline-offset-4 hover:underline">
                    {s.also.label} →
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ol>
      </nav>
      <p className="mt-12 max-w-xl font-mono text-[11px] leading-relaxed text-silver">
        Silverchat comes from Snowmoon, a novel by Vitalik Buterin. We are not affiliated with him. The contracts are not
        audited and the tokens are volatile. Don&apos;t trust this page. Verify it.
      </p>
    </div>
  );
}

export function Hud() {
  const path = usePathname();
  const stop = stopOf(path);
  const at = stop?.id ?? null;
  const [menu, setMenu] = useState(false);
  return (
    <header className="flex items-center gap-4 px-4 py-3 sm:gap-6 sm:px-6">
      <Link href="/" scroll={false} aria-label="silverchat, the walk" className="shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/wordmark.png" alt="silverchat" width={720} height={139} className="h-[18px] w-auto" />
      </Link>
      <nav aria-label="Stops" className="hidden flex-1 items-center gap-1 lg:flex">
        {STOPS.slice(1).map((s) => (
          <Link
            key={s.id}
            href={s.live ? s.routes[0] : "/"}
            scroll={false}
            aria-current={at === s.id ? "page" : undefined}
            className="group relative px-2 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-paper/70 hover:text-paper aria-[current=page]:text-paper"
          >
            <span aria-hidden className="mr-1.5 inline-block size-1.5 rounded-full bg-paper/40 align-middle group-aria-[current=page]:bg-tap" />
            {s.name}
          </Link>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-x-4">
        <span className="hidden xl:block">
          <BlockClock />
        </span>
        <Rewards />
        <span className="hidden sm:block">
          <YouLink className="font-mono text-[11px] uppercase tracking-[0.12em] text-paper/75 hover:text-paper" />
        </span>
        <ConnectButton chainStatus="none" showBalance={false} accountStatus={{ smallScreen: "avatar", largeScreen: "full" }} />
        <button type="button" onClick={() => setMenu(true)} aria-haspopup="dialog" className="font-mono text-[11px] uppercase tracking-[0.14em] text-paper/80 hover:text-paper lg:hidden">
          Menu
        </button>
      </div>
      {menu && <Menu onClose={() => setMenu(false)} at={at} />}
    </header>
  );
}
