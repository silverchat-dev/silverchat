"use client";

import { useQuery } from "@tanstack/react-query";

import { tokens } from "@/lib/format";

type Stats = { burned: string; predictBurned: string; realmScBurned: string; realmZcBurned: string };

/** What every product has burned so far, $ZC and $SC kept apart: two tokens, two counts. */
export function Burns() {
  const s = useQuery({ queryKey: ["landingStats"], queryFn: async () => (await (await fetch("/api/stats")).json()) as Stats, refetchInterval: 60_000 }).data;
  const zc = s ? BigInt(s.burned) + BigInt(s.predictBurned ?? "0") + BigInt(s.realmZcBurned ?? "0") : null;
  const parts: [string, [string, string | undefined][]][] = [
    ["$ZC", [["Polls", s?.burned], ["Predict", s?.predictBurned], ["SilverRealm", s?.realmZcBurned]]],
    ["$SC", [["SilverRealm launches and fees", s?.realmScBurned]]],
  ];

  return (
    <section aria-labelledby="burns-title" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 md:py-28">
      <div className="space-y-4">
        <h2 id="burns-title" className="max-w-3xl text-[clamp(2rem,4.2vw,3.5rem)] leading-[1.05]">
          Out of circulation, for good.
        </h2>
        <p className="max-w-xl text-lg leading-relaxed text-paper/75">
          Polls, markets and launches all send a share to the burn address. Nobody holds the key to it. These are the counts
          so far, read from our index of the chain.
        </p>
      </div>
      <dl className="mt-12 grid gap-px bg-silver/20 md:grid-cols-2">
        {parts.map(([coin, rows]) => (
          <div key={coin} className="space-y-6 bg-developer p-6 md:p-8">
            <dt className="font-mono text-[11px] uppercase tracking-[0.2em] text-silver">{coin} burned</dt>
            <dd className="space-y-5">
              <span className="block text-[clamp(2.5rem,6vw,5rem)] leading-none tabular-nums">
                {s ? tokens(coin === "$ZC" ? zc! : s.realmScBurned ?? "0", 0) : " "}
              </span>
              <span className="block divide-y divide-silver/15 border-t border-silver/15 font-mono text-xs">
                {rows.map(([k, v]) => (
                  <span key={k} className="flex justify-between py-2">
                    <span className="text-silver">{k}</span>
                    <span>{v === undefined ? "·" : tokens(v, 0)}</span>
                  </span>
                ))}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
