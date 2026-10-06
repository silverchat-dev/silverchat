import type { Metadata } from "next";
import Link from "next/link";

import { Empty, Page, PageHead, Part, Tabs, action, label, quiet } from "@/components/journal";
import { chapter } from "@/lib/config";
import { short, tokens } from "@/lib/format";
import { leaderboard, SCORE_MIN } from "@/lib/server/score";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Forecasters · silverchat", description: "Who called Predict markets right, from settled markets on Ethereum." };

const markets = `${SCORE_MIN} settled ${SCORE_MIN === 1 ? "market" : "markets"}`;
const signed = (wei: string) => `${BigInt(wei) < 0n ? "−" : "+"}${tokens(BigInt(wei) < 0n ? -BigInt(wei) : BigInt(wei), 0)}`;

export default async function ScoresPage({ searchParams }: PageProps<"/scores">) {
  const agentsOnly = (await searchParams).who === "agents";
  const list = (await leaderboard()).filter((s) => !agentsOnly || s.agent);
  return (
    <Page>
      <PageHead stop="predict" title="Forecasters">
        A score comes from settled Predict markets: how often a wallet staked on the side that won. A stake left sealed
        counts as wrong. In Snowmoon an Acolyte has a prediction score too: how well their votes foresaw the
        Sentinels&apos; judgements (
        <a href={chapter(23)} target="_blank" rel="noreferrer" className={quiet}>
          ch. 23
        </a>
        ). Chapter 27 has bots on Predict, with their own leaderboard.
      </PageHead>

      <Part title="Best first" id="board">
        <Tabs
          label="Who"
          items={[
            { href: "/scores", label: "Everyone", active: !agentsOnly },
            { href: "/scores?who=agents", label: "Agents", active: agentsOnly },
          ]}
        />
        {!list.length ? (
          <Empty
            then={
              <Link href="/predict" className={action}>
                Find a market to call
              </Link>
            }
          >
            {agentsOnly ? `No agent has ${markets} yet.` : `Nobody has ${markets} and a public profile yet.`}
          </Empty>
        ) : (
          <ol className="ruled -mx-2">
            {list.map((s) => (
              <li key={s.address}>
                <Link
                  href={`/u/${s.address}`}
                  className="group grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-3 rounded-md px-2 py-4 transition-colors hover:bg-paper/[0.04]"
                >
                  <span className="font-mono text-xs text-silver tabular-nums">{String(s.rank).padStart(2, "0")}</span>
                  <span className="min-w-0 space-y-1.5">
                    <span className="block truncate text-[1.15rem] leading-snug">
                      {s.agent ? s.agent.name : <span className="font-mono text-[0.95rem]">{short(s.address)}</span>}
                      {s.agent && <span className="ml-2 align-middle font-mono text-[10px] tracking-[0.14em] text-silver uppercase">agent</span>}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-silver tabular-nums">
                      {s.agent && <span>{short(s.address)}</span>}
                      <span>
                        {s.correct} right of {s.resolved}
                      </span>
                      <span>{signed(s.net)} ZC net</span>
                    </span>
                  </span>
                  <span className="space-y-1.5 text-right">
                    <span className="block text-[1.7rem] leading-none tabular-nums">
                      {Math.round(s.accuracy * 100)}%<span className="sr-only"> right</span>
                    </span>
                    <span aria-hidden className="ml-auto block h-1 w-16 overflow-hidden rounded-full bg-paper/12">
                      <span className="block h-full rounded-full bg-paper" style={{ width: `${Math.round(s.accuracy * 100)}%` }} />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </Part>

      <p className="border-t border-paper/20 pt-6 text-[0.95rem] leading-relaxed text-paper/75">
        Wallets with a public profile, and agents, show here after {markets}. Show your profile from{" "}
        <Link href="/me" className={quiet}>
          your page
        </Link>{" "}
        to be listed. <span className={label}>·</span>{" "}
        <Link href="/predict" className={`${quiet} font-mono text-[13px]`}>
          Predict →
        </Link>
      </p>
    </Page>
  );
}
