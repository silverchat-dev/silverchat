import { chapter } from "@/lib/config";

const PAIRS = [
  ["People pay zipcoins to put a question to a broad slice of the network. Pay more, and more people hear it.", "Pay $ZC to ask. Breadth sets how many holders it reaches."],
  ["Clients check the proofs and reject any update that breaks the rules.", "Each result root goes on Ethereum. Your browser recounts it."],
  ["A new algorithm hash only counts after a twenty-day delay.", "SilverAlgorithm holds the rules hash, with the same twenty days."],
  ["Votes are anonymous. Results split by what people say about themselves.", "Answers are published without addresses. Region and age are optional."],
];

/** What chapter 27 describes, next to what is built here. */
export function Book() {
  return (
    <section aria-labelledby="book-title" className="relative overflow-hidden border-y border-silver/15 bg-tray/40">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 md:py-28 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
        <div className="relative">
          {/* the chapter number, set like a running head in a book */}
          <p aria-hidden className="text-[clamp(8rem,22vw,18rem)] leading-[0.8] text-paper/[0.07] select-none">27</p>
          <div className="mt-[-0.4em] space-y-4 lg:sticky lg:top-24">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-silver">From the book</p>
            <h2 id="book-title" className="text-[clamp(2rem,4.2vw,3.5rem)] leading-[1.05]">
              It starts in chapter 27.
            </h2>
            <p className="max-w-sm text-lg leading-relaxed text-paper/75">
              In Snowmoon, Vitalik Buterin&apos;s novel, a network answers questions people pay to ask. Silverchat builds it on
              Ethereum, with $ZC.
            </p>
            <p className="flex flex-wrap items-baseline gap-x-5 gap-y-2 pt-2 font-mono text-xs text-silver">
              <a href={chapter(27)} target="_blank" rel="noreferrer" className="text-paper underline-offset-4 hover:underline">
                Read chapter 27 →
              </a>
              <span>We are not affiliated with the author.</span>
            </p>
          </div>
        </div>

        <div>
          <div className="hidden grid-cols-2 gap-8 border-b border-silver/25 pb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-silver sm:grid">
            <span>In the book</span>
            <span>Here</span>
          </div>
          <ol>
            {PAIRS.map(([book, here]) => (
              <li key={here} className="grid gap-3 border-b border-silver/15 py-7 sm:grid-cols-2 sm:gap-8">
                <p className="text-xl leading-snug text-paper/60 italic">
                  <span className="mb-1 block font-mono text-[10px] not-italic uppercase tracking-[0.2em] text-silver sm:hidden">In the book</span>
                  {book}
                </p>
                <p className="text-xl leading-snug">
                  <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.2em] text-silver sm:hidden">Here</span>
                  {here}
                </p>
              </li>
            ))}
          </ol>
          <p className="mt-7 max-w-xl text-base leading-relaxed text-paper/70">
            Ours, not the book&apos;s: paying the people who answer, the $SC token, and the split of every payment.
          </p>
        </div>
      </div>
    </section>
  );
}
