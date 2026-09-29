"use client";

import Link from "next/link";
import { useReadContract } from "wagmi";

import { askAbi } from "@/lib/abi";
import { ADDR, ZERO } from "@/lib/config";
import { people, tokens } from "@/lib/format";
import { BREADTHS, costOf } from "@/lib/pricing";

/** The exposure dial: how many people a question reaches, what that costs today, and the way to ask. */
export function Exposure({ step, onStep }: { step: number; onStep: (step: number) => void }) {
  const price = useReadContract({ address: ADDR.ask, abi: askAbi, functionName: "pricePerPerson", query: { enabled: ADDR.ask !== ZERO } });
  const breadth = BREADTHS[step];
  const cost = price.data ? costOf(price.data, breadth, 0) : null;

  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-5 gap-y-2 font-mono text-xs">
      <label htmlFor="exposure" className="uppercase tracking-[0.18em] text-paper/85">
        Exposure
      </label>
      <div className="relative">
        <input
          id="exposure"
          type="range"
          min={0}
          max={BREADTHS.length - 1}
          step={1}
          value={step}
          onChange={(e) => onStep(Number(e.target.value))}
          aria-valuetext={`${people(breadth)} people`}
          className="exposure w-full"
        />
        <div aria-hidden className="mt-1 flex justify-between text-[10px] text-silver">
          {BREADTHS.map((b) => (
            <span key={b} className={b === breadth ? "text-paper" : ""}>
              {people(b)}
            </span>
          ))}
        </div>
      </div>
      <p className="text-right text-base tabular-nums text-paper" aria-live="polite">
        {cost !== null ? `${tokens(cost)} ZC` : "pricing opens at launch"}
      </p>
      <Link href={`/ask?breadth=${breadth}`} className="col-span-3 justify-self-end text-paper/85 underline-offset-4 hover:text-paper hover:underline">
        Ask {people(breadth)} people →
      </Link>
    </div>
  );
}
