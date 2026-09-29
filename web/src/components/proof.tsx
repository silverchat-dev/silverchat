"use client";

import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { useQuery } from "@tanstack/react-query";
import { parseEventLogs, type Hex } from "viem";
import { useAccount, usePublicClient } from "wagmi";

import type { Tally } from "@/lib/algorithm";
import { askAbi } from "@/lib/abi";
import { loadReceipt, resultLeaf } from "@/lib/answer";
import { ADDR, EXPLORER } from "@/lib/config";
import { canonical, contentHash, type Content } from "@/lib/content";
import { short } from "@/lib/format";

type Poll = {
  id: string;
  contentHash: string;
  content: Content | null;
  block: string;
  tx: string;
  status: string;
  resultRoot: string | null;
  finalizeTx: string | null;
  seedBlock: string | null;
  tally: Tally | null;
};

type Check = { label: string; ok: boolean | null; detail: string };

/**
 * Everything here is checked in this browser against the chain, not taken from our server: the question against the
 * hash in the Asked log, the roots against the Finalized log, and the totals by recounting the published answers.
 */
export function Proof({ poll }: { poll: Poll }) {
  const client = usePublicClient();
  const { address } = useAccount();

  const checks = useQuery({
    queryKey: ["proof", poll.id, poll.status, address],
    enabled: !!client,
    queryFn: async (): Promise<Check[]> => {
      const out: Check[] = [];
      const asked = await client!.getContractEvents({
        address: ADDR.ask,
        abi: askAbi,
        eventName: "Asked",
        args: { id: BigInt(poll.id) },
        fromBlock: BigInt(poll.block),
        toBlock: BigInt(poll.block),
      });
      const onChain = asked[0]?.args.contentHash;
      out.push({
        label: "Question",
        ok: !!onChain && !!poll.content && contentHash(canonical(poll.content)) === onChain,
        detail: onChain ? `hash ${short(onChain)} in the Asked log` : "no Asked log found",
      });

      if (poll.status !== "final" || !poll.finalizeTx || !poll.tally) return out;

      const receipt = await client!.getTransactionReceipt({ hash: poll.finalizeTx as Hex });
      const [fixed] = parseEventLogs({ abi: askAbi, logs: receipt.logs, eventName: "Finalized" });
      out.push({
        label: "Result root",
        ok: !!fixed && fixed.args.resultRoot === poll.resultRoot,
        detail: fixed ? `${short(fixed.args.resultRoot)} in the Finalized log` : "no Finalized log found",
      });

      const { answers } = (await (await fetch(`/api/polls/${poll.id}/leaves`)).json()) as { answers: { choices: number[]; salt: Hex }[] };
      const leaves = answers.map((a) => resultLeaf(BigInt(poll.id), a.choices, a.salt)).sort();
      const root = leaves.length ? StandardMerkleTree.of(leaves.map((l) => [l]), ["bytes32"]).root : `0x${"0".repeat(64)}`;
      const totals = poll.tally.totals.map((q) => q.map(() => 0));
      for (const a of answers) a.choices.forEach((c, i) => (totals[i][c] += 1));
      out.push({
        label: "Recount",
        ok: root === fixed?.args.resultRoot && JSON.stringify(totals) === JSON.stringify(poll.tally.totals),
        detail: `${answers.length.toLocaleString("en-US")} published answers give the same root and totals`,
      });

      const mine = address ? loadReceipt(poll.id, address) : null;
      if (mine) {
        out.push({
          label: "Your answer",
          ok: leaves.includes(mine.leaf),
          detail: `receipt ${short(mine.leaf)} is ${leaves.includes(mine.leaf) ? "" : "not "}in the record`,
        });
      }
      return out;
    },
  });

  return (
    <aside aria-label="Proof" className="space-y-5 bg-tray px-5 py-7 font-mono text-xs sm:px-7">
      <p className="uppercase tracking-[0.14em] text-silver">The negative</p>
      <p className="leading-relaxed text-paper/80">
        Checked in your browser against Ethereum, not taken from our server.
      </p>
      <ul className="space-y-3">
        {(checks.data ?? []).map((c) => (
          <li key={c.label} className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-2">
            <span aria-hidden className={c.ok ? "text-paper" : "text-silver"}>
              {c.ok ? "✓" : "×"}
            </span>
            <span>
              <span className="text-paper">{c.label}</span>
              <span className="sr-only">{c.ok ? " matches" : " does not match"}</span>
              <span className="block text-silver">{c.detail}</span>
            </span>
          </li>
        ))}
        {checks.isLoading && <li className="text-silver">Checking…</li>}
        {checks.isError && (
          <li className="text-silver">
            Could not reach Ethereum from this browser.{" "}
            <button type="button" onClick={() => checks.refetch()} className="underline underline-offset-4">
              Try again
            </button>
          </li>
        )}
      </ul>
      <dl className="space-y-2 border-t border-silver/25 pt-4 text-silver">
        <Link k="Asked" href={`${EXPLORER}/tx/${poll.tx}`}>
          block {Number(poll.block).toLocaleString("en-US")}
        </Link>
        {poll.finalizeTx && poll.status === "final" && (
          <Link k="Fixed" href={`${EXPLORER}/tx/${poll.finalizeTx}`}>
            {short(poll.finalizeTx)}
          </Link>
        )}
        {poll.seedBlock && (
          <Link k="Draw seed" href={`${EXPLORER}/block/${poll.seedBlock}`}>
            block {Number(poll.seedBlock).toLocaleString("en-US")}
          </Link>
        )}
      </dl>
    </aside>
  );
}

function Link({ k, href, children }: { k: string; href: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt>{k}</dt>
      <dd>
        <a href={href} target="_blank" rel="noreferrer" className="text-paper/85 underline-offset-4 hover:underline">
          {children}
        </a>
      </dd>
    </div>
  );
}
