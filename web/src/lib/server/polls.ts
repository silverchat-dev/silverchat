import "server-only";

import type { Content } from "@/lib/content";

import type { PollRow } from "./db";

/** The public shape of a poll. Totals appear only once the result is fixed. */
export function serialize(row: PollRow) {
  return {
    id: row.id,
    contentHash: row.hash,
    content: row.content ? (JSON.parse(row.content) as Content) : null,
    asker: row.asker,
    breadth: row.breadth,
    priority: row.priority,
    cost: row.cost,
    closesAt: row.closes_at,
    block: row.block,
    tx: row.tx,
    status: row.status,
    resultRoot: row.status === "final" ? row.result_root : null,
    rewardRoot: row.status === "final" ? row.reward_root : null,
    rewardTotal: row.status === "final" ? row.reward_total : null,
    // totals are published only once the result is fixed
    tally: row.status === "final" ? (row.tally ?? null) : null,
    seedBlock: row.seed_block ?? null,
    finalizeTx: row.status === "final" ? (row.finalize_tx ?? null) : null,
  };
}
