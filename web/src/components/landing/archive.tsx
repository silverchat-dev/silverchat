"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { Tally } from "@/lib/algorithm";
import { ADDR, ZERO } from "@/lib/config";
import type { Content } from "@/lib/content";

import { EXAMPLES, Frame, type Negative } from "./negatives";

type Sheet = Negative & { key: string; href?: string };

const examples: Sheet[] = EXAMPLES.map((n) => ({ ...n, key: String(n.block) }));

type Polled = { id: string; block: string; content: Content | null; tally: Tally | null };

function record(p: Polled): Sheet | null {
  const q = p.content?.questions[0];
  const counts = p.tally?.totals[0];
  const total = p.tally?.answers;
  if (!q || !counts || !total) return null;
  const options = q.options.map((o, i) => [o, Math.round((100 * counts[i]) / total)] as [string, number]);
  return { key: p.id, block: Number(p.block), question: q.q, options: options.sort((a, b) => b[1] - a[1]).slice(0, 2), href: `/poll/${p.id}` };
}

/** The latest fixed polls as a contact sheet of negatives; pointing at one prints it. Examples until real ones exist. */
export function Archive() {
  const [real, setReal] = useState<Sheet[] | null>(null);

  useEffect(() => {
    if (ADDR.ask === ZERO) return;
    const ctl = new AbortController();
    fetch("/api/polls?status=final&limit=6", { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { polls: Polled[] } | null) => {
        const frames = (j?.polls ?? []).map(record).filter((f): f is Sheet => f !== null);
        if (frames.length) setReal(frames);
      })
      .catch(() => {});
    return () => ctl.abort();
  }, []);

  const frames = real ?? examples;

  return (
    <section aria-labelledby="archive-title" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 md:py-28">
      <div className="space-y-4">
        <h2 id="archive-title" className="max-w-2xl text-[clamp(2rem,4.2vw,3.5rem)] leading-[1.05]">
          Nothing gets thrown out.
        </h2>
        <p className="max-w-xl text-lg leading-relaxed text-paper/75">
          A fixed poll keeps its question, its count and the transaction that fixed it, for anyone to look up. Point at a
          negative to print it.
        </p>
      </div>

      {/* a contact sheet: the negatives laid out in strips on the light box, numbered along the edge */}
      <div className="mt-12 bg-film p-3 md:p-5">
        <p className="mb-3 flex justify-between font-mono text-[10px] tracking-[0.2em] text-silver">
          <span>{real ? "SILVERCHAT · RECORDS" : "EXAMPLE · NOT REAL RECORDS"}</span>
          <span aria-hidden className="text-silver/60">
            ▸ 1A
          </span>
        </p>
        <ol className="grid grid-cols-2 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
          {frames.map((f) => {
            const film = (
              <div className="relative bg-[url(/plates/film-across.webp)] bg-cover" style={{ aspectRatio: "332 / 456" }}>
                <Frame n={f} across />
                {/* printed: the paper comes up over the negative */}
                <div aria-hidden className="absolute inset-0 opacity-0 transition-opacity duration-700 group-hover:opacity-100 group-focus-visible:opacity-100 group-active:opacity-100">
                  <Frame n={f} across print />
                </div>
              </div>
            );
            return (
              <li key={f.key}>
                {f.href ? (
                  <Link href={f.href} className="group block outline-none focus-visible:ring-1 focus-visible:ring-paper/60">
                    {film}
                  </Link>
                ) : (
                  <div className="group">{film}</div>
                )}
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
