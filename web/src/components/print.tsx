"use client";

import { useState } from "react";

import { GROUP_MIN, type Tally } from "@/lib/algorithm";
import { AGES, REGIONS } from "@/lib/answer";
import type { Content } from "@/lib/content";
import { pct } from "@/lib/format";

type View = "all" | "region" | "age";

/** The fixed result, printed: one block per question, bars as silver density on fiber paper. */
export function Print({ content, tally }: { content: Content; tally: Tally }) {
  const [view, setView] = useState<View>("all");
  const views = (["all", "region", "age"] as const).filter((v) => v === "all" || tally[v]);
  // a fixed order, so the layout says nothing about which group answered first
  const order = view === "region" ? REGIONS : AGES;
  const groups = view === "all" ? null : Object.entries(tally[view] ?? {}).sort(([a], [b]) => rankOf(order, a) - rankOf(order, b));

  return (
    <section aria-label="Result" className="bg-paper px-5 py-7 text-developer sm:px-9 sm:py-9">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="font-mono text-xs uppercase tracking-[0.14em]">Result · {tally.answers.toLocaleString("en-US")} answers</p>
        {views.length > 1 && (
          <div role="group" aria-label="Break down by" className="flex gap-1 font-mono text-xs">
            {views.map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className="border border-developer/40 px-2.5 py-1 capitalize aria-pressed:bg-developer aria-pressed:text-paper"
              >
                {v === "all" ? "Everyone" : `By ${v}`}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8 space-y-12">
        {content.questions.map((q, i) =>
          groups ? (
            <div key={i} className="space-y-6">
              {content.questions.length > 1 && <h3 className="text-2xl leading-snug">{q.q}</h3>}
              <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
                {groups.map(([name, counts]) => (
                  <Bars key={name} title={name} options={q.options} counts={counts[i]} small />
                ))}
              </div>
            </div>
          ) : (
            <div key={i} className="space-y-6">
              {content.questions.length > 1 && <h3 className="text-2xl leading-snug">{q.q}</h3>}
              <Bars options={q.options} counts={tally.totals[i]} />
            </div>
          ),
        )}
      </div>
      {groups && (
        <p className="mt-10 font-mono text-xs leading-relaxed text-developer/65">
          Breakdowns are not in the on-chain record. They come from our server, from what people said about themselves.
        </p>
      )}
      {!tally.region && !tally.age && tally.answers > 0 && (
        <p className="mt-10 font-mono text-xs leading-relaxed text-developer/65">
          No breakdown by region or age: a breakdown shows only when every group in it has {GROUP_MIN} answers or more.
        </p>
      )}
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
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-developer/70">
          {title} · {total}
        </p>
      )}
      <ol className={small ? "space-y-2" : "space-y-4"}>
        {options.map((o, k) => {
          const p = pct(counts[k], total);
          const lead = counts[k] === top && top > 0;
          return (
            <li key={k} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-4 gap-y-1.5">
              <span className={`${small ? "text-base" : "text-xl"} ${lead ? "" : "text-developer/75"}`}>{o}</span>
              <span className={`tabular-nums ${small ? "text-lg" : "text-4xl leading-none"} ${lead ? "" : "text-developer/75"}`}>{p}%</span>
              <span className="col-span-2 block h-2.5 bg-developer/10" aria-hidden>
                <span className={`block h-full ${lead ? "bg-developer" : "bg-developer/55"}`} style={{ width: `${p}%` }} />
              </span>
              {!small && <span className="col-span-2 font-mono text-xs text-developer/60">{counts[k].toLocaleString("en-US")} answers</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
