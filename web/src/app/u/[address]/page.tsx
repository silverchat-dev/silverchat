import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isAddress } from "viem";

import { rewards } from "@/lib/algorithm";
import { askAbi } from "@/lib/abi";
import { ADDR, EXPLORER } from "@/lib/config";
import { topicOf, type Content } from "@/lib/content";
import { lead, short, tokens } from "@/lib/format";
import { publicClient } from "@/lib/server/chain";
import { db, type PollRow } from "@/lib/server/db";

export const dynamic = "force-dynamic";

const cache = new Map<string, { at: number; asked: PollRow[]; claimed: bigint }>();

/**
 * Only what Ethereum already shows about a wallet: the polls it asked and the ZC it claimed. Neither moves when a poll
 * is fixed, so watching this page tells nobody which poll the wallet answered. Cached for a minute.
 */
async function load(address: string) {
  const hit = cache.get(address);
  if (hit && Date.now() - hit.at < 60_000) return hit;
  // reads every poll; a query by asker when there are many
  const [all, answered] = await Promise.all([db.polls(10_000), db.answeredFinal(address, 0)]);
  const flags = answered.length
    ? await publicClient.multicall({
        contracts: answered.map((p) => ({ address: ADDR.ask, abi: askAbi, functionName: "claimed", args: [BigInt(p.id), address] }) as const),
        allowFailure: false,
      })
    : [];
  // a paid place is worth the same to everyone in a poll, however many answered
  const claimed = answered.reduce((sum, p, i) => (flags[i] ? sum + rewards(BigInt(p.cost), p.breadth, 0).each : sum), 0n);
  const entry = { at: Date.now(), asked: all.filter((p) => p.asker === address), claimed };
  if (cache.size > 1000) cache.clear();
  cache.set(address, entry);
  return entry;
}

async function publicAddress(raw: string) {
  if (!isAddress(raw)) return null;
  const address = raw.toLowerCase();
  return (await db.profile(address))?.public ? address : null;
}

export async function generateMetadata({ params }: PageProps<"/u/[address]">): Promise<Metadata> {
  const address = await publicAddress((await params).address);
  return { title: address ? `${short(address)} · silverchat` : "Profile · silverchat" };
}

export default async function ProfilePage({ params }: PageProps<"/u/[address]">) {
  const address = await publicAddress((await params).address);
  if (!address) notFound();
  const { asked, claimed, at } = await load(address);

  return (
    <section className="mx-auto max-w-6xl space-y-12 px-5 py-10 sm:px-8 md:py-14">
      <header className="space-y-4">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-silver">Public profile</p>
        <h1 className="text-5xl leading-tight">{short(address)}</h1>
        <a href={`${EXPLORER}/address/${address}`} target="_blank" rel="noreferrer" className="block break-all font-mono text-xs text-paper/70 underline-offset-4 hover:underline sm:text-sm">
          {address}
        </a>
        <p className="max-w-2xl text-lg leading-relaxed text-paper/80">
          This wallet chose to show its profile. It lists only what Ethereum already shows: the questions it asked and the
          ZC it claimed for answering. What it answered stays private.
        </p>
      </header>

      <dl className="grid gap-3 sm:grid-cols-2">
        {[
          ["Polls asked", asked.length.toLocaleString("en-US")],
          ["ZC claimed for answers", tokens(claimed, 0)],
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
