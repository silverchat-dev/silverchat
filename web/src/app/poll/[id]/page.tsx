import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { AnswerPanel } from "@/components/answer-panel";
import type { Content } from "@/lib/content";
import { people, tokens } from "@/lib/format";
import { db } from "@/lib/server/db";
import { chainTime } from "@/lib/server/eligibility";

export const dynamic = "force-dynamic";

const load = cache(async (id: string) => {
  if (!/^\d{1,20}$/.test(id)) return null;
  const row = await db.poll(id);
  return row ? { row, content: row.content ? (JSON.parse(row.content) as Content) : null } : null;
});

/** Chain time for display; a slow RPC must not break the page an asker lands on right after paying. */
const displayTime = () => chainTime().catch(() => Math.floor(Date.now() / 1000));

export async function generateMetadata({ params }: PageProps<"/poll/[id]">): Promise<Metadata> {
  const poll = await load((await params).id);
  return { title: poll?.content ? `${poll.content.questions[0].q} · silverchat` : "Poll · silverchat" };
}

export default async function PollPage({ params }: PageProps<"/poll/[id]">) {
  const { id } = await params;
  const poll = await load(id);
  if (!poll) notFound();
  const { row, content } = poll;
  const open = row.status === "open" && row.closes_at > (await displayTime());

  return (
    <section className="mx-auto max-w-3xl space-y-10 px-5 py-10 sm:px-8 md:py-14">
      <header className="space-y-5">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-silver">
          Poll No. {row.id} · {people(row.breadth)} people · {tokens(row.cost)} ZC
        </p>
        {content ? (
          <>
            <h1 className="text-4xl leading-tight sm:text-5xl">{content.questions[0].q}</h1>
            {content.questions.slice(1).map((q, i) => (
              <h2 key={i} className="text-3xl leading-tight text-paper/85">
                {q.q}
              </h2>
            ))}
          </>
        ) : (
          <h1 className="text-3xl leading-tight">The question for this poll was never published.</h1>
        )}
        <p className="font-mono text-sm text-paper/80">
          {(await db.answerCount(row.id)).toLocaleString("en-US")} answers so far ·{" "}
          {open ? `closes ${new Date(row.closes_at * 1000).toUTCString().slice(5, 22)} UTC` : "closed"}
        </p>
      </header>
      {content && <AnswerPanel pollId={row.id} content={content} open={open} />}
    </section>
  );
}
