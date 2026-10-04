import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { erc20Abi } from "viem";

import { SolvePanel } from "@/components/riddle";
import { riddleAbi } from "@/lib/abi";
import { ADDR, EXPLORER, GITHUB_URL, ZERO } from "@/lib/config";
import { short, tokens } from "@/lib/format";
import { publicClient } from "@/lib/server/chain";

export const dynamic = "force-dynamic";
// static metadata would ship even with the 404, so it is built only once the riddle is live
export const generateMetadata = (): Metadata =>
  ADDR.riddle === ZERO ? {} : { title: "The riddle · silverchat", description: "One riddle on Silverchat, with a prize in $SC for the first who solves it." };

type Riddle = { title: string; text: string[]; lock?: { rows: [string, string][]; rule: string } };

// the riddle that is live, set on the server when it goes live (RIDDLE, JSON), so its text is not public before then
const live = (): Riddle | null => {
  try {
    return JSON.parse(process.env.RIDDLE ?? "null");
  } catch {
    return null;
  }
};

// every riddle so far, closed for good: they stay on the page as its record
const SOLVED = [
  {
    title: "The courtyard",
    address: "0x30B536Faa675484e7051a7B9B285cb67818b392B",
    text: [
      "Zei's watch buzzed over tea. A courtyard he had eaten in once was writing to every guest of half a year, and someone had burned four hundred zipcoins to send it. The envelope said only who it was for.",
      "The courtyard has a token on Silverchat now, launched from the treasury's Realm. Its address on the cryptographic network opens the message. Four hundred zipcoins went to the door that the address and the first word name together. The source keeps four more seals, each over everything said before it; the hash on this page seals it all. Eleven words, each a word of the book. Say the address, then the words.",
    ],
    prize: "1,200,000",
    winner: "0x24fc0FE8459A35FDBB6b109f9F802dDE5A4398F8",
    reveal: "0x5afa289ddcaeffce58e0906571c96514b7efa3624c891817a9d8ce39151b33ee",
    solved: "3 October 2026, 17:45 UTC",
  },
  {
    title: "The count",
    address: "0x48FFB076C0C3F68F7E0E65cC4fA40ce4CA0FC346",
    text: [
      "On the hill in Kalimar the roof closed in ten ticks, and four teas came up the stairs. Seila had a question to ask, and a thousand others to hide it in.",
      "The source remembers seven lines from the book, and leaves one word out of each. Say the words it leaves out, in the order the book says them.",
      "Then say the block the source pinned, digit by digit, the way Zei counted down.",
      "Then say what they all shouted when the count ran out.",
    ],
    prize: "1,000,000",
    winner: "0x67797e1f48c7cdcfde90eb23e3e80b9221485e79",
    reveal: "0xaa3d2b75432becb229ec48b11933e142623dedf08498af26ae66d52b28898ed2",
    solved: "2 October 2026, 17:07 UTC",
  },
];

async function read() {
  const r = { address: ADDR.riddle, abi: riddleAbi } as const;
  const [answerHash, deadline, solved, closed, winner, prize] = await publicClient.multicall({
    contracts: [
      { ...r, functionName: "ANSWER_HASH" },
      { ...r, functionName: "DEADLINE" },
      { ...r, functionName: "solved" },
      { ...r, functionName: "closed" },
      { ...r, functionName: "winner" },
      { address: ADDR.sc, abi: erc20Abi, functionName: "balanceOf", args: [ADDR.riddle] },
    ],
    allowFailure: false,
  });
  return { answerHash, deadline: Number(deadline), solved, closed, winner, prize };
}

const utc = (ts: number) => `${new Date(ts * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`;

