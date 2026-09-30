import type { Metadata } from "next";
import Link from "next/link";
import { formatUnits } from "viem";

import { tokens, usd } from "@/lib/format";
import { prices } from "@/lib/server/price";
import { stats } from "@/lib/server/stats";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Stats · silverchat",
  description: "Where the ZC paid into Silverchat went: spent asking, earned by answerers, returned, sent to the treasury and burned.",
};

export default async function StatsPage() {
  const [s, p] = await Promise.all([stats(), prices().catch(() => null)]);
  const dollars = (wei: bigint) => (p ? `≈ ${usd(Number(formatUnits((wei * p.zc) / 10n ** 18n, 18)))}` : " ");
  const unclaimed = s.inContract !== null && s.inContract >= s.open ? s.inContract - s.open : null;
  const share = s.burnAddress !== null && s.supply ? Number((s.burnAddress * 10_000n) / s.supply) / 100 : null;

  const plates: [string, bigint, string][] = [
    ["Spent asking", s.spent, "Every ZC paid into polls so far."],
    ["Earned by answerers", s.earned, "85% of each fixed poll, in equal shares per paid answer."],
    ["Burned by Silverchat", s.burned, "10% of each fixed poll, sent to the burn address."],
  ];
  const rows: [string, string, string][] = [
    ["Polls asked", s.polls.toLocaleString("en-US"), ""],
    ["Answers signed", s.answers.toLocaleString("en-US"), ""],
    ["Back to askers", `${tokens(s.returned, 0)} ZC`, "places nobody earned, and refunds"],
    ["Treasury", `${tokens(s.treasury, 0)} ZC`, "5% of each fixed poll, to the Safe"],
    ["In open polls", `${tokens(s.open, 0)} ZC`, "held by the contract until the result is fixed"],
    ...(unclaimed !== null ? ([["Waiting to be claimed", `${tokens(unclaimed, 0)} ZC`, "earned, not claimed yet; unclaimed after 90 days is burned"]] as [string, string, string][]) : []),
  ];

  return (
    <section className="mx-auto max-w-6xl space-y-12 px-5 py-10 sm:px-8 md:py-14">
      <header className="max-w-2xl space-y-4">
        <h1 className="text-5xl leading-tight">Stats</h1>
        <p className="text-lg leading-relaxed text-paper/80">
          Where the ZC paid into Silverchat went. Each fixed poll is split with the contract&apos;s own arithmetic, recounted every
          minute from the polls on <Link href="/records" className="underline underline-offset-4">record</Link> and from Ethereum.
        </p>
      </header>

      <ol className="grid gap-3 md:grid-cols-3">
        {plates.map(([label, wei, note]) => (
          <li key={label} className="flex min-h-56 flex-col justify-between bg-[url(/plates/paper.webp)] bg-cover p-6 text-developer">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em]">{label}</p>
            <div className="space-y-2">
              <p className="text-[clamp(2.25rem,4.5vw,3.75rem)] leading-none tabular-nums">
                {tokens(wei, 0)} <span className="text-[0.45em]">ZC</span>
              </p>
              <p className="font-mono text-xs text-developer/70">{dollars(wei)}</p>
              <p className="text-sm leading-snug text-developer/80">{note}</p>
            </div>
          </li>
        ))}
      </ol>

      <dl className="divide-y divide-silver/20 border-y border-silver/20 font-mono text-sm">
        {rows.map(([k, v, note]) => (
          <div key={k} className="grid gap-x-6 gap-y-1 py-3 sm:grid-cols-[14rem_10rem_minmax(0,1fr)]">
            <dt className="text-silver">{k}</dt>
            <dd className="tabular-nums text-paper sm:text-right">{v}</dd>
            <dd className="text-xs text-silver sm:self-center">{note}</dd>
          </div>
        ))}
      </dl>

      {share !== null && s.burnAddress !== null && s.supply !== null && (
        <div className="space-y-4">
          <h2 className="text-3xl">All ZC ever burned, by anyone</h2>
          <div className="h-3 bg-paper/10" aria-hidden>
            <div className="h-full bg-paper" style={{ width: `${share}%` }} />
          </div>
          <p className="font-mono text-sm text-paper/80">
            {tokens(s.burnAddress, 0)} of {tokens(s.supply, 0)} ZC sit at the burn address: {share}% of the supply. Silverchat&apos;s part
            is the {tokens(s.burned, 0)} ZC above.
          </p>
        </div>
      )}

      <p className="max-w-2xl font-mono text-xs leading-relaxed text-silver">
        Rewards nobody claims within 90 days are burned too; those sweeps are not counted here yet. The same numbers, in wei:{" "}
        <a href="/api/stats" className="text-paper underline underline-offset-4">
          GET /api/stats
        </a>
        .
      </p>
    </section>
  );
}
