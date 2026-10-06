import type { Metadata } from "next";
import Link from "next/link";

import { Empty, Page, PageHead, Part, action, label, quiet } from "@/components/journal";
import { SealArt, Sides } from "@/components/predict";
import { ADDR, chapter, ZERO } from "@/lib/config";
import { span, tokens } from "@/lib/format";
import { db } from "@/lib/server/db";
import { displayTime } from "@/lib/server/eligibility";
import { serializeMarket } from "@/lib/server/predict";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Predict · silverchat" };

type M = ReturnType<typeof serializeMarket>;

export default async function PredictPage() {
  const live = ADDR.predict !== ZERO;
  const [rows, now] = await Promise.all([live ? db.markets(200) : [], displayTime()]);
  const all = rows.map(serializeMarket).filter((m) => !m.hidden);
  const groups: [string, string, M[]][] = [
    ["taking", "Taking stakes", all.filter((m) => m.status === "open" && m.closesAt > now)],
    ["closed", "Closed, sides being revealed or waiting for the result", all.filter((m) => m.status === "open" && m.closesAt <= now)],
    ["settled", "Settled", all.filter((m) => m.status !== "open")],
  ];

  return (
    <Page>
      <PageHead
        stop="predict"
        art={<SealArt />}
        aside={
          live && (
            <>
              <Link href="/predict/open" className={action}>
                Open a market
              </Link>
              <Link href="/scores" className={`${quiet} px-2 py-2.5 font-mono text-[13px]`}>
                The forecasters
              </Link>
            </>
          )
        }
      >
        Stake $ZC on YES or NO. Your side stays sealed until the market closes, so nobody can follow the crowd. Then the
        sides open and the winners share the pool. In Snowmoon, people and bots bet like this on what comes next (
        <a href={chapter(27)} target="_blank" rel="noreferrer" className={quiet}>
          ch. 27
        </a>
        ).
      </PageHead>

      <HowItWorks />

      {!live ? (
        <Empty>The bridge is quiet. Predict is not live yet.</Empty>
      ) : !all.length ? (
        <Empty>Nobody is betting on the bridge yet. Open the first market, and the first stake is yours to seal.</Empty>
      ) : (
        groups
          .filter(([, , list]) => list.length)
          .map(([key, title, list]) => (
            <Part key={key} id={`markets-${key}`} title={title} more={<span className="text-silver tabular-nums">{list.length}</span>}>
              <ol className="ruled -mx-2">
                {list.map((m) => (
                  <li key={m.id}>
                    <Market m={m} now={now} />
                  </li>
                ))}
              </ol>
            </Part>
          ))
      )}
    </Page>
  );
}

/** The three steps of every market, so a first visitor sees the whole idea before the list. */
function HowItWorks() {
  const steps = [
    ["Seal", "Pick YES or NO and stake $ZC. Only a seal of your side goes on the chain, so nobody can read it."],
    ["Open", "When the market closes, stakers reveal their sides within 72 hours. A side left sealed counts as lost."],
    ["Share", "Chainlink or Reality.eth gives the answer. The winners share the pool, less 2%: 1% burned, 1% to the treasury."],
  ];
  return (
    <section aria-labelledby="how">
      <h2 id="how" className="sr-only">
        How a market works
      </h2>
      <ol className="grid gap-x-6 gap-y-5 sm:grid-cols-3">
        {steps.map(([name, text], i) => (
          <li key={name} className="space-y-2 border-l border-paper/20 pl-4">
            <p className="flex items-baseline gap-2.5">
              <span className="font-mono text-[11px] text-silver tabular-nums">{String(i + 1).padStart(2, "0")}</span>
              <span className="text-[1.4rem] leading-none italic">{name}</span>
            </p>
            <p className="text-[0.95rem] leading-snug text-paper/75 text-pretty">{text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** One market in the list: its question, its sides (sealed until close), and its pool or its outcome. */
function Market({ m, now }: { m: M; now: number }) {
  const settled = m.status !== "open";
  const taking = m.status === "open" && m.closesAt > now;
  // a settled market shows its outcome large on the right instead
  const when = taking ? `closes in ${span(m.closesAt - now)}` : "closed";
  return (
    <Link
      href={`/predict/${m.id}`}
      className="group grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-5 gap-y-3 rounded-md px-2 py-5 transition-colors hover:bg-paper/[0.04]"
    >
      <span className="min-w-0 space-y-1.5">
        <span className={`${label} block`}>
          No. {m.id} · {m.kind === "price" ? m.feed : "Event"}
        </span>
        <span className="line-clamp-3 block text-[1.2rem] leading-snug text-balance wrap-anywhere">{m.title ?? "Question not shown"}</span>
      </span>
      <span className="pt-6 text-right">
        <span className="block text-[1.7rem] leading-none tabular-nums">
          {settled ? m.status === "void" ? <span className="italic">Void</span> : m.status.toUpperCase() : tokens(m.pool, 0)}
        </span>
        <span className="mt-1.5 block font-mono text-[11px] text-silver">{settled ? `${tokens(m.pool, 0)} ZC` : "ZC staked"}</span>
      </span>
      <span className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[11px] text-silver">
        <Sides yes={m.yes} no={m.no} sealed={taking} small />
        <span>
          {m.stakes} {m.stakes === 1 ? "stake" : "stakes"}
        </span>
        {settled ? m.refund && <span>every stake comes back</span> : <span>{when}</span>}
        <span aria-hidden className="ml-auto hidden text-sm transition-transform sm:inline group-hover:translate-x-0.5 group-hover:text-paper motion-reduce:transition-none">
          →
        </span>
      </span>
    </Link>
  );
}
