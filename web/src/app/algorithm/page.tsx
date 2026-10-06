import type { Metadata } from "next";
import Link from "next/link";

import { Page, PageHead, Part, label, note, quiet } from "@/components/journal";
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
    <Page>
      <PageHead stop="ask" title="The rules">
        In Snowmoon, Silverchat could not quietly change how it ranks and counts. A new algorithm hash{" "}
        <a href={chapter(27)} target="_blank" rel="noreferrer" className={quiet}>
          &quot;would come with a twenty-day delay&quot;
        </a>
        . Here the rules are one file, its hash sits on Ethereum, and a new version counts only 20 days after it is published.
      </PageHead>

      <Part title="The hash">
        <ol className="ruled">
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
            mark={chain ? (matches ? "same" : "differs") : undefined}
            href={ADDR.algorithm !== ZERO ? `${EXPLORER}/address/${ADDR.algorithm}#readContract` : undefined}
          />
        </ol>

        {chain?.pending && (
          <div className={`${note} space-y-3`}>
            <p className={label}>A change is waiting</p>
            <p className="text-[1.6rem] leading-snug">
              <span className="font-mono text-[0.8em]">{short(chain.pending.hash)}</span> counts in {span(chain.pending.activeAt - now)}.
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-paper/12" aria-hidden>
              <div className="h-full rounded-full bg-paper" style={{ width: `${Math.min(100, (100 * (DELAY - (chain.pending.activeAt - now))) / DELAY)}%` }} />
            </div>
            <p className="font-mono text-[11px] text-silver">Anyone can read the new file before it takes effect.</p>
          </div>
        )}
      </Part>

      <Part title="What the feed weighs">
        <ol className="ruled">
          {(
            [
              ["reach", "Paid reach still unused", "cost times the share of places still open, so polls that need answers rise"],
              ["recency", "How new the poll is", "newer first, among the polls being ranked"],
              ["priority", "Priority the asker paid for", "normal, high or top"],
              ["chance", "Chance", "from the block hash the ranking used, so a rerun gives the same order"],
            ] as const
          ).map(([k, title, why]) => (
            <li key={k} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 gap-y-2.5 py-4 first:pt-0">
              <span className="text-[1.2rem] leading-snug">{title}</span>
              <span className="text-right text-[1.75rem] leading-none tabular-nums">
                {Math.round(FEED[k] * 100)}
                <span className="text-[0.55em]">%</span>
              </span>
              <span className="col-span-2 block h-1 overflow-hidden rounded-full bg-paper/12" aria-hidden>
                <span className="block h-full rounded-full bg-paper" style={{ width: `${FEED[k] * 100}%` }} />
              </span>
              <span className="col-span-2 font-mono text-[11px] leading-relaxed text-silver">{why}</span>
            </li>
          ))}
        </ol>
      </Part>

      <Part title="What else is fixed">
        <dl className="divide-y divide-dashed divide-paper/20">
          {[
            ["Who can answer", `a wallet that held $${MIN_HOLD_USD} of ZC or SC at the block the poll was asked`],
            ["Answers per wallet", "one, and it never changes"],
            ["Answerers' share", `${Number(ANSWERERS_BPS) / 100}% of what the asker paid, in equal parts per paid place`],
            ["More answers than places", "every answer counts; the paid places go by a draw on the first block after close"],
            ["Breakdowns", `shown only when every group in it has ${GROUP_MIN} answers or more`],
          ].map(([k, v]) => (
            <div key={k} className="grid gap-x-6 gap-y-1.5 py-4 first:pt-0 sm:grid-cols-[11rem_minmax(0,1fr)]">
              <dt className={`${label} sm:pt-1.5`}>{k}</dt>
              <dd className="text-[1.1rem] leading-snug text-pretty">{v}</dd>
            </div>
          ))}
        </dl>
      </Part>

      <Part title="Check it yourself">
        <p className="max-w-[34em] text-[1.05rem] leading-relaxed text-paper/80 text-pretty">
          Read{" "}
          <a href={SOURCE} target="_blank" rel="noreferrer" className={quiet}>
            the rules file
          </a>
          , hash it, and compare with the chain. Then rerun the feed on the public data. The hash proves which rules were
          published and when. It does not prove our server runs them; the rerun does.
        </p>
        <pre tabIndex={0} aria-label="Commands to check the rules" className="overflow-x-auto rounded-lg bg-tray px-5 py-4 font-mono text-xs leading-relaxed text-paper/90">
          {`cast keccak 0x$(xxd -p web/src/lib/algorithm.ts | tr -d '\\n')
pnpm dlx tsx web/scripts/verify-feed.mts https://silverchat.cash`}
        </pre>
        <p className="font-mono text-xs text-silver">
          More in the{" "}
          <Link href="/docs" className={quiet}>
            docs
          </Link>
          .
        </p>
      </Part>
    </Page>
  );
}

/** One hash on the record: where it comes from, the hash itself, and what it means. */
function Hash({ label: name, value, note: about, href, mark }: { label: string; value: string; note: string; href?: string; mark?: "same" | "differs" }) {
  return (
    <li className="space-y-2 py-4 first:pt-0">
      <p className="flex items-center gap-3">
        <span className={label}>{name}</span>
        {mark && (
          <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] ${mark === "same" ? "border-paper/40 text-paper" : "border-paper bg-paper text-developer"}`}>
            {mark}
          </span>
        )}
      </p>
      <p className="font-mono text-[13px] leading-relaxed break-all text-paper">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className={quiet}>
            {value}
          </a>
        ) : (
          value
        )}
      </p>
      <p className="font-mono text-[11px] text-silver">{about}</p>
    </li>
  );
}
