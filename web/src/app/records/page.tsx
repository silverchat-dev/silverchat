import type { Metadata } from "next";
import Link from "next/link";

import type { Tally } from "@/lib/algorithm";
import type { Content } from "@/lib/content";
import { EXPLORER } from "@/lib/config";
import { pct, short, tokens } from "@/lib/format";
import { db } from "@/lib/server/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Records · silverchat" };

function lead(content: Content | null, tally: Tally | null | undefined) {
  if (!content || !tally?.answers) return null;
  const counts = tally.totals[0];
  const k = counts.indexOf(Math.max(...counts));
  return { option: content.questions[0].options[k], share: pct(counts[k], tally.answers) };
}

export default async function RecordsPage() {
  const fixed = await db.polls(100, "final");

  return (
    <section className="mx-auto max-w-6xl space-y-10 px-5 py-10 sm:px-8 md:py-14">
      <header className="space-y-4">
        <h1 className="text-5xl leading-tight">Records</h1>
        <p className="max-w-2xl text-lg leading-relaxed text-paper/80">
          Every print keeps its negative. These are the fixed results, newest first, each with the root it was fixed under
          on Ethereum. Where the ZC went is on the{" "}
          <Link href="/stats" className="underline underline-offset-4">
            stats page
          </Link>
          .
        </p>
      </header>

      {fixed.length ? (
        <ol className="divide-y divide-silver/20 border-y border-silver/20">
          {fixed.map((p) => {
            const content = p.content ? (JSON.parse(p.content) as Content) : null;
            const top = lead(content, p.tally);
            return (
              <li key={p.id} className="grid gap-5 py-6 md:grid-cols-[14rem_minmax(0,1fr)_14rem] md:items-center">
                <Link href={`/poll/${p.id}`} className="grid gap-5 md:col-span-2 md:grid-cols-[14rem_minmax(0,1fr)] md:items-center">
                  <span className="film block">
                    <span className="block bg-tray px-4 py-5 text-center">
                      <span className="block text-4xl leading-none text-paper">{top ? `${top.share}%` : "·"}</span>
                      <span className="mt-2 block truncate font-mono text-[11px] uppercase tracking-[0.14em] text-paper/60">{top?.option ?? "no answers"}</span>
                    </span>
                  </span>
                  <span className="min-w-0 space-y-2">
                    <span className="block font-mono text-xs uppercase tracking-[0.14em] text-silver">No. {p.id}</span>
                    <span className="line-clamp-2 text-2xl leading-snug">{content?.questions[0].q ?? "Question not published"}</span>
                  </span>
                </Link>
                <dl className="space-y-1 font-mono text-xs text-silver">
                  <div className="flex justify-between gap-3">
                    <dt>Answers</dt>
                    <dd className="text-paper/85">{(p.tally?.answers ?? p.answers ?? 0).toLocaleString("en-US")}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Paid</dt>
                    <dd className="text-paper/85">{tokens(p.cost)} ZC</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Asked at</dt>
                    <dd className="text-paper/85">block {Number(p.block).toLocaleString("en-US")}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Root</dt>
                    <dd>
                      {p.finalize_tx?.startsWith("0x") ? (
                        <a href={`${EXPLORER}/tx/${p.finalize_tx}`} target="_blank" rel="noreferrer" className="text-paper/85 underline-offset-4 hover:underline">
                          {p.result_root ? short(p.result_root) : "·"}
                        </a>
                      ) : (
                        <span className="text-paper/85">{p.result_root ? short(p.result_root) : "·"}</span>
                      )}
                    </dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="space-y-5">
          <p className="text-xl text-paper/80">No results are fixed yet. The first one appears here a few minutes after a poll closes.</p>
          <Link href="/ask" className="inline-block bg-paper px-5 py-2.5 font-mono text-sm text-developer">
            Ask a question
          </Link>
        </div>
      )}
    </section>
  );
}
