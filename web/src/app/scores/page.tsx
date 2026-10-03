import type { Metadata } from "next";
import Link from "next/link";

import { chapter } from "@/lib/config";
import { short, tokens } from "@/lib/format";
import { leaderboard, SCORE_MIN } from "@/lib/server/score";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Forecasters · silverchat", description: "Who called Predict markets right, from settled markets on Ethereum." };

const signed = (wei: string) => `${BigInt(wei) < 0n ? "−" : "+"}${tokens(BigInt(wei) < 0n ? -BigInt(wei) : BigInt(wei), 0)}`;

export default async function ScoresPage() {
  const list = await leaderboard();
  return (
    <section className="mx-auto max-w-6xl space-y-10 px-5 py-10 sm:px-8 md:py-14">
      <header className="max-w-2xl space-y-4">
        <h1 className="text-5xl leading-tight">Forecasters</h1>
        <p className="text-lg leading-relaxed text-paper/80">
          In Snowmoon an Acolyte has a prediction score: how well their votes foresaw the Sentinels&apos; judgements (
          <a href={chapter(23)} target="_blank" rel="noreferrer" className="underline underline-offset-4">
            ch. 23
          </a>
          ). Here a score comes from settled Predict markets: how often a wallet staked on the side that won. A stake left
          sealed counts as wrong. Only wallets with a public profile and at least {SCORE_MIN} settled markets are listed.
        </p>
      </header>

      {!list.length ? (
        <p className="text-xl text-paper/80">Nobody has {SCORE_MIN} settled markets and a public profile yet.</p>
      ) : (
        <ol className="divide-y divide-silver/20 border-y border-silver/20 font-mono text-sm">
          <li aria-hidden className="grid grid-cols-[3rem_minmax(0,1fr)_6rem_6rem] gap-4 py-3 text-[11px] uppercase tracking-[0.14em] text-silver sm:grid-cols-[3rem_minmax(0,1fr)_8rem_8rem_10rem]">
            <span>#</span>
            <span>Wallet</span>
            <span className="text-right">Right</span>
            <span className="text-right">Accuracy</span>
            <span className="hidden text-right sm:block">Net ZC</span>
          </li>
          {list.map((s) => (
            <li key={s.address}>
              <Link href={`/u/${s.address}`} className="grid grid-cols-[3rem_minmax(0,1fr)_6rem_6rem] gap-4 py-3 hover:bg-paper/5 sm:grid-cols-[3rem_minmax(0,1fr)_8rem_8rem_10rem]">
                <span className="text-silver">{s.rank}</span>
                <span className="truncate">{short(s.address)}</span>
                <span className="text-right">
                  {s.correct} / {s.resolved}
                </span>
                <span className="text-right">{Math.round(s.accuracy * 100)}%</span>
                <span className="hidden text-right sm:block">{signed(s.net)}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
      <p className="font-mono text-xs text-silver">
        <Link href="/predict" className="text-paper underline-offset-4 hover:underline">
          Predict →
        </Link>{" "}
        · Show your profile from <Link href="/me" className="underline underline-offset-4">your page</Link> to be listed.
      </p>
    </section>
  );
}
