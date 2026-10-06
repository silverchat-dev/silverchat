import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { isAddress } from "viem";

import { rewards } from "@/lib/algorithm";
import { askAbi } from "@/lib/abi";
import { Figures, Page, PageHead, Part, label } from "@/components/journal";
import { ADDR, EXPLORER } from "@/lib/config";
import { topicOf, type Content } from "@/lib/content";
import { lead, short, tokens } from "@/lib/format";
import { publicClient } from "@/lib/server/chain";
import { db, type PollRow } from "@/lib/server/db";
import { scoreOf } from "@/lib/server/score";

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
  // a declared agent is public by its own declaration
  const [profile, agents] = await Promise.all([db.profile(address), db.agents()]);
  const agent = agents.find((a) => a.address === address) ?? null;
  return profile?.public || agent ? { address, agent } : null;
});

export async function generateMetadata({ params }: PageProps<"/u/[address]">): Promise<Metadata> {
  const p = await publicAddress((await params).address);
  return { title: p ? `${p.agent?.name ?? short(p.address)} · silverchat` : "Profile · silverchat" };
}

export default async function ProfilePage({ params }: PageProps<"/u/[address]">) {
  const p = await publicAddress((await params).address);
  if (!p) notFound();
  const { address, agent } = p;
  const [{ asked, claimed, at }, score] = await Promise.all([load(address), scoreOf(address)]);

  const figures = [
    { label: "Polls asked", value: asked.length.toLocaleString("en-US") },
    { label: "ZC claimed", value: tokens(claimed, 0), note: "for answering polls" },
    // Predict sides are public on-chain once revealed, so the record adds nothing Ethereum does not show
    ...(score && score.resolved > 0
      ? [{ label: "Called right", value: `${score.correct} / ${score.resolved}`, note: `Predict markets · rank #${score.rank}` }]
      : []),
  ];

  return (
    <Page>
      <PageHead
        stop="pulse"
        title={agent ? agent.name : "Public profile"}
        aside={
          <a
            href={`${EXPLORER}/address/${address}`}
            target="_blank"
            rel="noreferrer"
            className="break-all font-mono text-[12px] leading-relaxed text-paper/85 underline decoration-paper/30 underline-offset-4 transition-colors hover:decoration-paper"
          >
            {address} ↗
          </a>
        }
      >
        {agent ? (
          <>
            This wallet says it is an agent
            {agent.url && (
              <>
                {" "}
                run from{" "}
                <a href={agent.url} target="_blank" rel="noreferrer nofollow" className="underline decoration-paper/30 underline-offset-4 hover:decoration-paper">
                  {new URL(agent.url).host}
                </a>
              </>
            )}
            , which makes its profile public.
          </>
        ) : (
          "This wallet chose to show its profile."
        )}{" "}
        It lists only what Ethereum already shows: the questions it asked, the ZC it claimed for answering and its Predict
        record. What it answered in polls stays private.
      </PageHead>

      <Part title="On Ethereum">
        <Figures items={figures} />
      </Part>

      {asked.length > 0 && (
        <Part title="Asked" more={<span className="text-silver tabular-nums">{asked.length}</span>}>
          <ol className="ruled -mx-2">
            {asked.map((p) => {
              const content = p.content ? (JSON.parse(p.content) as Content) : null;
              const topic = topicOf(content);
              const top = p.status === "final" ? lead(content, p.tally) : null;
              const open = p.status === "open" && p.closes_at > at / 1000;
              return (
                <li key={p.id}>
                  <Link href={`/poll/${p.id}`} className="group grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 rounded-md px-2 py-4 transition-colors hover:bg-paper/[0.04]">
                    <span className="min-w-0 space-y-2">
                      <span className={`block ${label} tracking-[0.12em]`}>
                        No. {p.id}
                        {topic && ` · ${topic}`}
                      </span>
                      <span className="line-clamp-2 block text-[1.2rem] leading-snug text-balance">{content?.questions[0].q ?? "Question not published"}</span>
                      <span className={`block font-mono text-[11px] ${open ? "text-paper" : "text-silver"}`}>
                        {p.status === "final" ? (top ? `Fixed · ${top.share}% ${top.option}` : "Fixed · no answers") : p.status === "refunded" ? "Refunded" : open ? "Open" : "Closed · developing"}
                      </span>
                    </span>
                    <span aria-hidden className="pt-6 font-mono text-sm text-silver transition-transform group-hover:translate-x-0.5 group-hover:text-paper">
                      →
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </Part>
      )}
    </Page>
  );
}
