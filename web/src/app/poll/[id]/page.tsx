import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { AnswerPanel } from "@/components/answer-panel";
import { Print } from "@/components/print";
import { Proof } from "@/components/proof";
import { RefundButton } from "@/components/refund-button";
import { people, span, tokens } from "@/lib/format";
import { db } from "@/lib/server/db";
import { chainTime } from "@/lib/server/eligibility";
import { serialize } from "@/lib/server/polls";

export const dynamic = "force-dynamic";

const REFUND_AFTER = 7 * 86_400;

const load = cache(async (id: string) => {
  if (!/^\d{1,20}$/.test(id)) return null;
  const row = await db.poll(id);
  return row ? { ...serialize(row), answers: await db.answerCount(id) } : null;
});

/** Chain time for display; a slow RPC must not break the page an asker lands on right after paying. */
const displayTime = () => chainTime().catch(() => Math.floor(Date.now() / 1000));

export async function generateMetadata({ params }: PageProps<"/poll/[id]">): Promise<Metadata> {
  const poll = await load((await params).id);
  return { title: poll?.content ? `${poll.content.questions[0].q} · silverchat` : "Poll · silverchat" };
}

export default async function PollPage({ params }: PageProps<"/poll/[id]">) {
  const poll = await load((await params).id);
  if (!poll) notFound();
  const now = await displayTime();
  const open = poll.status === "open" && poll.closesAt > now;
  const developing = poll.status === "open" && !open;
  const refundable = developing && now > poll.closesAt + REFUND_AFTER;
  const { content } = poll;

  return (
    <section className="mx-auto grid max-w-6xl gap-10 px-5 py-10 sm:px-8 md:py-14 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-10">
        <header className="space-y-5">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-silver">
            Poll No. {poll.id} · {people(poll.breadth)} people · {tokens(poll.cost)} ZC
          </p>
          {content ? (
            <>
              <h1 className="text-4xl leading-tight text-balance sm:text-5xl">{content.questions[0].q}</h1>
              {content.questions.slice(1).map((q, i) => (
                <h2 key={i} className="text-3xl leading-tight text-balance text-paper/85">
                  {q.q}
                </h2>
              ))}
            </>
          ) : (
            <h1 className="text-3xl leading-tight">The question for this poll was never published. Its hash is {poll.contentHash}.</h1>
          )}
          <p className="font-mono text-sm text-paper/80">
            {open
              ? `${poll.answers.toLocaleString("en-US")} of ${people(poll.breadth)} paid places answered · closes in ${span(poll.closesAt - now)}`
              : poll.status === "final"
                ? `Fixed on-chain · ${poll.answers.toLocaleString("en-US")} answers`
                : poll.status === "refunded"
                  ? "Refunded to the asker"
                  : `Closed · ${poll.answers.toLocaleString("en-US")} answers · developing`}
          </p>
        </header>

        {content && open && <AnswerPanel pollId={poll.id} content={content} open />}
        {content && poll.status === "final" && poll.tally && <Print content={content} tally={poll.tally} />}
        {developing && (
          <p className="max-w-xl text-lg leading-relaxed text-paper/85">
            The poll is closed and the print is in the developer. The result is usually fixed on-chain within a few minutes.
          </p>
        )}
        {refundable && <RefundButton pollId={poll.id} asker={poll.asker} cost={poll.cost} />}
      </div>
      <div className="lg:sticky lg:top-6 lg:self-start">
        <Proof poll={poll} />
      </div>
    </section>
  );
}
