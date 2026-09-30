"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { Tally } from "@/lib/algorithm";
import { ADDR, ZERO } from "@/lib/config";
import type { Content } from "@/lib/content";
import { EXAMPLE_NEGATIVES } from "@/lib/example";

type Frame = { key: string; block: number; question: string; options: [string, number][]; href?: string };

const examples: Frame[] = EXAMPLE_NEGATIVES.map((n) => ({
  key: String(n.block),
  block: n.block,
  question: n.question,
  options: [
    ["Yes", n.yes],
    ["No", 100 - n.yes],
  ],
}));

type Polled = { id: string; block: string; content: Content | null; tally: Tally | null };

function frame(p: Polled): Frame | null {
  const q = p.content?.questions[0];
  const counts = p.tally?.totals[0];
  if (!q || !counts || !p.tally?.answers) return null;
  const options = q.options.map((o, i) => [o, Math.round((100 * counts[i]) / p.tally!.answers)] as [string, number]);
  return { key: p.id, block: Number(p.block), question: q.q, options: options.sort((a, b) => b[1] - a[1]).slice(0, 2), href: `/poll/${p.id}` };
}

/** The latest fixed polls as a contact sheet of negatives; pointing at one prints it. Examples until real ones exist. */
export function Archive() {
  const [real, setReal] = useState<Frame[] | null>(null);

  useEffect(() => {
    if (ADDR.ask === ZERO) return;
    const ctl = new AbortController();
    fetch("/api/polls?status=final&limit=6", { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { polls: Polled[] } | null) => {
        const frames = (j?.polls ?? []).map(frame).filter((f): f is Frame => f !== null);
        if (frames.length) setReal(frames);
      })
      .catch(() => {});
    return () => ctl.abort();
  }, []);

  const frames = real ?? examples;

  return (
    <section aria-labelledby="archive-title" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 md:py-28">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-end">
        <div className="space-y-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-silver">The archive</p>
          <h2 id="archive-title" className="text-[clamp(2rem,4.2vw,3.5rem)] leading-[1.05]">
            Nothing gets thrown out.
          </h2>
        </div>
        <p className="max-w-xl text-lg leading-relaxed text-paper/75">
          A fixed poll keeps its question, its count and the transaction that fixed it, for anyone to look up. Point at a
          negative to print it.
        </p>
      </div>

      {/* a contact sheet: the negatives laid on the film's own dark base, numbered along the edge */}
      <div className="mt-12 bg-film p-3 md:p-5">
        <p className="mb-3 flex justify-between font-mono text-[10px] tracking-[0.2em] text-silver/70">
          <span className="text-silver">{real ? "SILVERCHAT · RECORDS" : "EXAMPLE · NOT REAL RECORDS"}</span>
          <span aria-hidden>▸ 1A</span>
        </p>
        <ol className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3">
          {frames.map((f, i) => {
            const inner = (
              <div
                className="@container aspect-[3/2] bg-[url(/plates/paper.webp)] bg-cover p-[7%] text-developer transition-[filter] duration-700 [filter:invert(1)_hue-rotate(180deg)_contrast(0.85)] group-hover:[filter:none] group-focus-visible:[filter:none] group-active:[filter:none]"
              >
                <p className="font-mono text-[4.6cqw] text-developer/60">#{f.block.toLocaleString("en-US")}</p>
                <p className="mt-[2cqw] line-clamp-2 text-[8.6cqw] leading-tight">{f.question}</p>
                <ul className="mt-[5cqw] space-y-[2.5cqw] font-mono text-[4.8cqw]">
                  {f.options.map(([o, v], k) => (
                    <li key={o} className="flex items-center gap-[3cqw]">
                      <span className="w-[16cqw] truncate uppercase">{o}</span>
                      <span className="h-[4.2cqw] flex-1 bg-developer/12">
                        <span className={`block h-full ${k ? "bg-developer/60" : "bg-developer"}`} style={{ width: `${v}%` }} />
                      </span>
                      <span className="w-[9cqw] text-right tabular-nums">{v}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
            return (
              <li key={f.key}>
                {f.href ? (
                  <Link href={f.href} className="group block">
                    {inner}
                  </Link>
                ) : (
                  <div className="group block">
                    {inner}
                  </div>
                )}
                <p aria-hidden className="mt-1 font-mono text-[9px] tracking-[0.2em] text-silver/60">
                  {String(i + 1).padStart(2, "0")}A
                </p>
              </li>
            );
          })}
        </ol>
      </div>
      <p className="mt-6 font-mono text-xs">
        <Link href="/records" className="text-paper underline-offset-4 hover:underline">
          All records →
        </Link>
      </p>
    </section>
  );
}
