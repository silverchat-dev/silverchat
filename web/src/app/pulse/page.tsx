import type { Metadata } from "next";
import Link from "next/link";

import { Empty, Figures, Page, PageHead, Part, action, quiet } from "@/components/journal";
import { Topics, pickTopic } from "@/components/topics";
import { topicOf, type Content } from "@/lib/content";
import { lead, people, span, tokens } from "@/lib/format";
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
    <Page>
      <PageHead stop="pulse" art={<PostArt />}>
        Every question open right now, in the order the{" "}
        <Link href="/algorithm" className={quiet}>
          published rules
        </Link>{" "}
        give. Answer with a signature: no gas, and nobody sees who you are.
      </PageHead>

      {!topic && <NetworkNow />}

      <Part title={topic ? `Open now · ${topic}` : "Open now"} more={<span className="text-silver">{live.length || ""}</span>}>
        <Topics base="/pulse" active={topic} />
        {live.length ? (
          <ol className="ruled -mx-2">
            {live.map((p) => {
              const q = p.parsed?.questions[0].q ?? null;
              const t = topicOf(p.parsed);
              const filled = Math.min(1, (p.answers ?? 0) / p.breadth);
              return (
                <li key={p.id}>
                  <Link href={`/poll/${p.id}`} className="group grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-start gap-x-3 rounded-md px-2 py-4 transition-colors hover:bg-paper/[0.04]">
                    <span className="pt-1 font-mono text-xs text-silver tabular-nums">{String(p.n).padStart(2, "0")}</span>
                    <span className="space-y-2.5">
                      <span className="line-clamp-3 block text-[1.2rem] leading-snug text-balance">{q ?? "Question not published"}</span>
                      <span className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-silver">
                        <span className="inline-flex items-center gap-2">
                          <span className="block h-1 w-16 overflow-hidden rounded-full bg-paper/12" aria-hidden>
                            <span className="block h-full rounded-full bg-tap" style={{ width: `${filled * 100}%` }} />
                          </span>
                          {(p.answers ?? 0).toLocaleString("en-US")} of {people(p.breadth)}
                        </span>
                        <span>{tokens(p.cost)} ZC</span>
                        <span>closes in {span(p.closes_at - now)}</span>
                        {t && <span className="uppercase tracking-[0.12em]">{t}</span>}
                      </span>
                    </span>
                    <span aria-hidden className="pt-1 font-mono text-sm text-silver transition-transform group-hover:translate-x-0.5 group-hover:text-paper">
                      →
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        ) : (
          <Empty
            then={
              <Link href="/ask" className={action}>
                Ask the first one
              </Link>
            }
          >
            {topic ? `No questions about ${topic.toLowerCase()} are open right now.` : "The post is bare. No questions are open right now."}
          </Empty>
        )}
      </Part>
    </Page>
  );
}

/** The last 24 hours across the whole network, and the newest fixed results. */
async function NetworkNow() {
  const [s, fixed] = await Promise.all([stats(), db.polls(4, "final")]);
  return (
    <>
      <Part title="The network · last 24 hours" more={<Link href="/stats" className={quiet}>Every number since launch</Link>}>
        <Figures
          items={[
            { label: "Answers", value: s.dayAnswers.toLocaleString("en-US") },
            { label: "ZC paid in", value: s.daySpent === null ? "·" : tokens(s.daySpent, 0) },
            { label: "ZC burned", value: tokens(s.dayBurned, 0) },
          ]}
        />
      </Part>

      {fixed.length > 0 && (
        <Part title="Just fixed" more={<Link href="/records" className={quiet}>All results</Link>}>
          <ol className="grid gap-3 sm:grid-cols-2">
            {fixed.map((p) => {
              const content = p.content ? (JSON.parse(p.content) as Content) : null;
              const top = lead(content, p.tally);
              return (
                <li key={p.id}>
                  <Link href={`/poll/${p.id}`} className="flex h-full items-start gap-4 rounded-lg border border-paper/15 p-4 transition-colors hover:border-paper/40">
                    <span className="w-16 shrink-0 text-3xl leading-none tabular-nums">{top ? `${top.share}%` : "·"}</span>
                    <span className="min-w-0 space-y-1">
                      <span className="block truncate font-mono text-[11px] uppercase tracking-[0.12em] text-silver">{top?.option ?? "no answers"}</span>
                      <span className="line-clamp-2 block text-[0.95rem] leading-snug text-paper/85">{content?.questions[0].q ?? "Question not published"}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </Part>
      )}
    </>
  );
}

/** The poll post on Evelor hill, in ink: a board on a stake, five knobs lit in turn. */
function PostArt() {
  return (
    <svg viewBox="0 0 120 120" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M58 46 L57 112 M63 46 L64 112" />
      <rect x="22" y="18" width="76" height="34" rx="2" transform="rotate(-3 60 35)" />
      <path d="M32 36 L88 33" strokeWidth="0.8" opacity="0.6" />
      {[34, 47, 60, 73, 86].map((x, i) => (
        <circle key={x} cx={x} cy={35.5 - i * 0.6} r="3.4" fill={i === 2 ? "var(--color-tap)" : "none"} stroke={i === 2 ? "var(--color-tap)" : "currentColor"} />
      ))}
      <path d="M30 112 Q 60 104 92 112" strokeWidth="1" opacity="0.6" />
      <path d="M40 112 l-3 -8 M46 112 l1 -9 M74 112 l-2 -7 M82 112 l3 -8" strokeWidth="0.9" opacity="0.55" />
    </svg>
  );
}
