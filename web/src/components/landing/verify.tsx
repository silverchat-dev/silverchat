import Link from "next/link";
import type { ReactNode } from "react";

import { ADDR, EXPLORER, GITHUB_URL, ZERO } from "@/lib/config";
import { short } from "@/lib/format";

const RULES_HASH = process.env.NEXT_PUBLIC_RULES_HASH ?? "";

/** The back of the print: where each claim on this page can be checked, stamped on like a darkroom's notes. */
export function Verify() {
  const address = (a: string) =>
    a === ZERO ? (
      <span className="text-silver">at launch</span>
    ) : (
      <a href={`${EXPLORER}/address/${a}`} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
        {short(a)}
      </a>
    );
  const stamps: [string, ReactNode][] = [
    ["SilverAsk", address(ADDR.ask)],
    ["SilverAlgorithm", address(ADDR.algorithm)],
    ["SilverBuyback", address(ADDR.buyback)],
    ["$ZC", address(ADDR.zc)],
    [
      "Rules hash",
      <Link key="rules" href="/algorithm" className="underline-offset-4 hover:underline">
        {RULES_HASH ? short(RULES_HASH) : "see the rules"}
      </Link>,
    ],
    [
      "Every answer",
      <Link key="api" href="/docs#api" className="underline-offset-4 hover:underline">
        GET /api/polls/{"{id}"}/leaves
      </Link>,
    ],
    [
      "Source",
      <a key="src" href={GITHUB_URL} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
        github.com/silverchat-dev
      </a>,
    ],
    ["Audit", <span key="audit">none yet</span>],
  ];

  return (
    <section aria-labelledby="verify-title" className="border-t border-silver/15">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 md:py-28 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-silver">Verify it</p>
          <h2 id="verify-title" className="text-[clamp(2rem,4.2vw,3.5rem)] leading-[1.05]">
            Don&apos;t trust this page. Check it.
          </h2>
          <p className="max-w-md text-lg leading-relaxed text-paper/75">
            Payments, splits, refunds and every result root live on Ethereum. The contracts are not audited and the tokens
            are volatile. Read the code before you put in more than you can lose.
          </p>
        </div>
        <ul className="grid gap-3 self-start sm:grid-cols-2">
          {stamps.map(([k, v], i) => (
            <li
              key={k}
              className="border border-silver/35 px-4 py-3 font-mono text-xs"
              // stamped by hand: never quite square
              style={{ transform: `rotate(${[-0.6, 0.4, -0.3, 0.7, 0.2, -0.5, 0.5, -0.2][i]}deg)` }}
            >
              <span className="block text-[10px] uppercase tracking-[0.2em] text-silver">{k}</span>
              <span className="mt-1 block break-all text-paper">{v}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
