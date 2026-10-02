import { MIN_HOLD_USD } from "@/lib/algorithm";
import { SPLIT } from "@/lib/pricing";
import { WORDMARK, WORDMARK_STACKED } from "@/lib/wordmark";

import { Darkroom } from "./darkroom";
import { Negatives } from "./negatives";

const MECHANICS = [
  ["Pay to ask", "Pay $ZC to ask. More ZC reaches more people."],
  ["Answer and earn", `Hold $${MIN_HOLD_USD} of ZC or SC, answer with a free signature, share up to ${Number(SPLIT[0][1]) / 100}%.`],
  ["Predict", "Stake $ZC on YES or NO, sealed until the market closes."],
  ["Launch", "Launch a token from your Realm. Every fee is burned."],
];

export function Hero() {
  return (
    <section className="relative overflow-hidden px-5 pb-12 sm:px-8 lg:pb-8">
      <h1 className="sr-only">Silverchat, the polling network from Snowmoon</h1>
      {/* the wordmark and the tray both grow with the width, so on wide or short screens the hero narrows and centers
          until the tray and its dial fit the first screen (about 0.55px of height per px of width, plus the header) */}
      <div className="mx-auto w-full" style={{ maxWidth: "min(100rem, max(64rem, calc((100svh - 7.5rem) * 1.8)))" }}>
        <div aria-hidden className="@container font-mono leading-[0.98] text-paper">
          <pre className="text-[calc(100cqw/32)] sm:hidden">{WORDMARK_STACKED}</pre>
          <pre className="hidden text-[calc(100cqw/56)] sm:block">{WORDMARK}</pre>
        </div>

        <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-10 lg:mt-4 lg:grid-cols-[minmax(0,26fr)_minmax(0,50fr)_minmax(0,13fr)] lg:grid-rows-[auto_1fr] lg:gap-x-8 lg:gap-y-8 xl:gap-x-12">
          <div className="@container space-y-4 lg:pt-6">
            {/* sized so "Watch the answer develop." (12.8em) always fits one line of the column */}
            <p className="text-[min(2.75rem,calc(100cqw/13))] leading-[1.08] whitespace-nowrap">
              <span className="block">Ask the network.</span>
              <span className="block">Watch the answer develop.</span>
            </p>
            <p className="max-w-sm text-lg leading-relaxed text-paper/80">The network from Snowmoon, <span className="whitespace-nowrap">ch. 27</span>. Ask it, bet on it, launch on it. Now on Ethereum.</p>
          </div>

          <div className="space-y-10 lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <Darkroom />
            {/* on narrower screens the strip lies on its side under the tray */}
            <div className="lg:hidden">
              <Negatives across />
            </div>
          </div>

          <div className="hidden space-y-4 lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:block">
            <Negatives />
            <p className="text-center text-sm leading-snug text-paper/75">
              Every print keeps its negative. Verify it <span className="whitespace-nowrap">on-chain.</span>
            </p>
          </div>

          <dl className="grid gap-px bg-silver/20 sm:grid-cols-2 lg:col-start-1 lg:row-start-2 lg:block lg:max-w-xs lg:divide-y lg:divide-silver/20 lg:self-start lg:border-t lg:border-silver/20 lg:bg-transparent">
            {MECHANICS.map(([k, v]) => (
              <div key={k} className="space-y-1 bg-developer py-4 sm:px-4 lg:bg-transparent lg:px-0 lg:py-3">
                <dt className="font-mono text-[11px] uppercase tracking-[0.2em] text-paper/90">{k}</dt>
                <dd className="text-sm leading-snug text-silver">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
