import type { Metadata } from "next";
import Link from "next/link";

import { ANSWERERS_BPS, FEED, GROUP_MIN, MIN_HOLD_USD } from "@/lib/algorithm";
import { algorithmAbi } from "@/lib/abi";
import { ADDR, chapter, EXPLORER, GITHUB_URL, ZERO } from "@/lib/config";
import { short, span } from "@/lib/format";
import { publicClient } from "@/lib/server/chain";
import { chainTime } from "@/lib/server/eligibility";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "The rules · silverchat" };

const DELAY = 20 * 86_400;
const RULES_HASH = process.env.NEXT_PUBLIC_RULES_HASH ?? "";
const SOURCE = `${GITHUB_URL}/blob/${process.env.NEXT_PUBLIC_COMMIT ?? "main"}/web/src/lib/algorithm.ts`;

async function onChain() {
  if (ADDR.algorithm === ZERO) return null;
  const [current, [pending, activeAt]] = await Promise.all([
    publicClient.readContract({ address: ADDR.algorithm, abi: algorithmAbi, functionName: "current" }),
    publicClient.readContract({ address: ADDR.algorithm, abi: algorithmAbi, functionName: "pending" }),
  ]);
  return { current, pending: activeAt ? { hash: pending, activeAt: Number(activeAt) } : null };
}

export default async function AlgorithmPage() {
  const [chain, now] = await Promise.all([onChain().catch(() => undefined), chainTime().catch(() => 0)]);
  const matches = chain?.current.toLowerCase() === RULES_HASH.toLowerCase();

  return (
    <section className="mx-auto max-w-4xl space-y-14 px-5 py-10 sm:px-8 md:py-14">
      <header className="space-y-5">
        <h1 className="text-5xl leading-tight">The rules</h1>
        <p className="max-w-2xl text-lg leading-relaxed text-paper/80">
          In Snowmoon, Silverchat could not quietly change how it ranks and counts. A new algorithm hash{" "}
          <a href={chapter(27)} target="_blank" rel="noreferrer" className="underline underline-offset-4">
            &quot;would come with a twenty-day delay&quot;
          </a>
          . Here the rules are one file, its hash sits on Ethereum, and a new version counts only 20 days after it is
          published.
        </p>
      </header>

      <div className="grid gap-px bg-silver/20 sm:grid-cols-2">
        <Hash label="This site runs" value={RULES_HASH} note="hash of the rules file this build was made from" />
        <Hash
          label="On Ethereum"
          value={chain === null ? "not deployed yet" : chain === undefined ? "cannot read it right now" : chain.current}
          note={
            chain
              ? matches
                ? "this build was made from the published file"
                : "different: this build does not run the published rules"
              : "SilverAlgorithm.current()"
          }
          href={ADDR.algorithm !== ZERO ? `${EXPLORER}/address/${ADDR.algorithm}#readContract` : undefined}
        />
      </div>

      {chain?.pending && (
        <div className="space-y-3 border border-silver/30 p-6">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-silver">A change is waiting</p>
          <p className="text-2xl">
            {short(chain.pending.hash)} counts in {span(chain.pending.activeAt - now)}.
          </p>
          <div className="h-1.5 bg-silver/20" aria-hidden>
            <div className="h-full bg-paper" style={{ width: `${Math.min(100, (100 * (DELAY - (chain.pending.activeAt - now))) / DELAY)}%` }} />
          </div>
          <p className="font-mono text-xs text-silver">Anyone can read the new file before it takes effect.</p>
        </div>
      )}

      <div className="space-y-6">
        <h2 className="text-3xl">What the feed weighs</h2>
        <ul className="space-y-4">
          {(
            [
              ["reach", "Paid reach still unused", "cost times the share of places still open, so polls that need answers rise"],
              ["recency", "How new the poll is", "newer first, among the polls being ranked"],
              ["priority", "Priority the asker paid for", "normal, high or top"],
              ["chance", "Chance", "from the block hash the ranking used, so a rerun gives the same order"],
            ] as const
          ).map(([k, title, note]) => (
            <li key={k} className="grid grid-cols-[minmax(0,1fr)_4rem] gap-x-6 gap-y-2">
              <span className="text-xl">{title}</span>
              <span className="text-right font-mono text-xl tabular-nums">{Math.round(FEED[k] * 100)}%</span>
              <span className="col-span-2 block h-1.5 bg-silver/20" aria-hidden>
                <span className="block h-full bg-paper" style={{ width: `${FEED[k] * 100}%` }} />
              </span>
              <span className="col-span-2 font-mono text-xs text-silver">{note}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-6">
        <h2 className="text-3xl">What else is fixed</h2>
        <dl className="divide-y divide-silver/20 border-y border-silver/20">
          {[
            ["Who can answer", `a wallet that held $${MIN_HOLD_USD} of ZC or SC at the block the poll was asked`],
            ["Answers per wallet", "one, and it never changes"],
            ["Answerers' share", `${Number(ANSWERERS_BPS) / 100}% of what the asker paid, in equal parts per paid place`],
            ["More answers than places", "every answer counts; the paid places go by a draw on the first block after close"],
            ["Breakdowns", `shown only when every group in it has ${GROUP_MIN} answers or more`],
          ].map(([k, v]) => (
            <div key={k} className="grid gap-2 py-4 sm:grid-cols-[14rem_minmax(0,1fr)]">
              <dt className="font-mono text-xs uppercase tracking-[0.14em] text-silver">{k}</dt>
              <dd className="text-lg">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="space-y-4">
        <h2 className="text-3xl">Check it yourself</h2>
        <p className="max-w-2xl text-lg leading-relaxed text-paper/80">
          Read{" "}
          <a href={SOURCE} target="_blank" rel="noreferrer" className="underline underline-offset-4">
            the rules file
          </a>
          , hash it, and compare with the chain. Then rerun the feed on the public data. The hash proves which rules were
          published and when. It does not prove our server runs them; the rerun does.
        </p>
        <pre className="overflow-x-auto bg-tray p-5 font-mono text-xs leading-relaxed text-paper/90">
          {`cast keccak 0x$(xxd -p web/src/lib/algorithm.ts | tr -d '\\n')
pnpm dlx tsx web/scripts/verify-feed.mts https://silverchat.cash`}
        </pre>
        <p className="font-mono text-xs text-silver">
          More in the <Link href="/docs" className="underline underline-offset-4">docs</Link>.
        </p>
      </div>
    </section>
  );
}

function Hash({ label, value, note, href }: { label: string; value: string; note: string; href?: string }) {
  return (
    <div className="space-y-3 bg-developer p-6">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-silver">{label}</p>
      <p className="break-all font-mono text-sm text-paper">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
            {value}
          </a>
        ) : (
          value
        )}
      </p>
      <p className="font-mono text-xs text-silver">{note}</p>
    </div>
  );
}
