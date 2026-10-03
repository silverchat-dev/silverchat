import type { Metadata } from "next";
import Link from "next/link";

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
  const groups: [string, M[]][] = [
    ["Taking stakes", all.filter((m) => m.status === "open" && m.closesAt > now)],
    ["Closed, sides being revealed or waiting for the result", all.filter((m) => m.status === "open" && m.closesAt <= now)],
    ["Settled", all.filter((m) => m.status !== "open")],
  ];

  return (
    <section className="mx-auto max-w-6xl space-y-12 px-5 py-10 sm:px-8 md:py-14">
      <header className="space-y-4">
        <h1 className="text-5xl leading-tight">Predict</h1>
        <p className="max-w-2xl text-lg leading-relaxed text-paper/80">
          In Snowmoon, Silverchat Predict lets people, or bots, bet on future events (
          <a href={chapter(27)} target="_blank" rel="noreferrer" className="underline underline-offset-4">
            ch. 27
          </a>
          ). Here you stake $ZC on YES or NO. Your side stays sealed until the market closes, so nobody can follow the
          crowd. Winners share the pool.
        </p>
        {live && (
          <Link href="/predict/open" className="inline-block bg-paper px-5 py-2.5 font-mono text-sm text-developer">
            Open a market
          </Link>
        )}{" "}
        <Link href="/scores" className="ml-4 inline-block font-mono text-sm text-paper underline-offset-4 hover:underline">
          Forecasters →
        </Link>
      </header>

      {!live ? (
        <p className="text-xl text-paper/80">Predict is not live yet.</p>
      ) : !all.length ? (
        <p className="text-xl text-paper/80">No markets yet. Open the first one.</p>
      ) : (
        groups
          .filter(([, list]) => list.length)
          .map(([title, list]) => (
            <section key={title} className="space-y-4">
              <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-silver">{title}</h2>
              <ol className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))]">
                {list.map((m) => (
                  <li key={m.id} className="film">
                    <span aria-hidden className="absolute left-3 top-[14px] font-mono text-[9px] leading-none tracking-[0.2em] text-paper/40">
                      PREDICT {m.id} ▸ {m.kind === "price" ? m.feed : "EVENT"}
                    </span>
                    <Link href={`/predict/${m.id}`} className="flex h-full min-h-40 flex-col justify-between gap-6 bg-paper p-5 text-developer hover:brightness-[1.04] sm:min-h-56">
                      <span className="line-clamp-4 text-xl leading-snug wrap-anywhere">{m.title ?? "Question not shown"}</span>
                      <span className="flex flex-wrap justify-between gap-x-3 gap-y-1 font-mono text-xs whitespace-nowrap text-developer/70">
                        <span>{tokens(m.pool, 0)} ZC</span>
                        <span>{m.stakes} {m.stakes === 1 ? "stake" : "stakes"}</span>
                        <span>
                          {m.status === "open"
                            ? m.closesAt > now
                              ? `closes in ${span(m.closesAt - now)}`
                              : "closed"
                            : m.status === "void"
                              ? "void"
                              : m.status.toUpperCase()}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          ))
      )}
    </section>
  );
}
