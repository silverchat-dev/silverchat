import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { isAddress } from "viem";

import { rewards } from "@/lib/algorithm";
import { askAbi } from "@/lib/abi";
import { ADDR, EXPLORER } from "@/lib/config";
import { topicOf, type Content } from "@/lib/content";
import { lead, short, tokens } from "@/lib/format";
import { publicClient } from "@/lib/server/chain";
import { db, type PollRow } from "@/lib/server/db";
import { SCORE_MIN, scoreOf } from "@/lib/server/score";

export const dynamic = "force-dynamic";

const memo = new Map<string, { at: number; asked: PollRow[]; claimed: bigint }>();

/**
 * Only what Ethereum already shows about a wallet: the polls it asked and the ZC it claimed. Neither moves when a poll
 * is fixed, so watching this page tells nobody which poll the wallet answered. Cached for a minute.
 */
async function load(address: string) {
  const hit = memo.get(address);
  if (hit && Date.now() - hit.at < 60_000) return hit;
  const [asked, answered] = await Promise.all([db.askedBy(address), db.answeredFinal(address, 0)]);
  // one chain call for every wallet, answered or not (poll 0 never exists), so the time this page takes says nothing
  const [, ...flags] = await publicClient.multicall({
    contracts: [0n, ...answered.map((p) => BigInt(p.id))].map((id) => ({ address: ADDR.ask, abi: askAbi, functionName: "claimed", args: [id, address] }) as const),
    allowFailure: false,
  });
  // a paid place is worth the same to everyone in a poll, however many answered
  const claimed = answered.reduce((sum, p, i) => (flags[i] ? sum + rewards(BigInt(p.cost), p.breadth, 0).each : sum), 0n);
  const entry = { at: Date.now(), asked, claimed };
  if (memo.size > 1000) memo.clear();
  memo.set(address, entry);
  return entry;
}

const publicAddress = cache(async (raw: string) => {
  if (!isAddress(raw)) return null;
  const address = raw.toLowerCase();
  return (await db.profile(address))?.public ? address : null;
});

export async function generateMetadata({ params }: PageProps<"/u/[address]">): Promise<Metadata> {
  const address = await publicAddress((await params).address);
  return { title: address ? `${short(address)} · silverchat` : "Profile · silverchat" };
}

export default async function ProfilePage({ params }: PageProps<"/u/[address]">) {
  const address = await publicAddress((await params).address);
  if (!address) notFound();
  const [{ asked, claimed, at }, score] = await Promise.all([load(address), scoreOf(address)]);

  return (
    <section className="mx-auto max-w-6xl space-y-12 px-5 py-10 sm:px-8 md:py-14">
      <header className="space-y-4">
        <h1 className="text-5xl leading-tight">Public profile</h1>
        <a href={`${EXPLORER}/address/${address}`} target="_blank" rel="noreferrer" className="block break-all font-mono text-[11px] text-paper/80 underline-offset-4 hover:underline sm:text-base">
          {address}
        </a>
        <p className="max-w-2xl text-lg leading-relaxed text-paper/80">
          This wallet chose to show its profile. It lists only what Ethereum already shows: the questions it asked, the
          ZC it claimed for answering and its Predict record. What it answered in polls stays private.
        </p>
      </header>

      <dl className="grid gap-3 sm:grid-cols-2">
        {[
          ["Polls asked", asked.length.toLocaleString("en-US")],
          ["ZC claimed for answers", tokens(claimed, 0)],
          // Predict sides are public on-chain once revealed, so the record adds nothing Ethereum does not show
          ...(score && score.resolved > 0
            ? [["Predict markets called right", `${score.correct} / ${score.resolved}${score.rank ? ` · #${score.rank}` : ` · ranked after ${SCORE_MIN}`}`]]
            : []),
        ].map(([k, v]) => (
          <div key={k} className="space-y-3 bg-tray p-6">
            <dt className="font-mono text-[11px] uppercase tracking-[0.14em] text-silver">{k}</dt>
            <dd className="text-[clamp(2rem,4vw,3rem)] leading-none tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      {asked.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-silver">Asked</h2>
          <ol className="divide-y divide-silver/20 border-y border-silver/20">
            {asked.map((p) => {
              const content = p.content ? (JSON.parse(p.content) as Content) : null;
              const topic = topicOf(content);
              const top = p.status === "final" ? lead(content, p.tally) : null;
              return (
                <li key={p.id}>
                  <Link href={`/poll/${p.id}`} className="grid gap-x-6 gap-y-1 py-4 hover:bg-paper/5 sm:grid-cols-[minmax(0,1fr)_14rem] sm:items-baseline">
                    <span className="min-w-0 space-y-1">
                      <span className="block font-mono text-xs uppercase tracking-[0.14em] text-silver">
                        No. {p.id}
                        {topic && ` · ${topic}`}
                      </span>
                      <span className="line-clamp-2 text-xl">{content?.questions[0].q ?? "Question not published"}</span>
                    </span>
                    <span className="font-mono text-sm text-paper/80 sm:text-right">
                      {p.status === "final" ? (top ? `Fixed · ${top.share}% ${top.option}` : "Fixed · no answers") : p.status === "refunded" ? "Refunded" : p.closes_at > at / 1000 ? "Open" : "Closed · developing"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </section>
  );
}
