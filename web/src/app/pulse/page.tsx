import type { Metadata } from "next";
import Link from "next/link";

import { lead, people, span, tokens } from "@/lib/format";
import { Topics, pickTopic } from "@/components/topics";
import { topicOf, type Content } from "@/lib/content";
import { db } from "@/lib/server/db";
import { liveFeed } from "@/lib/server/feed";
import { stats } from "@/lib/server/stats";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pulse · silverchat" };

export default async function PulsePage({ searchParams }: PageProps<"/pulse">) {
  const topic = pickTopic((await searchParams).topic);
  // the whole feed is ranked first, then filtered, so a topic keeps the global order
  const { polls: all, now } = await liveFeed(10_000);
  const live = all
    .map((p, i) => ({ ...p, n: i + 1, parsed: p.content ? (JSON.parse(p.content) as Content) : null }))
    .filter((p) => !topic || topicOf(p.parsed) === topic)
    .slice(0, 60);

  return (
    <section className="mx-auto max-w-6xl space-y-10 px-5 py-10 sm:px-8 md:py-14">
      <header className="space-y-4">
        <h1 className="text-5xl leading-tight">Pulse</h1>
        <p className="max-w-2xl text-lg leading-relaxed text-paper/80">
          Every question open right now, laid out like a contact sheet, in the order the{" "}
          <Link href="/algorithm" className="underline underline-offset-4">
            published rules
          </Link>{" "}
          give. Pick a frame to answer it.
        </p>
        <Topics base="/pulse" active={topic} />
      </header>

      {!topic && <NetworkNow />}

      {live.length ? (
        <ol className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))]">
          {live.map((p) => {
            const q = p.parsed?.questions[0].q ?? null;
            const t = topicOf(p.parsed);
            const filled = Math.min(1, (p.answers ?? 0) / p.breadth);
            return (
              <li key={p.id} className="film">
                <span aria-hidden className="absolute left-3 top-[14px] font-mono text-[9px] leading-none tracking-[0.2em] text-paper/40">
                  {p.n} ▸ SILVERCHAT {p.id}
                  {t && ` ▸ ${t.toUpperCase()}`}
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
            <p className="text-2xl">{topic ? `No questions under ${topic} are open right now.` : "No questions are open right now."}</p>
            <Link href="/ask" className="inline-block bg-paper px-5 py-2.5 font-mono text-sm text-developer">
              Ask the first one
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}

/** The last 24 hours across the whole network, and the newest fixed results. */
async function NetworkNow() {
  const [s, fixed] = await Promise.all([stats(), db.polls(4, "final")]);
  const figures: [string, string][] = [
    ["Answers", s.dayAnswers.toLocaleString("en-US")],
    ["ZC paid in", s.daySpent === null ? "·" : tokens(s.daySpent, 0)],
    ["ZC burned", tokens(s.dayBurned, 0)],
  ];

  return (
    <section aria-labelledby="now" className={`grid gap-3 ${fixed.length ? "lg:grid-cols-[20rem_minmax(0,1fr)]" : ""}`}>
      <div className="space-y-5 bg-tray p-6">
        <h2 id="now" className="font-mono text-xs uppercase tracking-[0.14em] text-silver">
          The network now · last 24 hours
        </h2>
        <dl className={`grid gap-4 sm:grid-cols-3 ${fixed.length ? "lg:grid-cols-1" : ""}`}>
          {figures.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-4 sm:block sm:space-y-1">
              <dt className="font-mono text-[11px] uppercase tracking-[0.14em] text-silver">{k}</dt>
              <dd className="text-[clamp(1.5rem,3vw,2.25rem)] leading-none tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        <Link href="/stats" className="inline-block font-mono text-xs text-paper/80 underline underline-offset-4 hover:text-paper">
          Every number since launch
        </Link>
      </div>

      {fixed.length > 0 && (
        <ol className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Just fixed">
          {fixed.map((p) => {
            const content = p.content ? (JSON.parse(p.content) as Content) : null;
            const top = lead(content, p.tally);
            return (
              <li key={p.id}>
                <Link
                  href={`/poll/${p.id}`}
                  className="flex h-full min-h-44 flex-col justify-between gap-4 bg-[url(/plates/paper.webp)] bg-cover p-4 text-developer transition-[filter] duration-300 hover:brightness-[1.04]"
                >
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-developer/60">Fixed · No. {p.id}</span>
                  <span className="space-y-1">
                    <span className="block text-4xl leading-none tabular-nums">{top ? `${top.share}%` : "·"}</span>
                    <span className="line-clamp-2 font-mono text-[11px] uppercase tracking-[0.12em]">{top?.option ?? "no answers"}</span>
                  </span>
                  <span className="line-clamp-3 text-sm leading-snug text-developer/80">{content?.questions[0].q ?? "Question not published"}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
