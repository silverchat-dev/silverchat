import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { StakePanel } from "@/components/predict";
import { ADDR, EXPLORER } from "@/lib/config";
import { pct, short, span, tokens } from "@/lib/format";
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

const utc = (ts: number) => `${new Date(ts * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`;

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
      ? `Settled ${m.status.toUpperCase()}${m.refund ? ": every stake comes back, nobody revealed a winning side or every side won" : ""}`
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
      : { label: "Reality.eth question", href: `https://reality.eth.limo/app/#!/question/${ADDR.reality}-${m.questionId}` };
  const facts: [string, string][] = [
    ["Staked", `${tokens(m.pool, 0)} ZC`],
    ["Stakes", String(m.stakes)],
    ["Staking closes", utc(m.closesAt)],
    ["Reveals end", utc(m.revealEnds)],
    [m.kind === "price" ? "Price read at" : "Question opens", utc(m.resolvesAt)],
    ["SC locked", `${tokens(m.lock, 0)} by ${short(m.opener)}`],
  ];

  return (
    <section className="mx-auto grid max-w-6xl gap-10 px-5 py-10 sm:px-8 md:py-14 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-10">
        <header className="space-y-5">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-silver">
            Predict No. {m.id} · {m.kind === "price" ? `Price · ${m.feed}` : "Event"}
          </p>
          <h1 className="text-4xl leading-tight text-balance wrap-anywhere sm:text-5xl">{m.title ?? "This market's question is not shown here."}</h1>
          <p className="font-mono text-sm text-paper/80">{state}</p>
        </header>

        {closed && shown > 0n && (
          <section aria-labelledby="sides" className="space-y-3">
            <h2 id="sides" className="font-mono text-xs uppercase tracking-[0.14em] text-silver">
              Revealed sides
            </h2>
            <div className="flex h-3 bg-paper/10" aria-hidden>
              <div className="h-full bg-paper" style={{ width: `${pct(Number(yes / 10n ** 15n), Number(shown / 10n ** 15n))}%` }} />
            </div>
            <p className="flex justify-between font-mono text-sm text-paper/85">
              <span>YES {tokens(yes, 0)} ZC</span>
              <span>NO {tokens(no, 0)} ZC</span>
            </p>
            {BigInt(m.pool) > shown && (
              <p className="font-mono text-xs text-silver">
                {tokens(BigInt(m.pool) - shown, 0)} ZC {now < m.revealEnds ? "not revealed yet" : "never revealed, counted as lost"}.
              </p>
            )}
          </section>
        )}

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
      </div>

      <aside className="space-y-5 self-start bg-tray px-5 py-7 font-mono text-sm sm:px-7 lg:sticky lg:top-6">
        <dl className="space-y-2">
          {facts.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4">
              <dt className="text-silver">{k}</dt>
              <dd className="text-right tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="border-t border-silver/25 pt-4 text-xs leading-relaxed text-silver">
          {m.kind === "price"
            ? "YES if the feed's price at that time is at or above the line. Anyone can settle it with the Chainlink round that was current then."
            : "After the question opens, anyone can answer on Reality.eth with an ETH bond; a higher bond overrules it, and Kleros settles a dispute. Our keeper posts the first answer."}
        </p>
        <a href={oracle.href} target="_blank" rel="noreferrer" className="block underline underline-offset-4">
          {oracle.label}
        </a>
        <a href={`${EXPLORER}/tx/${m.tx}`} target="_blank" rel="noreferrer" className="block text-xs text-silver underline-offset-4 hover:underline">
          Opened in {short(m.tx)}
        </a>
      </aside>
    </section>
  );
}
