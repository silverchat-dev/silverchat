import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { AnswerPanel } from "@/components/answer-panel";
import { Print } from "@/components/print";
import { Proof } from "@/components/proof";
import { RefundButton } from "@/components/refund-button";
import { Figures, Page, label, quiet } from "@/components/journal";
import { SaveButton } from "@/components/you";
import { topicOf } from "@/lib/content";
import { people, span, tokens } from "@/lib/format";
import { db } from "@/lib/server/db";
import { displayTime } from "@/lib/server/eligibility";
import { serialize } from "@/lib/server/polls";

export const dynamic = "force-dynamic";

const REFUND_AFTER = 7 * 86_400;

const load = cache(async (id: string) => {
  if (!/^\d{1,20}$/.test(id)) return null;
  const row = await db.poll(id);
  return row ? { ...serialize(row), answers: await db.answerCount(id) } : null;
});

export async function generateMetadata({ params }: PageProps<"/poll/[id]">): Promise<Metadata> {
  const poll = await load((await params).id);
  const q = poll?.content?.questions[0];
  return q
    ? { title: `${q.q} · silverchat`, description: `A poll on Silverchat: ${q.q} ${q.options.join(" / ")}` }
    : { title: "Poll · silverchat" };
}

export default async function PollPage({ params }: PageProps<"/poll/[id]">) {
  const poll = await load((await params).id);
  if (!poll) notFound();
  const now = await displayTime();
  const open = poll.status === "open" && poll.closesAt > now;
  const developing = poll.status === "open" && !open;
  const refundable = developing && now > poll.closesAt + REFUND_AFTER;
  const { content } = poll;
  const topic = topicOf(content);

  const answers = poll.answers.toLocaleString("en-US");
  const q = content?.questions[0].q ?? "";
  // a long question steps down a size, so it still reads as one block in a narrow panel
  const size = q.length > 120 ? "text-[clamp(1.6rem,3.6vw,2.2rem)]" : "text-[clamp(1.95rem,4.4vw,2.85rem)]";

  return (
    <Page>
      <header className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <p className={label}>
            <Link href="/pulse" className="transition-colors hover:text-paper">
              Pulse
            </Link>{" "}
            · Poll No. {poll.id}
            {topic && ` · ${topic}`}
          </p>
          <SaveButton id={poll.id} />
        </div>
        {content ? (
          <div className="space-y-4">
            <h1 className={`${size} leading-[1.08] tracking-[-0.01em] text-balance`}>{content.questions[0].q}</h1>
            {content.questions.slice(1).map((q, i) => (
              <h2 key={i} className="text-[clamp(1.35rem,3vw,1.75rem)] leading-snug text-balance text-paper/85">
                <span className="mr-2 font-mono text-xs text-silver">{i + 2}.</span>
                {q.q}
              </h2>
            ))}
          </div>
        ) : poll.hidden ? (
          <>
            <h1 className="text-[clamp(1.75rem,3.8vw,2.4rem)] leading-tight text-balance">This poll was removed from Silverchat.</h1>
            <p className="max-w-[34em] text-[1.075rem] leading-relaxed text-paper/80">
              Its question broke the{" "}
              <Link href="/docs#questions" className={quiet}>
                rules for questions
              </Link>
              . It stays on Ethereum, and answers given before it was removed still count and are paid by the normal rules.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-[clamp(1.75rem,3.8vw,2.4rem)] leading-tight text-balance">The question for this poll was never published.</h1>
            <p className="break-all font-mono text-xs text-silver">Its hash on Ethereum: {poll.contentHash}</p>
          </>
        )}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-1 font-mono text-[12px] text-paper/85">
          {!open && <span aria-hidden className={`size-2 rounded-full ${poll.status === "final" ? "bg-paper" : "border border-silver"}`} />}
          {open ? (
            <>
              <span className="inline-flex items-center gap-2">
                <span className="block h-1 w-16 overflow-hidden rounded-full bg-paper/12" aria-hidden>
                  <span className="block h-full rounded-full bg-paper" style={{ width: `${Math.min(1, poll.answers / poll.breadth) * 100}%` }} />
                </span>
                {answers} of {people(poll.breadth)} answered
              </span>
              <span className="text-silver">closes in {span(poll.closesAt - now)}</span>
            </>
          ) : poll.status === "final" ? (
            "Fixed on Ethereum"
          ) : poll.status === "refunded" ? (
            "Refunded to the asker"
          ) : (
            `Closed · ${answers} answers · developing`
          )}
        </p>
      </header>

      {content && open && <AnswerPanel pollId={poll.id} content={content} open />}
      {content && poll.status === "final" && poll.tally && <Print content={content} tally={poll.tally} />}
      {developing && !refundable && (
        <p className="max-w-[30em] border-l border-paper/25 pl-5 text-xl leading-snug text-paper/85 italic">
          The poll is closed and the print is in the developer. The result is usually fixed on-chain within a few minutes.
        </p>
      )}
      {refundable && <RefundButton pollId={poll.id} asker={poll.asker} cost={poll.cost} />}

      <section aria-label="This poll" className="border-t border-paper/20 pt-6">
        <Figures
          columns={3}
          items={[
            { label: "Asks", value: people(poll.breadth), note: "people" },
            { label: "Paid in", value: tokens(poll.cost), note: "ZC paid to ask" },
          ]}
        />
      </section>

      <Proof poll={poll} />
    </Page>
  );
}
