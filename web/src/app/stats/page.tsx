import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { formatUnits } from "viem";

import { action, Empty, Page, PageHead, Part, label, quiet } from "@/components/journal";
import { ADDR } from "@/lib/config";
import { tokens, usd } from "@/lib/format";
import { prices } from "@/lib/server/price";
import { stats } from "@/lib/server/stats";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Stats · silverchat",
  description: "Where the ZC paid into Silverchat went: spent asking, earned by answerers, returned, sent to the treasury and burned.",
};

/** An amount of ZC in the ledger: the number in serif, the coin small. */
const zc = (wei: bigint) => (
  <>
    {tokens(wei, 0)} <span className="font-mono text-[0.5em] tracking-[0.04em]">ZC</span>
  </>
);

export default async function StatsPage() {
  const [s, p] = await Promise.all([stats(), prices().catch(() => null)]);
  const dollars = (wei: bigint) => (p ? `≈ ${usd(Number(formatUnits((wei * p.zc) / 10n ** 18n, 18)))}` : " ");
  const unclaimed = s.inContract !== null && s.inContract >= s.open ? s.inContract - s.open : null;
  const share = s.burnAddress !== null && s.supply ? Number((s.burnAddress * 10_000n) / s.supply) / 100 : null;

  const plates: [string, bigint, string][] = [
    ["Spent asking", s.spent, "Every ZC paid into polls so far."],
    ["Earned by answerers", s.earned, "Their share of each fixed poll's 85%, equal per paid answer."],
    ["Burned by Silverchat", s.burned, "10% of each fixed poll, sent to the burn address."],
  ];
  const rows: [string, ReactNode, string][] = [
    ["Polls asked", s.polls.toLocaleString("en-US"), ""],
    ["Answers signed", s.answers.toLocaleString("en-US"), ""],
    ["Back to askers", zc(s.returned), "places nobody earned, and refunds"],
    ["Treasury", zc(s.treasury), "5% of each fixed poll, to the Safe"],
    ["In open polls", zc(s.open), "held by the contract until the result is fixed"],
    ...(unclaimed !== null ? ([["Waiting to be claimed", zc(unclaimed), "earned, not claimed yet; unclaimed after 90 days is burned"]] as [string, ReactNode, string][]) : []),
  ];

  return (
    <Page>
      <PageHead stop="ask" title="Every number since launch">
        Where the ZC paid into Silverchat went. Each fixed poll is split with the contract&apos;s own arithmetic, recounted every
        minute from the polls on{" "}
        <Link href="/records" className={quiet}>
          record
        </Link>{" "}
        and from Ethereum.
      </PageHead>

      <Part title="Where the ZC went">
        {/* the three headline figures, one under the other on a phone so each keeps its note beside it */}
        <dl className="grid gap-6 sm:grid-cols-3">
          {plates.map(([name, wei, about]) => (
            <div key={name} className="space-y-1.5 border-l border-paper/20 pl-4">
              <dt className={label}>{name}</dt>
              <dd className="text-[clamp(2rem,4vw,2.4rem)] leading-none tabular-nums">{zc(wei)}</dd>
              <dd className="font-mono text-[11px] text-silver">{dollars(wei)}</dd>
              <dd className="max-w-[18em] pt-1 text-[0.95rem] leading-snug text-paper/75">{about}</dd>
            </div>
          ))}
        </dl>
        {s.polls === 0 && (
          <Empty
            then={
              <Link href="/ask" className={action}>
                Ask the first question
              </Link>
            }
          >
            The bowl is cold. Nothing has been asked yet, so every line below still reads zero.
          </Empty>
        )}
      </Part>

      <Part title="The ledger">
        <Ledger rows={rows} />
      </Part>

      {s.scHolderEarned !== null && s.scHolderPaid !== null && (
        <Part
          title="Paid to SC holders"
          more={
            <a href={`https://stockereum.com/t/${ADDR.sc}`} target="_blank" rel="noreferrer" className={quiet}>
              SC on Stockereum
            </a>
          }
        >
          <p className="max-w-[34em] text-[1.05rem] leading-relaxed text-paper/80 text-pretty">
            Every SC trade on Stockereum pays a 1% fee in ZC, and half of it goes to everyone holding SC, in proportion to what
            they hold. These are Stockereum&apos;s holder rewards, read from its distributor contract.
          </p>
          <Ledger
            rows={[
              ["Earned by SC holders", zc(s.scHolderEarned), dollars(s.scHolderEarned)],
              ["Paid out", zc(s.scHolderPaid), dollars(s.scHolderPaid)],
              ["Ready to pay", zc(s.scHolderEarned - s.scHolderPaid), "claim yours, or pay everyone at once, on Stockereum"],
              ...(s.scHolders !== null ? ([["SC holders", s.scHolders.toLocaleString("en-US"), ""]] as [string, ReactNode, string][]) : []),
            ]}
          />
        </Part>
      )}

      {share !== null && s.burnAddress !== null && s.supply !== null && (
        <Part title="ZC at the burn address">
          <div className="space-y-4">
            <p className="text-[clamp(2.4rem,6vw,3.25rem)] leading-none tabular-nums">
              {share}
              <span className="text-[0.5em]">%</span> <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-silver">of the supply</span>
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-paper/10" aria-hidden>
              <div className="h-full rounded-full bg-paper" style={{ width: `${share}%` }} />
            </div>
            <p className="max-w-[34em] text-[1.05rem] leading-relaxed text-paper/80 text-pretty">
              {tokens(s.burnAddress, 0)} of {tokens(s.supply, 0)} ZC sit at the burn address: {share}% of the supply.
              Silverchat&apos;s part is the {tokens(s.burned, 0)} ZC above.
            </p>
          </div>
        </Part>
      )}

      <p className="border-t border-paper/20 pt-6 font-mono text-xs leading-relaxed text-silver">
        Rewards nobody claims within 90 days are burned too; those sweeps are not counted here yet. The same numbers, in wei:{" "}
        <a href="/api/stats" className={`text-paper ${quiet}`}>
          GET /api/stats
        </a>
        .
      </p>
    </Page>
  );
}

/** Rows of the ledger: what it is and a short note on the left, the figure on the right, a dashed rule between. */
function Ledger({ rows }: { rows: [string, ReactNode, string][] }) {
  return (
    <ol className="ruled">
      {rows.map(([k, v, note]) => (
        <li key={k} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 py-3.5">
          <span className="space-y-1">
            <span className="block text-[1.05rem] leading-snug">{k}</span>
            {note.trim() && <span className="block font-mono text-[11px] leading-relaxed text-silver">{note}</span>}
          </span>
          <span className="text-right text-[1.5rem] leading-none tabular-nums">{v}</span>
        </li>
      ))}
    </ol>
  );
}