export default async function RiddlePage() {
  // nothing shows until SilverRiddle is deployed: the seven days start then, not when this page ships
  if (ADDR.riddle === ZERO) notFound();
  // the live riddle's own text; a contract with no text set is one of the solved ones
  const solvedHere = SOLVED.find((e) => e.address.toLowerCase() === ADDR.riddle.toLowerCase());
  const RIDDLE: Riddle = live() ?? solvedHere ?? { title: "The riddle", text: [] };
  const before = SOLVED.filter((e) => e !== solvedHere);
  const r = await read().catch(() => "unread" as const);
  const ready = r && r !== "unread" ? r : null;
  // open for answers only once funded; a solved or closed riddle reads as such whatever its balance
  const opens = !ready || (!ready.solved && !ready.closed && ready.prize === 0n);

  return (
    <section className="mx-auto grid max-w-6xl gap-10 px-5 py-10 sm:px-8 md:py-14 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-10">
        <header className="space-y-6">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-silver">
            {!ready ? "The riddle" : ready.solved ? "Solved · the prize is paid" : ready.closed ? "Closed" : opens ? "Opens soon" : `Prize · ${tokens(ready.prize, 0)} $SC`}
          </p>
          <h1 className="text-5xl leading-tight">{RIDDLE.title}</h1>
          <div className="max-w-2xl space-y-4 text-2xl leading-snug text-paper/90">
            {RIDDLE.text.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
          {RIDDLE.lock && <Lock lock={RIDDLE.lock} />}
          <p className="font-mono text-sm text-paper/80">
            The source remembers.{" "}
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="underline underline-offset-4">
              github.com/silverchat-dev/silverchat
            </a>
          </p>
        </header>

        {r === "unread" ? (
          <p className="text-xl text-paper/80">Ethereum did not answer. Reload the page.</p>
        ) : !ready || opens ? (
          <p className="text-xl text-paper/80">The riddle opens soon.</p>
        ) : ready.solved ? (
          <p className="text-2xl">
            Solved by{" "}
            <a href={`${EXPLORER}/address/${ready.winner}`} target="_blank" rel="noreferrer" className="font-mono underline underline-offset-4">
              {short(ready.winner)}
            </a>
            .
          </p>
        ) : ready.closed ? (
          <p className="text-2xl">Closed. Nobody solved it in time.</p>
        ) : (
          <SolvePanel answerHashOnChain={ready.answerHash} />
        )}
        {before.length > 0 && (
          <section aria-labelledby="solved-before" className="space-y-8 border-t border-silver/25 pt-10">
            <h2 id="solved-before" className="font-mono text-xs uppercase tracking-[0.14em] text-silver">
              Solved before
            </h2>
            {before.map((e) => (
              <article key={e.address} className="space-y-3">
                <h3 className="text-3xl">{e.title}</h3>
                <div className="max-w-2xl space-y-3 text-lg leading-snug text-paper/75">
                  {e.text.map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>
                <p className="font-mono text-xs leading-relaxed text-silver">
                  {e.prize} $SC to{" "}
                  <a href={`${EXPLORER}/address/${e.winner}`} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-paper">
                    {short(e.winner)}
                  </a>{" "}
                  · solved {e.solved} ·{" "}
                  <a href={`${EXPLORER}/tx/${e.reveal}`} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-paper">
                    the winning reveal
                  </a>{" "}
                  ·{" "}
                  <a href={`${EXPLORER}/address/${e.address}`} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-paper">
                    contract
                  </a>
                </p>
              </article>
            ))}
          </section>
        )}
      </div>

      <aside className="space-y-5 self-start bg-tray px-5 py-7 font-mono text-sm sm:px-7 lg:sticky lg:top-6">
        <p className="text-xs uppercase tracking-[0.14em] text-silver">How it works</p>
        <ol className="space-y-3 text-xs leading-relaxed text-paper/85">
          <li>1. Find the answer. Try it as often as you like; the check runs in your browser.</li>
          <li>2. Seal it: one transaction that hides your answer and ties it to your wallet.</li>
          <li>3. Ten blocks later, reveal it. The first right reveal takes the whole prize.</li>
        </ol>
        {ready && (
          <dl className="space-y-2 border-t border-silver/25 pt-4 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-silver">Answer hash</dt>
              <dd>{short(ready.answerHash)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-silver">Reclaim from</dt>
              <dd>{utc(ready.deadline)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-silver">Contract</dt>
              <dd>
                <a href={`${EXPLORER}/address/${ADDR.riddle}`} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
                  {short(ADDR.riddle)}
                </a>
              </dd>
            </div>
          </dl>
        )}
        <p className="border-t border-silver/25 pt-4 text-xs leading-relaxed text-silver">
          After day seven the Safe may take the prize back. Until it does, a right reveal still wins.
        </p>
      </aside>
    </section>
  );
}

/** Numbers a riddle hands over whole, with the rule for working them, each row as it was set. */
function Lock({ lock }: { lock: NonNullable<Riddle["lock"]> }) {
  return (
    <div className="max-w-3xl space-y-4 bg-tray p-5 font-mono text-xs leading-relaxed text-paper/85 sm:p-6">
      <dl className="space-y-3">
        {lock.rows.map(([k, v]) => (
          <div key={k} className="grid gap-1 sm:grid-cols-[5rem_minmax(0,1fr)]">
            <dt className="text-silver">{k}</dt>
            <dd className="break-all">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-paper/70">{lock.rule}</p>
    </div>
  );
}
