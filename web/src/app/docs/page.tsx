import type { Metadata } from "next";
import Link from "next/link";

import { MIN_HOLD_USD } from "@/lib/algorithm";
import { ADDR, BOOK_URL, chapter, EXPLORER, GITHUB_URL, ZERO } from "@/lib/config";
import { REFUSED } from "@/lib/moderation";
import { USD_PER_PERSON } from "@/lib/server/price";

export const metadata: Metadata = { title: "Docs · silverchat" };

const SECTIONS = [
  ["how", "How it works"],
  ["questions", "Questions"],
  ["book", "From the book"],
  ["contracts", "Contracts"],
  ["api", "API"],
  ["trust", "Trust"],
] as const;

const BOOK: [string, string, number[], string][] = [
  ["Pay to poll", "Pay zipcoins to ask a large cross-section of people. More zipcoins, more people.", [27], "Ask, with breadth and priority, paid in $ZC."],
  ["Proofs", "Silverchat publishes proofs, so clients reject an update that breaks the rules.", [27], "Each result root goes on Ethereum. Your browser recounts it."],
  ["Algorithm hash", "A new algorithm hash only counts after a twenty-day delay.", [27], "SilverAlgorithm holds the hash of the rules file."],
  ["Anonymous answers", "Votes are anonymous. Results split by what people say about themselves.", [27], "Signed answers, recorded without addresses. Optional region and age."],
  ["Open clients", "An open API lets people write their own client and take their data with them.", [3, 8], "Open API and export. Build your own reader."],
  ["Predict", "Silverchat Predict lets people, or bots, bet on future events.", [27], "Not yet."],
  ["Reading the network", "The AI Emerald writes a broad report of what people say.", [10], "Not yet."],
];

