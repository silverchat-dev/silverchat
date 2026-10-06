"use client";

import { useState } from "react";

import { GROUP_MIN, type Tally } from "@/lib/algorithm";
import { WHO } from "@/lib/agent";
import { AGES, REGIONS } from "@/lib/answer";
import type { Content } from "@/lib/content";
import { pct } from "@/lib/format";

type View = "all" | "region" | "age" | "who";
// people and agents, as the agents list stood when the result was fixed (results fixed before agents existed have none)
type Fixed = Tally & { who?: Tally["region"] };

/** The fixed result as a print taped into the journal: one block per question, a bar of ink for each option. */
export function Print({ content, tally, note }: { content: Content; tally: Fixed; note?: string }) {
  const [view, setView] = useState<View>("all");
  const views = (["all", "region", "age", "who"] as const).filter((v) => v === "all" || tally[v]);
  // a fixed order, so the layout says nothing about which group answered first
  const order = view === "region" ? REGIONS : view === "who" ? WHO : AGES;
  const groups = view === "all" ? null : Object.entries(tally[view] ?? {}).sort(([a], [b]) => rankOf(order, a) - rankOf(order, b));

  return (
    <section aria-label="Result" className="relative px-1 pt-3">
      {/* two strips of tape hold the print in the journal */}
      <span aria-hidden className="absolute top-0 left-6 z-10 h-6 w-20 -rotate-6 border border-paper/10 bg-tray/90 shadow-[0_1px_2px_rgba(60,40,10,0.18)]" />
      <span aria-hidden className="absolute top-0 right-6 z-10 h-6 w-20 rotate-[5deg] border border-paper/10 bg-tray/90 shadow-[0_1px_2px_rgba(60,40,10,0.18)]" />
      <div className="rotate-[-0.35deg] rounded-[3px] border border-paper/12 bg-white/45 px-5 pt-8 pb-7 shadow-[0_18px_40px_-22px_rgba(60,40,10,0.55)] sm:px-8 sm:pt-9">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-3">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-silver">
            Result · <span className="text-paper tabular-nums">{tally.answers.toLocaleString("en-US")}</span> answers{note && ` · ${note}`}
          </p>
          {views.length > 1 && (
            <div role="group" aria-label="Break down by" className="-mx-1 flex flex-wrap gap-1">
              {views.map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                  className="min-h-11 rounded-full px-3 font-mono sm:min-h-9 text-[12px] tracking-[0.04em] text-silver transition-colors hover:text-paper aria-pressed:bg-paper aria-pressed:text-developer"
                >
                  {v === "all" ? "Everyone" : v === "who" ? "People / agents" : `By ${v}`}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-7 space-y-10">
          {content.questions.map((q, i) =>
            groups ? (
              <div key={i} className="space-y-6">
                {content.questions.length > 1 && <h3 className="text-[1.35rem] leading-snug text-balance">{q.q}</h3>}
                <div className="grid gap-x-8 gap-y-7 sm:grid-cols-2">
                  {groups.map(([name, counts]) => (
                    <Bars key={name} title={name} options={q.options} counts={counts[i]} small />
                  ))}
                </div>
              </div>
            ) : (
              <div key={i} className="space-y-5">
                {content.questions.length > 1 && <h3 className="text-[1.35rem] leading-snug text-balance">{q.q}</h3>}
                <Bars options={q.options} counts={tally.totals[i]} />
              </div>
            ),
          )}
        </div>
        {groups && (
          <p className="mt-8 border-t border-dashed border-paper/20 pt-4 font-mono text-[11px] leading-relaxed text-silver">
            Breakdowns are not in the on-chain record. They come from our server, from what people said about themselves
            and from the wallets that said they are agents when the result was fixed.
          </p>
        )}
        {!tally.region && !tally.age && tally.answers > 0 && (
          <p className="mt-8 border-t border-dashed border-paper/20 pt-4 font-mono text-[11px] leading-relaxed text-silver">
            No breakdown by region or age: a breakdown shows only when every group in it has {GROUP_MIN} answers or more.
          </p>
        )}
      </div>
    </section>
  );
}

const rankOf = (order: string[], name: string) => (order.includes(name) ? order.indexOf(name) : order.length);

function Bars({ options, counts, title, small }: { options: string[]; counts: number[]; title?: string; small?: boolean }) {
  const total = counts.reduce((s, n) => s + n, 0);
  const top = Math.max(...counts);
  return (
    <div className="space-y-3">
      {title && (
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-silver">
          {title} · <span className="tabular-nums">{total}</span>
        </p>
      )}
      <ol className={small ? "space-y-2.5" : "space-y-5"}>
        {options.map((o, k) => {
          const p = pct(counts[k], total);
          const lead = counts[k] === top && top > 0;
          return (
            <li key={k} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-4 gap-y-1.5">
              <span className={`${small ? "text-base" : "text-[1.2rem]"} leading-snug ${lead ? "" : "text-paper/75"}`}>{o}</span>
              <span className={`tabular-nums ${small ? "text-lg leading-none" : "text-[2.4rem] leading-[0.9]"} ${lead ? "" : "text-paper/75"}`}>
                {p}
                <span className={small ? "text-sm" : "text-xl"}>%</span>
              </span>
              <span className={`col-span-2 block overflow-hidden rounded-full bg-paper/10 ${small ? "h-1" : "h-1.5"}`} aria-hidden>
                <span className={`block h-full rounded-full ${lead ? "bg-paper" : "bg-paper/40"}`} style={{ width: `${p}%` }} />
              </span>
              {!small && <span className="col-span-2 font-mono text-[11px] text-silver tabular-nums">{counts[k].toLocaleString("en-US")} {counts[k] === 1 ? "answer" : "answers"}</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
