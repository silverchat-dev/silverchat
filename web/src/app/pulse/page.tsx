import type { Metadata } from "next";
import Link from "next/link";

import { people, span, tokens } from "@/lib/format";
import type { Content } from "@/lib/content";
import { db } from "@/lib/server/db";
import { chainTime } from "@/lib/server/eligibility";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pulse · silverchat" };

const displayTime = () => chainTime().catch(() => Math.floor(Date.now() / 1000));

export default async function PulsePage() {
  const now = await displayTime();
  const live = (await db.polls(60, "open")).filter((p) => p.closes_at > now);

  return (
    <section className="space-y-10 px-5 py-10 sm:px-8 md:py-14">
      <header className="mx-auto max-w-6xl space-y-4">
        <h1 className="text-5xl leading-tight">Pulse</h1>
        <p className="max-w-2xl text-lg leading-relaxed text-paper/80">
          Every question open right now, laid out like a contact sheet. Pick a frame to answer it.
        </p>
      </header>

      {live.length ? (
        <ol className="mx-auto grid max-w-6xl grid-cols-[repeat(auto-fill,minmax(17rem,1fr))]">
          {live.map((p, i) => {
            const q = p.content ? (JSON.parse(p.content) as Content).questions[0].q : null;
            const filled = Math.min(1, (p.answers ?? 0) / p.breadth);
            return (
              <li key={p.id} className="film">
                <span aria-hidden className="absolute left-3 top-[14px] font-mono text-[9px] leading-none tracking-[0.2em] text-paper/40">
                  {i + 1} ▸ SILVERCHAT {p.id}
                </span>
                <Link
                  href={`/poll/${p.id}`}
                  className="flex h-full min-h-40 flex-col sm:min-h-56 justify-between gap-6 bg-paper p-5 text-developer outline-offset-4 transition-[filter] duration-300 hover:brightness-[1.04]"
                >
                  <span className="line-clamp-4 text-xl leading-snug">{q ?? "Question not published"}</span>
                  <span className="space-y-2 font-mono text-xs">
                    <span className="block h-1.5 bg-developer/10" aria-hidden>
                      <span className="block h-full bg-developer" style={{ width: `${filled * 100}%` }} />
                    </span>
                    <span className="flex justify-between gap-3 text-developer/70">
                      <span>
                        {(p.answers ?? 0).toLocaleString("en-US")} / {people(p.breadth)}
                      </span>
                      <span>{tokens(p.cost)} ZC</span>
                      <span>{span(p.closes_at - now)}</span>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="film mx-auto max-w-xl">
          <div className="space-y-4 bg-paper/5 p-8 text-center">
            <p className="text-2xl">No questions are open right now.</p>
            <Link href="/ask" className="inline-block bg-paper px-5 py-2.5 font-mono text-sm text-developer">
              Ask the first one
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