export default function DocsPage() {
  const contracts: [string, string][] = [
    ["SilverAsk", ADDR.ask],
    ["SilverAlgorithm", ADDR.algorithm],
    ["$ZC", ADDR.zc],
    ["$SC", ADDR.sc],
  ];

  return (
    <div className="mx-auto grid max-w-6xl gap-12 px-5 py-10 sm:px-8 md:py-14 lg:grid-cols-[12rem_minmax(0,1fr)]">
      <nav aria-label="On this page" className="hidden lg:block">
        <ol className="sticky top-6 space-y-2 font-mono text-xs uppercase tracking-[0.14em] text-silver">
          {SECTIONS.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="hover:text-paper">
                {label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <article className="min-w-0 max-w-3xl space-y-16">
        <header className="space-y-5">
          <h1 className="text-5xl leading-tight">Docs</h1>
          <p className="text-lg leading-relaxed text-paper/80">
            Silverchat is the polling network from{" "}
            <a href={BOOK_URL} target="_blank" rel="noreferrer" className="underline underline-offset-4">
              Snowmoon
            </a>
            , a novel by Vitalik Buterin, built on Ethereum. You pay $ZC to ask the network a question. Holders answer,
            and the result goes on-chain. We are not affiliated with the author.
          </p>
        </header>

        <Section id="how" title="How it works">
          <ol className="space-y-6">
            {[
              ["Ask", `Write a question, choose how many people it asks and how high it shows, and pay in $ZC. It costs $${USD_PER_PERSON} for each person asked, in ZC at the live price; High priority costs 1.2x and Top 1.5x. The contract holds the payment.`],
              ["Answer", `Wallets that held $${MIN_HOLD_USD} of ZC or SC when the poll opened answer by signing. Signing is free. One answer per wallet.`],
              ["Fix", "A few minutes after the poll closes, the result is fixed on Ethereum as a root over every answer. Then the contract pays out: 85% to the people who answered, 5% to the treasury, 10% burned. The part of that 85% nobody earned goes back to the asker."],
              ["Claim", "Answerers claim their share in one transaction. What nobody claims within 90 days is burned."],
              ["Refund", "If a result is not fixed within 7 days after close, the asker takes the whole payment back."],
            ].map(([k, v], i) => (
              <li key={k} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4">
                <span className="font-mono text-sm text-silver">{String(i + 1).padStart(2, "0")}</span>
                <span className="space-y-1">
                  <span className="block text-2xl">{k}</span>
                  <span className="block text-lg leading-relaxed text-paper/80">{v}</span>
                </span>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="questions" title="Questions">
          <p className="text-lg leading-relaxed text-paper/80">
            Anyone who pays can ask, but Silverchat does not publish questions made to smear a project. If a question or
            one of its options has a word from this list, it is refused before you pay. Spelling tricks count too: sc4m and
            s c a m both read as scam.
          </p>
          <ul className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-sm text-silver">
            {REFUSED.map((w) => (
              <li key={w} className="whitespace-nowrap">
                {w}
              </li>
            ))}
          </ul>
          <p className="text-lg leading-relaxed text-paper/80">
            When a question gets past the list, we can take the poll off the site. It stops taking answers and its question
            no longer shows here, but it stays on Ethereum and is fixed like any other poll. Answers given before it was
            removed still count and are paid by the normal rules, and the asker gets back the part nobody earned.
          </p>
        </Section>

        <Section id="book" title="From the book">
          <p className="text-lg leading-relaxed text-paper/80">
            Every feature comes from a chapter. Where we add something, like paying the people who answer, or where we are
            not there yet, the table says so.
          </p>
          <div className="space-y-6 sm:hidden">
            {[...BOOK, ["Ours", "Not in the book.", [], "Paying the people who answer, the $SC token, and the split of each payment."] as (typeof BOOK)[number]].map(([k, book, chapters, here]) => (
              <dl key={k} className="space-y-2 border-t border-silver/20 pt-4">
                <dt className="text-xl">{k}</dt>
                <dd className="text-paper/80">
                  <span className="block font-mono text-[11px] uppercase tracking-[0.14em] text-silver">In Snowmoon {chapters.map((c) => `ch. ${c}`).join(", ")}</span>
                  {book}
                </dd>
                <dd className="text-paper/80">
                  <span className="block font-mono text-[11px] uppercase tracking-[0.14em] text-silver">Here</span>
                  {here}
                </dd>
              </dl>
            ))}
          </div>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[40rem] border-collapse text-left">
              <thead className="font-mono text-xs uppercase tracking-[0.14em] text-silver">
                <tr className="border-b border-silver/30">
                  <th className="py-3 pr-6 font-normal">Feature</th>
                  <th className="py-3 pr-6 font-normal">In Snowmoon</th>
                  <th className="py-3 font-normal">Here</th>
                </tr>
              </thead>
              <tbody>
                {BOOK.map(([k, book, chapters, here]) => (
                  <tr key={k} className="border-b border-silver/15 align-top">
                    <td className="py-4 pr-6 text-lg">{k}</td>
                    <td className="py-4 pr-6 text-paper/80">
                      {book}{" "}
                      {chapters.map((c, i) => (
                        <span key={c}>
                          {i > 0 && ", "}
                          <a href={chapter(c)} target="_blank" rel="noreferrer" className="whitespace-nowrap font-mono text-xs text-silver underline underline-offset-4">
                            ch. {c}
                          </a>
                        </span>
                      ))}
                    </td>
                    <td className="py-4 text-paper/80">{here}</td>
                  </tr>
                ))}
                <tr className="border-b border-silver/15 align-top">
                  <td className="py-4 pr-6 text-lg">Ours</td>
                  <td className="py-4 pr-6 text-paper/60">Not in the book.</td>
                  <td className="py-4 text-paper/80">Paying the people who answer, the $SC token, and the split of each payment.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Section>

        <Section id="contracts" title="Contracts">
          <dl className="divide-y divide-silver/20 border-y border-silver/20 font-mono text-sm">
            {contracts.map(([k, v]) => (
              <div key={k} className="flex flex-wrap justify-between gap-x-6 gap-y-1 py-3">
                <dt className="text-silver">{k}</dt>
                <dd className="break-all">
                  {v === ZERO ? (
                    <span className="text-silver">{k === "$SC" ? "not launched yet, on Stockereum with ZC" : "not deployed"}</span>
                  ) : (
                    <a href={`${EXPLORER}/address/${v}`} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
                      {v}
                    </a>
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-lg leading-relaxed text-paper/80">
            The source is on{" "}
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="underline underline-offset-4">
              GitHub
            </a>
            . The rules the app runs by are one file; see{" "}
            <Link href="/algorithm" className="underline underline-offset-4">
              the rules
            </Link>
            .
          </p>
        </Section>

        <Section id="api" title="API">
          <p className="text-lg leading-relaxed text-paper/80">
            Everything public is open to any client, from any site. Build your own reader; that is how Gladias learned to
            program in the book.
          </p>
          <dl className="space-y-3 font-mono text-sm">
            {[
              ["GET /api/polls?status=open", "open polls in feed order, with the block that seeded it"],
              ["GET /api/polls/{id}", "one poll: question, cost, status, totals once fixed"],
              ["GET /api/polls/{id}/leaves", "every answer of a fixed poll as choices and salt, no addresses"],
              ["GET /api/export", "every poll, for your own copy"],
              ["GET /api/receipt?poll={id}&leaf={leaf}", "proof that one answer is in a fixed result"],
              ["GET /api/health", "head block, indexed block, ZC price and the dollar price per person"],
              ["GET /api/stats", "ZC spent, earned by answerers, returned, treasury, burned, the burn address, and SC holder rewards"],
              ["POST /api/polls", "publish a question and get its hash before you pay"],
              ["POST /api/answer", "a signed answer"],
            ].map(([k, v]) => (
              <div key={k} className="grid gap-1 sm:grid-cols-[18rem_minmax(0,1fr)]">
                <dt className="text-paper">{k}</dt>
                <dd className="text-silver">{v}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section id="trust" title="Trust">
          <ul className="space-y-4 text-lg leading-relaxed text-paper/85">
            {[
              "On Ethereum: the payment, the fixed split, the refund, both roots of every result, the claims and the rules hash.",
              "Run by us: storing questions and choosing which ones show, checking who may answer, collecting answers, counting them, the list of paid answerers, and the feed order.",
              "Our server sees every answer with the wallet that signed it. The public record has the choices without addresses. Region and age are what people say, not checked.",
              "The poster key fixes results. It decides who is paid from the answerers' 85% of a poll, and nothing else. You can recount any result and check your own answer.",
              "The pricer key sets the ZC price per person. You never pay more than the cost you sign.",
              "The rules hash proves what was published and when. It does not prove our server runs it; rerunning the feed does.",
              `One wallet, one answer, with a $${MIN_HOLD_USD} minimum: a sample of the network, not of everyone.`,
              "The contracts are owned by a Safe from launch.",
              "The contracts are not audited. The tokens are volatile. Don't trust this page. Verify it.",
            ].map((t) => (
              <li key={t} className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-3">
                <span aria-hidden className="text-silver">·</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </Section>
      </article>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-8 space-y-6">
      <h2 id={`${id}-title`} className="text-3xl">
        {title}
      </h2>
      {children}
    </section>
  );
}
