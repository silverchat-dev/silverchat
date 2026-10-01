import type { Metadata } from "next";
import { erc20Abi } from "viem";

import { SolvePanel } from "@/components/riddle";
import { riddleAbi } from "@/lib/abi";
import { ADDR, EXPLORER, GITHUB_URL, ZERO } from "@/lib/config";
import { short, tokens } from "@/lib/format";
import { publicClient } from "@/lib/server/chain";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "The riddle · silverchat", description: "One riddle on Silverchat, with a prize in $SC for the first who solves it." };

const RIDDLE = {
  title: "The riddle",
  text: ["The riddle text goes here."],
};

async function read() {
  if (ADDR.riddle === ZERO) return null;
  const r = { address: ADDR.riddle, abi: riddleAbi } as const;
  const [answerHash, deadline, solved, closed, winner, prize] = await Promise.all([
    publicClient.readContract({ ...r, functionName: "ANSWER_HASH" }),
    publicClient.readContract({ ...r, functionName: "DEADLINE" }),
    publicClient.readContract({ ...r, functionName: "solved" }),
    publicClient.readContract({ ...r, functionName: "closed" }),
    publicClient.readContract({ ...r, functionName: "winner" }),
    publicClient.readContract({ address: ADDR.sc, abi: erc20Abi, functionName: "balanceOf", args: [ADDR.riddle] }),
  ]);
  return { answerHash, deadline: Number(deadline), solved, closed, winner, prize };
}

const utc = (ts: number) => `${new Date(ts * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`;

export default async function RiddlePage() {
  const r = await read().catch(() => null);

  return (
    <section className="mx-auto grid max-w-6xl gap-10 px-5 py-10 sm:px-8 md:py-14 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-10">
        <header className="space-y-6">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-silver">{!r ? "Opens soon" : r.solved ? "Solved · the prize is paid" : r.closed ? "Closed" : `Prize · ${tokens(r.prize, 0)} $SC`}</p>
          <h1 className="text-5xl leading-tight">{RIDDLE.title}</h1>
          <div className="max-w-2xl space-y-4 text-2xl leading-snug text-paper/90">
            {RIDDLE.text.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
          <p className="font-mono text-sm text-paper/80">
            The source remembers.{" "}
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="underline underline-offset-4">
              github.com/silverchat-dev/silverchat
            </a>
          </p>
        </header>

        {!r ? (
          <p className="text-xl text-paper/80">The riddle opens soon.</p>
        ) : r.solved ? (
          <p className="text-2xl">
            Solved by{" "}
            <a href={`${EXPLORER}/address/${r.winner}`} target="_blank" rel="noreferrer" className="font-mono underline underline-offset-4">
              {short(r.winner)}
            </a>
            .
          </p>
        ) : r.closed ? (
          <p className="text-2xl">Closed. Nobody solved it in time.</p>
        ) : (
          <SolvePanel answerHashOnChain={r.answerHash} />
        )}
      </div>

      <aside className="space-y-5 self-start bg-tray px-5 py-7 font-mono text-sm sm:px-7 lg:sticky lg:top-6">
        <p className="text-xs uppercase tracking-[0.14em] text-silver">How it works</p>
        <ol className="space-y-3 text-xs leading-relaxed text-paper/85">
          <li>1. Find the answer. Try it above as often as you like; the check runs in your browser.</li>
          <li>2. Seal it: one transaction that hides your answer and ties it to your wallet.</li>
          <li>3. Ten blocks later, reveal it. The first right reveal takes the whole prize.</li>
        </ol>
        {r && (
          <dl className="space-y-2 border-t border-silver/25 pt-4 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-silver">Answer hash</dt>
              <dd>{short(r.answerHash)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-silver">Reclaim from</dt>
              <dd>{utc(r.deadline)}</dd>
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
          After day seven the Safe may take the prize back. Until it does, a right reveal still wins. The team knows the
          answer and does not play.
        </p>
      </aside>
    </section>
  );
}
