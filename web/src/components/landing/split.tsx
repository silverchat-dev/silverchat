"use client";

import type { CSSProperties } from "react";
import { useReadContract } from "wagmi";

import { askAbi } from "@/lib/abi";
import { ADDR, ZERO } from "@/lib/config";
import { tokens } from "@/lib/format";
import { costOf, SPLIT } from "@/lib/pricing";

// what each share does, in the order of SPLIT; darker bands keep more
const BANDS = [
  { name: "Answerers", note: "An equal share for every paid answer. What nobody earned goes back to the asker.", ink: 0.92 },
  { name: "Treasury", note: "Kept by the treasury, a Safe on Ethereum.", ink: 0.55 },
  { name: "Burned", note: "Burned as ZC. Gone from the supply for good.", ink: 0.26 },
];

const at = (i: number) => ({ "--tau": "1.4s", "--from": `${4 + i * 7}%`, "--to": `${26 + i * 7}%` }) as CSSProperties;
const pct = (bps: bigint) => `${Number(bps) / 100}%`;

/** Where a payment goes, as a darkroom test strip: one band per share, exposed left to right. */
export function Split() {
  const price = useReadContract({ address: ADDR.ask, abi: askAbi, functionName: "pricePerPerson", query: { enabled: ADDR.ask !== ZERO } });
  const cost = price.data ? costOf(price.data, 100, 0) : null;
  // the same arithmetic as the contract: the burn takes whatever the others leave
  const parts = cost === null ? null : SPLIT.slice(0, -1).map(([, bps]) => (cost * bps) / 10_000n);
  const example = parts && cost !== null ? [...parts, cost - parts.reduce((a, b) => a + b, 0n)] : null;

  return (
    <section aria-labelledby="split-title" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 md:py-28">
      <div className="space-y-4">
        <h2 id="split-title" className="max-w-3xl text-[clamp(2rem,4.2vw,3.5rem)] leading-[1.05]">
          Most of it goes to the people who answer.
        </h2>
        <p className="max-w-xl text-lg leading-relaxed text-paper/75">
          Every poll is paid in ZC and split the moment its result is fixed. Nothing goes anywhere before that, and if the
          result is never fixed, the asker takes it all back.
        </p>
      </div>

      <ol
        className="mt-12 grid bg-[url(/plates/paper.webp)] bg-cover p-2 md:p-3"
        // a narrow share still gets room for its number
        style={{ gridTemplateColumns: SPLIT.map(([, bps]) => `minmax(${bps < 1500n ? "4rem" : "0"}, ${Number(bps)}fr)`).join(" ") }}
      >
        {SPLIT.map(([, bps], i) => (
          <li
            key={BANDS[i].name}
            className={`develop on-view @container flex min-h-44 flex-col justify-end md:min-h-64 ${bps < 1500n ? "p-2 md:p-3" : "p-3 md:p-5"} ${BANDS[i].ink > 0.5 ? "text-paper" : "text-developer"}`}
            style={{ ...at(i), backgroundColor: `rgb(20 19 18 / ${BANDS[i].ink})` }}
          >
            <span className="block text-[clamp(1.25rem,min(5vw,34cqw),4.5rem)] leading-none tabular-nums">{pct(bps)}</span>
            {bps >= 1500n && <span className="mt-2 block font-mono text-[11px] uppercase tracking-[0.16em]">{BANDS[i].name}</span>}
          </li>
        ))}
      </ol>

      <dl className="mt-8 grid gap-6 sm:grid-cols-3">
        {BANDS.map((b, i) => (
          <div key={b.name} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3">
            <dt className="font-mono text-sm text-paper">{pct(SPLIT[i][1])}</dt>
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
            A poll asking 100 people costs <span className="text-paper">{tokens(cost)} ZC</span> today:{" "}
            {example.map((v, i) => `${tokens(v)} ${["to answerers", "to the treasury", "burned"][i]}`).join(" · ")}.
          </>
        ) : ADDR.ask === ZERO ? (
          "Pricing opens at launch: a fixed dollar amount for each person asked, paid in ZC at the live price."
        ) : (
          " "
        )}
      </p>
    </section>
  );
}
