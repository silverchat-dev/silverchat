"use client";

import type { CSSProperties } from "react";
import { useReadContract } from "wagmi";

import { askAbi } from "@/lib/abi";
import { ADDR, ZERO } from "@/lib/config";
import { tokens } from "@/lib/format";
import { costOf, SPLIT } from "@/lib/pricing";

// what each share does, in the order of SPLIT; darker bands keep more
const BANDS = [
  { name: "Answerers", note: "The most answerers can earn: an equal share per paid answer. The rest goes back to the asker.", ink: 0.92 },
  { name: "Treasury", note: "Kept by the treasury, a Safe on Ethereum.", ink: 0.68 },
  { name: "SC buyback", note: "Buys $SC on Stockereum and burns it, once SC is live.", ink: 0.44 },
  { name: "Burned", note: "Burned as ZC. Gone from the supply.", ink: 0.24 },
];

const at = (i: number) => ({ "--tau": "1.4s", "--from": `${4 + i * 7}%`, "--to": `${26 + i * 7}%` }) as CSSProperties;

/** Where a payment goes, as a darkroom test strip: one band per share, exposed left to right. */
export function Split() {
  const price = useReadContract({ address: ADDR.ask, abi: askAbi, functionName: "pricePerPerson", query: { enabled: ADDR.ask !== ZERO } });
  const cost = price.data ? costOf(price.data, 10_000, 0) : null;
  // the same arithmetic as the contract: the burn takes whatever the other three leave
  const parts = cost === null ? null : SPLIT.slice(0, 3).map(([, bps]) => (cost * bps) / 10_000n);
  const example = parts && cost !== null ? [...parts, cost - parts.reduce((a, b) => a + b, 0n)] : null;

  return (
    <section aria-labelledby="split-title" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 md:py-28">
      <div className="space-y-4">
        <h2 id="split-title" className="max-w-2xl text-[clamp(2rem,4.2vw,3.5rem)] leading-[1.05]">
          ZC is spent. SC is owned.
        </h2>
        <p className="max-w-xl text-lg leading-relaxed text-paper/75">
          Every poll is paid in ZC and split the moment its result is fixed. One fifth is burned as ZC. Another fifth buys
          SC, and that SC is burned.
        </p>
      </div>

      <ol
        className="mt-12 grid bg-[url(/plates/paper.webp)] bg-cover p-2 md:p-3"
        style={{ gridTemplateColumns: SPLIT.map(([, bps]) => `minmax(0, ${Number(bps)}fr)`).join(" ") }}
      >
        {SPLIT.map(([, bps], i) => (
          <li
            key={BANDS[i].name}
            className={`develop on-view flex min-h-56 flex-col justify-end p-3 md:min-h-72 md:p-5 ${BANDS[i].ink > 0.5 ? "text-paper" : "text-developer"}`}
            style={{ ...at(i), backgroundColor: `rgb(20 19 18 / ${BANDS[i].ink})` }}
          >
            <span className="space-y-2">
              <span className="block text-[clamp(1.5rem,5vw,4.5rem)] leading-none tabular-nums">{Number(bps) / 100}%</span>
              <span className="hidden font-mono text-[11px] uppercase tracking-[0.16em] sm:block">{BANDS[i].name}</span>
              <span className="hidden min-h-[4.2em] max-w-[16rem] text-sm leading-snug opacity-80 sm:block">{BANDS[i].note}</span>
            </span>
          </li>
        ))}
      </ol>

      {/* on phones the notes move under the strip */}
      <dl className="mt-6 grid gap-4 sm:hidden">
        {BANDS.map((b, i) => (
          <div key={b.name} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3">
            <dt className="font-mono text-sm text-paper">{Number(SPLIT[i][1]) / 100}%</dt>
            <dd className="text-sm leading-snug text-paper/75">
              <span className="block font-mono text-[11px] uppercase tracking-[0.16em] text-silver">{b.name}</span>
              {b.note}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-8 max-w-3xl font-mono text-xs leading-relaxed text-silver" aria-live="polite">
        {example && cost !== null ? (
          <>
            A poll asking 10K people costs <span className="text-paper">{tokens(cost)} ZC</span> today:{" "}
            {example.map((v, i) => `${tokens(v)} ${["to answerers", "to the treasury", "for SC", "burned"][i]}`).join(" · ")}.
          </>
        ) : ADDR.ask === ZERO ? (
          "Pricing opens at launch. A poll costs a fixed amount per person asked, paid in ZC at the live price."
        ) : (
          "\u00a0"
        )}
      </p>
    </section>
  );
}
