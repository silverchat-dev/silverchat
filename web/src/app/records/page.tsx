import type { Metadata } from "next";
import Link from "next/link";

import { Empty, Page, PageHead, Part, action, quiet } from "@/components/journal";
import { Topics, pickTopic } from "@/components/topics";
import { topicOf, type Content } from "@/lib/content";
import { EXPLORER } from "@/lib/config";
import { lead, short, tokens } from "@/lib/format";
import { db, type PollRow } from "@/lib/server/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Records · silverchat" };

// the day a result was fixed, as a ledger writes it; results from before that time was kept go under "Earlier"
const day = (ts: number | null | undefined) =>
  ts ? new Date(ts * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "Earlier";

export default async function RecordsPage({ searchParams }: PageProps<"/records">) {
  const topic = pickTopic((await searchParams).topic);
  // filters the newest 500 in memory; add a topic column and index when records outgrow that
  const fixed = (await db.polls(topic ? 500 : 100, "final"))
    .map((p) => ({ ...p, parsed: p.content ? (JSON.parse(p.content) as Content) : null }))
    .filter((p) => !topic || topicOf(p.parsed) === topic)
    .slice(0, 100);

  // the ledger's pages: one heading per day, rows kept in the order they came
  const days: { day: string; rows: typeof fixed }[] = [];
  for (const p of fixed) {
    const d = day(p.finalize_at);
    const last = days.at(-1);
    if (last?.day === d) last.rows.push(p);
    else days.push({ day: d, rows: [p] });
  }

  return (
    <Page>
      <PageHead
        stop="library"
        art={<ShelfArt />}
        aside={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[13px]">
            <Link href="/docs" className={quiet}>
              The open API
            </Link>
            <span aria-hidden className="text-silver">
              ·
            </span>
            <Link href="/stats" className={quiet}>
              Where the ZC went
            </Link>
          </span>
        }
      >
        Every result ever fixed, newest first. Each one is sealed on Ethereum under a root, and you can check that root
        yourself.
      </PageHead>

      <Part title={topic ? `The ledger · ${topic}` : "The ledger"} more={fixed.length > 0 && <span className="text-silver tabular-nums">{fixed.length} shown</span>}>
        <Topics base="/records" active={topic} />
        {fixed.length ? (
          <div className="space-y-8 pt-2">
            {days.map((d) => (
              <section key={d.day} aria-labelledby={`day-${d.rows[0].id}`}>
                <h3 id={`day-${d.rows[0].id}`} className="flex items-center gap-3 pb-1 font-mono text-[11px] uppercase tracking-[0.16em] text-silver">
                  {d.day}
                  <span aria-hidden className="h-px flex-1 bg-paper/15" />
                </h3>
                <ol className="ruled -mx-2">
                  {d.rows.map((p) => (
                    <Entry key={p.id} p={p} />
                  ))}
                </ol>
              </section>
            ))}
          </div>
        ) : (
          <Empty
            then={
              <Link href="/ask" className={action}>
                Ask a question
              </Link>
            }
          >
            {topic
              ? `No results under ${topic.toLowerCase()} are fixed yet.`
              : "The shelves are bare. The first result goes here a few minutes after a poll closes."}
          </Empty>
        )}
      </Part>
    </Page>
  );
}

/** One line of the ledger: the answer most gave and its share, the question, and what fixed it on Ethereum. */
function Entry({ p }: { p: PollRow & { parsed: Content | null } }) {
  const content = p.parsed;
  const t = topicOf(content);
  const top = lead(content, p.tally);
  const root = p.result_root ? short(p.result_root) : "·";
  return (
    <li className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-4 px-2 py-5 sm:grid-cols-[5.75rem_minmax(0,1fr)] sm:gap-x-5">
      <Link href={`/poll/${p.id}`} className="group col-span-2 grid grid-cols-subgrid items-start">
        <span className="space-y-2 pt-0.5">
          <span className="block text-[1.9rem] leading-none tabular-nums sm:text-[2.3rem]">{top ? `${top.share}%` : "·"}</span>
          <span className="block h-[3px] overflow-hidden rounded-full bg-paper/12" aria-hidden>
            <span className="block h-full rounded-full bg-paper/60" style={{ width: `${top?.share ?? 0}%` }} />
          </span>
        </span>
        <span className="min-w-0 space-y-1.5">
          <span className="block font-mono text-[11px] uppercase tracking-[0.14em] text-silver">
            No. {p.id}
            {t && ` · ${t}`}
          </span>
          <span className="line-clamp-3 block text-[1.2rem] leading-snug text-balance decoration-paper/30 underline-offset-4 group-hover:underline">
            {content?.questions[0].q ?? "Question not published"}
          </span>
          <span className="block text-[0.95rem] italic text-paper/80">{top ? `Most said: ${top.option}` : "No answers"}</span>
        </span>
      </Link>
      <dl className="col-start-2 mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] text-silver">
        <div className="flex gap-1.5">
          <dt>Answers</dt>
          <dd className="text-paper/85 tabular-nums">{(p.tally?.answers ?? p.answers ?? 0).toLocaleString("en-US")}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt>Paid</dt>
          <dd className="text-paper/85 tabular-nums">{tokens(p.cost)} ZC</dd>
        </div>
        <div className="flex gap-1.5">
          <dt>Asked at</dt>
          <dd className="text-paper/85 tabular-nums">block {Number(p.block).toLocaleString("en-US")}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt>Root</dt>
          <dd>
            {p.finalize_tx?.startsWith("0x") ? (
              <a href={`${EXPLORER}/tx/${p.finalize_tx}`} target="_blank" rel="noreferrer" className={`text-paper/85 ${quiet}`}>
                {root}
              </a>
            ) : (
              <span className="text-paper/85">{root}</span>
            )}
          </dd>
        </div>
      </dl>
    </li>
  );
}

/** The wall of the grand library, in ink: two full shelves, and one book drawn half out in green. */
function ShelfArt() {
  // book spines as [x, width, height], standing on the shelf at y
  const shelf = (y: number, books: [number, number, number][]) =>
    books.map(([x, w, h]) => <rect key={`${y}-${x}`} x={x} y={y - h} width={w} height={h} rx="0.8" />);
  return (
    <svg viewBox="0 0 120 120" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 10 V108 M106 10 V108 M8 108 H112 M14 10 H106" />
      <path d="M14 58 H106" />
      <g strokeWidth="0.95">
        {shelf(58, [[19, 8, 34], [28, 7, 40], [36, 9, 31], [47, 7, 38], [55, 8, 42], [67, 7, 33], [75, 9, 39], [85, 7, 36], [93, 8, 41]])}
        {shelf(108, [[19, 7, 38], [27, 9, 42], [37, 8, 33], [57, 7, 40], [65, 8, 35], [74, 7, 42], [82, 9, 37], [93, 8, 34]])}
      </g>
      <path d="M22 30 H25 M31 26 H33 M58 24 H61 M78 27 H82 M96 25 H99 M30 76 H34 M60 76 H62 M76 74 H79 M85 79 H89" strokeWidth="0.8" opacity="0.6" />
      {/* the record you came for, drawn half out of its place on the lower shelf */}
      <rect x="45" y="67" width="8" height="41" rx="0.8" transform="rotate(-15 49 108)" fill="var(--color-tap)" stroke="var(--color-tap)" />
    </svg>
  );
}
