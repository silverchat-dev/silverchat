"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { ADDR, chapter, ZERO } from "@/lib/config";
import { span, tokens } from "@/lib/format";
import type { serializeMarket } from "@/lib/server/predict";

type Market = ReturnType<typeof serializeMarket>;

const STEPS = [
  ["Stake, sealed", "Put $ZC on YES or NO. Your side stays sealed until the market closes, so nobody can follow the crowd."],
  ["Settled by others", "Prices settle from Chainlink. Every other question goes to Reality.eth, with Kleros as the court when an answer is disputed."],
  ["Winners share the pool", "2% comes off the top: 1% is burned, 1% goes to the treasury. Opening a market locks $SC, returned when it settles unless the question is ruled invalid."],
];

/** Predict, the other half of chapter 27: what it is, and the markets taking stakes right now. */
export function Predict() {
  const live = ADDR.predict !== ZERO;
  const markets = useQuery({
    queryKey: ["landingMarkets"],
    // the clock is read with the list, so "closes in" counts from when the markets were fetched
    queryFn: async () => ({ list: ((await (await fetch("/api/markets")).json()).markets ?? []) as Market[], now: Math.floor(Date.now() / 1000) }),
    enabled: live,
  });
  const now = markets.data?.now ?? 0;
  const open = (markets.data?.list ?? [])
    .filter((m) => !m.hidden && m.title && m.status === "open" && m.closesAt > now)
    .sort((a, b) => (BigInt(b.pool) > BigInt(a.pool) ? 1 : BigInt(b.pool) < BigInt(a.pool) ? -1 : 0))
    .slice(0, 3);

  return (
    <section aria-labelledby="predict-title" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 md:py-28">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-4">
          <h2 id="predict-title" className="text-[clamp(2rem,4.2vw,3.5rem)] leading-[1.05]">
            Bet on what comes next.
          </h2>
          <p className="max-w-md text-lg leading-relaxed text-paper/75">
            Chapter 27 has Silverchat Predict too: people, or bots, betting on future events. Here it runs on Ethereum and
            you stake $ZC.
          </p>
          <p className="flex flex-wrap gap-x-5 gap-y-2 pt-2 font-mono text-xs">
            <Link href="/predict" className="text-paper underline-offset-4 hover:underline">
              All markets →
            </Link>
            <Link href="/scores" className="text-paper underline-offset-4 hover:underline">
              Forecasters →
            </Link>
            <a href={chapter(27)} target="_blank" rel="noreferrer" className="text-silver underline-offset-4 hover:text-paper hover:underline">
              Read chapter 27 →
            </a>
          </p>
        </div>
        <dl className="divide-y divide-silver/20 border-y border-silver/20">
          {STEPS.map(([k, v], i) => (
            <div key={k} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 py-5">
              <span aria-hidden className="font-mono text-xs text-silver">
                0{i + 1}
              </span>
              <div className="space-y-1">
                <dt className="font-mono text-[11px] uppercase tracking-[0.2em] text-paper/90">{k}</dt>
                <dd className="text-lg leading-snug text-paper/80">{v}</dd>
              </div>
            </div>
          ))}
        </dl>
      </div>

      {open.length > 0 && (
        <div className="mt-14 space-y-4">
          <h3 className="font-mono text-xs uppercase tracking-[0.14em] text-silver">Taking stakes now</h3>
          <ol className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))]">
            {open.map((m) => (
              <li key={m.id} className="film">
                <span aria-hidden className="absolute left-3 top-[14px] font-mono text-[9px] leading-none tracking-[0.2em] text-paper/40">
                  PREDICT {m.id} ▸ {m.kind === "price" ? m.feed : "EVENT"}
                </span>
                <Link href={`/predict/${m.id}`} className="flex h-full min-h-48 flex-col justify-between gap-6 bg-paper p-5 text-developer hover:brightness-[1.04]">
                  <span className="line-clamp-4 text-xl leading-snug wrap-anywhere">{m.title}</span>
                  <span className="flex flex-wrap justify-between gap-x-3 gap-y-1 font-mono text-xs whitespace-nowrap text-developer/70">
                    <span>{tokens(m.pool, 0)} ZC</span>
                    <span>
                      {m.stakes} {m.stakes === 1 ? "stake" : "stakes"}
                    </span>
                    <span>closes in {span(m.closesAt - now)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
