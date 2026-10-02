"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { ADDR, ZERO } from "@/lib/config";
import { GRADUATION, imageSrc } from "@/lib/realm";
import type { TokenView } from "@/lib/server/realm";

// the life of a launch, left to right, like frames on a strip
const FRAMES = [
  ["Launch", "$5 of $SC", "Open your Realm and launch. The launch buys $5 of $SC and burns it."],
  ["Trade", "1, 2 or 3%", "The creator picks the fee. Every buy and sell against ETH, $ZC, $SC or $STOCKER pays it."],
  ["Burn", "100%", "All of it goes back to the ecosystem: 80% buys and burns $SC, 20% buys and burns $ZC."],
  ["Graduate", "80% bought", "When 80% of the supply has been bought, the token graduates. It stays in its pool."],
];

const money = (n: number | null) => (n === null ? "·" : `$${n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 })}`);

/** SilverRealm on the landing: how a launch lives and burns, and what is trading on the board right now. */
export function Realm() {
  const live = ADDR.realmFactory !== ZERO;
  const board = useQuery({
    queryKey: ["landingRealm"],
    queryFn: async () => ((await (await fetch("/api/realm?sort=trending")).json()).tokens ?? []) as TokenView[],
    enabled: live,
  });
  const top = (board.data ?? []).slice(0, 4);

  return (
    <section aria-labelledby="realm-title" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 md:py-28">
      <div className="space-y-4">
        <h2 id="realm-title" className="max-w-3xl text-[clamp(2rem,4.2vw,3.5rem)] leading-[1.05]">
          Launch what you believe in.
        </h2>
        <p className="max-w-2xl text-lg leading-relaxed text-paper/75">
          Every wallet has a Realm on Silverchat, free to open. From it you launch a token with a name, a picture and a few
          words. SilverRealm keeps nothing.
        </p>
      </div>

      <ol className="mt-12 grid gap-px bg-film p-px sm:grid-cols-2 lg:grid-cols-4">
        {FRAMES.map(([k, big, v], i) => (
          <li key={k} className="develop on-view flex min-h-40 flex-col sm:min-h-56 justify-between gap-6 bg-developer p-5" style={{ "--tau": "1.4s", "--from": `${4 + i * 6}%`, "--to": `${24 + i * 6}%` } as React.CSSProperties}>
            <span className="flex justify-between font-mono text-[11px] uppercase tracking-[0.2em] text-silver">
              <span>{k}</span>
              <span aria-hidden>{i + 1}A</span>
            </span>
            <span className="space-y-3">
              <span className="block text-[clamp(1.75rem,3vw,2.5rem)] leading-none">{big}</span>
              <span className="block text-sm leading-snug text-paper/75">{v}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-6 max-w-3xl text-sm leading-relaxed text-paper/70">
        All 1 billion tokens go into the pool at launch and the liquidity is locked there forever: not the creator, not us,
        nobody can take it out. For the first 20 seconds a buy pays a fee that starts at 99% and falls to the pool&apos;s
        own, so a bot in the launch block pays almost everything.
      </p>

      {top.length > 0 && (
        <div className="mt-14 space-y-4">
          <h3 className="font-mono text-xs uppercase tracking-[0.14em] text-silver">Trending on the board</h3>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {top.map((t) => {
              const src = imageSrc(t.image);
              return (
                <li key={t.token}>
                  <Link href={`/realm/token/${t.token}`} className="flex h-full items-center gap-3 border border-paper/12 p-3 hover:border-paper/40">
                    {src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-14 w-14 shrink-0 bg-film object-cover" />
                    ) : (
                      <span aria-hidden className="h-14 w-14 shrink-0 bg-film" />
                    )}
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="block truncate">{t.name ?? "Name not shown"}</span>
                      <span className="block font-mono text-[11px] text-silver">
                        ${t.symbol ?? "?"} · {money(t.marketCapUsd)}
                      </span>
                      <span className="block h-0.5 w-full bg-paper/10">
                        <span className="block h-full bg-paper" style={{ width: `${Math.min(100, ((t.sold ?? 0) / GRADUATION) * 100)}%` }} />
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>
      )}
      <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
        <Link href="/realm" className="bg-paper px-6 py-3 font-mono text-sm text-developer hover:brightness-105">
          Open the board
        </Link>
        <span className="font-mono text-xs text-silver">Every launch is listed there, sorted like any launchpad.</span>
      </div>
    </section>
  );
}
