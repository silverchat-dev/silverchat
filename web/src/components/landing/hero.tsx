import Image from "next/image";

import { MIN_HOLD_USD } from "@/lib/algorithm";
import { WORDMARK } from "@/lib/wordmark";

import { Darkroom } from "./darkroom";
import { Negatives } from "./negatives";

const MECHANICS = [
  ["Pay to ask", "You pay $ZC to ask. More ZC reaches more people."],
  ["Answer and earn", `Holders of $${MIN_HOLD_USD} of ZC or SC answer with a free signature and share 35% of what you paid.`],
  ["Fixed on-chain", "The result goes on Ethereum. After that nobody can change it, not even us."],
];

export function Hero() {
  return (
    <section className="relative overflow-hidden px-5 pb-12 sm:px-8 lg:pb-8">
      <h1 className="sr-only">Silverchat, the polling network from Snowmoon</h1>
      <div className="@container hidden sm:block">
        <pre aria-hidden className="font-mono text-[calc(100cqw/56)] leading-[0.98] text-paper">
          {WORDMARK}
        </pre>
      </div>
      <Image src="/brand/wordmark.png" alt="" width={720} height={139} priority className="h-auto w-full sm:hidden" />

      <div className="mt-8 grid gap-10 lg:mt-4 lg:grid-cols-[minmax(0,26fr)_minmax(0,50fr)_minmax(0,13fr)] lg:gap-8 xl:gap-12">
        <div className="space-y-8 lg:pt-6">
          <div className="space-y-4">
            <p className="text-[clamp(2rem,3vw,2.75rem)] leading-[1.08] text-balance">
              Ask the network.
              <br />
              Watch the answer develop.
            </p>
            <p className="max-w-sm text-lg leading-relaxed text-paper/80">The polling network from Snowmoon, ch. 27. Now on Ethereum.</p>
          </div>
          <dl className="hidden max-w-xs divide-y divide-silver/20 border-t border-silver/20 lg:block">
            {MECHANICS.map(([k, v]) => (
              <div key={k} className="space-y-1 py-4">
                <dt className="font-mono text-[11px] uppercase tracking-[0.2em] text-paper/90">{k}</dt>
                <dd className="font-mono text-xs leading-relaxed text-silver">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <Darkroom />

        <div className="hidden space-y-4 lg:block">
          <Negatives />
          <p className="text-center text-sm leading-snug text-paper/75">Every print keeps its negative. Verify it on-chain.</p>
        </div>

        <dl className="grid gap-px bg-silver/20 sm:grid-cols-3 lg:hidden">
          {MECHANICS.map(([k, v]) => (
            <div key={k} className="space-y-1 bg-developer py-4 sm:px-4">
              <dt className="font-mono text-[11px] uppercase tracking-[0.2em] text-paper/90">{k}</dt>
              <dd className="font-mono text-xs leading-relaxed text-silver">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
