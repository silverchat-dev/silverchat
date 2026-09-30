import Link from "next/link";
import type { ReactNode } from "react";

import { ADDR, EXPLORER, GITHUB_URL, ZERO } from "@/lib/config";
import { short } from "@/lib/format";

const RULES_HASH = process.env.NEXT_PUBLIC_RULES_HASH ?? "";

/** The back of the print: where each claim on this page can be checked, stamped on like a darkroom's notes. */
export function Verify() {
  const address = (a: string) =>
    a === ZERO ? (
      <span className="text-developer/55">at launch</span>
    ) : (
      <a href={`${EXPLORER}/address/${a}`} target="_blank" rel="noreferrer">
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
      <Link key="rules" href="/algorithm" >
        {RULES_HASH ? short(RULES_HASH) : "see the rules"}
      </Link>,
    ],
    [
      "Every answer",
      <Link key="api" href="/docs#api" >
        GET /api/polls/{"{id}"}/leaves
      </Link>,
    ],
    [
      "Source",
      <a key="src" href={GITHUB_URL} target="_blank" rel="noreferrer" >
        github.com/silverchat-dev
      </a>,
    ],
    ["Audit", <span key="audit">none yet</span>],
  ];

  return (
    <section aria-labelledby="verify-title">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 md:py-28 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
        <div className="space-y-4">
          <h2 id="verify-title" className="text-[clamp(2rem,4.2vw,3.5rem)] leading-[1.05]">
            Don&apos;t trust this page. Check it.
          </h2>
          <p className="max-w-md text-lg leading-relaxed text-paper/75">
            Payments, splits, refunds and every result root live on Ethereum. The contracts are not audited and the tokens
            are volatile. Read the code before you put in more than you can lose.
          </p>
        </div>
        {/* the back of the print, where a darkroom writes down what it used */}
        <dl className="bg-[url(/plates/paper.webp)] bg-cover px-6 py-7 font-mono text-[13px] text-developer sm:px-9 sm:py-9">
          {stamps.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[9.5rem_minmax(0,1fr)] gap-4 border-b border-developer/15 py-2.5 last:border-0 max-sm:grid-cols-1 max-sm:gap-0.5">
              <dt className="text-developer/60">{k}</dt>
              <dd className="break-all text-developer [&_a]:underline [&_a]:decoration-developer/30 [&_a]:underline-offset-4 [&_a:hover]:decoration-developer">
                {v}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
