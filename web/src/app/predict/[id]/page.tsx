import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { Figures, Page, Part, label, quiet } from "@/components/journal";
import { Sides, StakePanel } from "@/components/predict";
import { ADDR, EXPLORER } from "@/lib/config";
import { short, span, tokens } from "@/lib/format";
import { utcStamp as utc } from "@/lib/market";
import { db } from "@/lib/server/db";
import { displayTime } from "@/lib/server/eligibility";
import { serializeMarket } from "@/lib/server/predict";

export const dynamic = "force-dynamic";

const load = cache(async (id: string) => {
  if (!/^\d{1,20}$/.test(id)) return null;
  const row = await db.market(id);
  return row ? serializeMarket(row) : null;
});

export async function generateMetadata({ params }: PageProps<"/predict/[id]">): Promise<Metadata> {
  const m = await load((await params).id);
  return { title: m?.title ? `${m.title} · silverchat` : "Predict · silverchat" };
}

export default async function MarketPage({ params }: PageProps<"/predict/[id]">) {
  const m = await load((await params).id);
  if (!m) notFound();
  const now = await displayTime();
  const closed = now >= m.closesAt;
  const yes = BigInt(m.yes);
  const no = BigInt(m.no);
  const shown = yes + no;
  const state =
    m.status === "yes" || m.status === "no"
      ? `Settled ${m.status.toUpperCase()}${m.refund ? " · every stake comes back: nobody revealed the winning side, or nobody lost" : ""}`
      : m.status === "void"
        ? m.invalid
          ? "Void: the answer was that the question is invalid. Every stake comes back."
          : "Void: it could not be settled. Every stake comes back."
        : !closed
          ? `Taking stakes · closes in ${span(m.closesAt - now)}`
          : now < m.revealEnds
            ? `Closed · sides are being revealed for ${span(m.revealEnds - now)}`
            : "Closed · waiting for the result";
  const oracle =
    m.kind === "price"
      ? { label: `Chainlink ${m.feed}`, href: `https://data.chain.link/feeds/ethereum/mainnet/${(m.feed ?? "").toLowerCase().replace("/", "-")}` }
      : { label: "Reality.eth question", href: `https://reality.eth.limo/#!/network/1/question/${ADDR.reality}-${m.questionId}` };
  // the market's days in the order they come, the next one marked while the market is open
  const days = (
    [
      ["Staking closes", m.closesAt],
      ["Reveals end", m.revealEnds],
      [m.kind === "price" ? "Price read" : "Question opens", m.resolvesAt],
    ] as [string, number][]
  ).sort((a, b) => a[1] - b[1]);
  const next = m.status === "open" ? days.find(([, at]) => at > now)?.[0] : undefined;

  return (
    <Page>
      <header className="space-y-5">
        <Link href="/predict" className={`${label} inline-flex min-h-11 items-center gap-2 transition-colors hover:text-paper`}>
          <span aria-hidden>←</span> All markets
        </Link>
        <p className={label}>
          Market No. {m.id} · {m.kind === "price" ? `Price · ${m.feed}` : "Event"}
        </p>
        <h1 className="text-[clamp(1.85rem,4.4vw,2.7rem)] leading-[1.08] tracking-[-0.01em] text-balance wrap-anywhere">
          {m.title ?? "This market's question is not shown here."}
        </h1>
        <p className="flex items-start gap-2.5 font-mono text-[13px] leading-relaxed text-paper/85">
          <span aria-hidden className={`mt-[0.45em] size-2 shrink-0 rounded-full ${m.status === "open" && !closed ? "bg-tap" : "border border-paper/60"}`} />
          {state}
        </p>
      </header>

      <Part title="The pool" id="pool">
        <Figures
          columns={3}
          items={[
            { label: "ZC staked", value: tokens(m.pool, 0) },
            { label: "Stakes", value: m.stakes },
          ]}
        />
        {!closed ? (
          <Sides yes={m.yes} no={m.no} sealed>
            Every side is sealed until {utc(m.closesAt)}. Nobody can see which way the pool leans.
          </Sides>
        ) : shown > 0n ? (
          <Sides yes={m.yes} no={m.no} sealed={false}>
            {BigInt(m.pool) > shown && <>{tokens(BigInt(m.pool) - shown, 0)} ZC {now < m.revealEnds ? "not revealed yet" : "never revealed, counted as lost"}.</>}
          </Sides>
        ) : (
          BigInt(m.pool) > 0n && (
            <p className="font-mono text-xs text-silver">
              {tokens(m.pool, 0)} ZC {now < m.revealEnds ? "not revealed yet" : "never revealed, counted as lost"}.
            </p>
          )
        )}
      </Part>

      <StakePanel
        now={now}
        market={{
          id: m.id,
          kind: m.kind,
          opener: m.opener,
          closesAt: m.closesAt,
          revealEnds: m.revealEnds,
          resolvesAt: m.resolvesAt,
          status: m.status,
          refund: m.refund,
          invalid: m.invalid,
          lockClaimed: m.lockClaimed,
        }}
      />

      <Part title="The terms" id="terms">
        <ol className="ruled">
          {days.map(([k, at]) => (
            <li key={k} className="flex items-baseline justify-between gap-4 py-3">
              <span className="flex items-center gap-2.5 text-[1.05rem]">
                <span aria-hidden className={`size-1.5 rounded-full ${k === next ? "bg-paper" : "bg-paper/25"}`} />
                {k}
                {k === next && <span className="ml-1 font-mono text-[11px] text-silver">next</span>}
              </span>
              <span className="text-right font-mono text-[12px] text-paper/80 tabular-nums">{utc(at)}</span>
            </li>
          ))}
          <li className="flex items-baseline justify-between gap-4 py-3">
            <span className="pl-4 text-[1.05rem]">SC locked</span>
            <span className="text-right font-mono text-[12px] text-paper/80 tabular-nums">
              {tokens(m.lock, 0)} by {short(m.opener)}
            </span>
          </li>
        </ol>
        <p className="max-w-[34em] text-[0.95rem] leading-relaxed text-paper/75 text-pretty">
          {m.kind === "price"
            ? "YES if the feed's price at that time is at or above the line. Anyone can settle it with the Chainlink round that was current then."
            : "After the question opens, anyone can answer on Reality.eth with an ETH bond; a higher bond overrules it, and Kleros settles a dispute. Our keeper posts the first answer."}
        </p>
        <p className="flex flex-wrap gap-x-6 gap-y-2 font-mono text-[12px]">
          <a href={oracle.href} target="_blank" rel="noreferrer" className={quiet}>
            {oracle.label} ↗
          </a>
          <a href={`${EXPLORER}/tx/${m.tx}`} target="_blank" rel="noreferrer" className={`${quiet} text-silver`}>
            Opened in {short(m.tx)} ↗
          </a>
        </p>
      </Part>
    </Page>
  );
}
