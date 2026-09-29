import "server-only";

import { rank } from "@/lib/algorithm";

import { db } from "./db";
import { latestBlock } from "./eligibility";

/**
 * Every open poll in the order the published rules give, with the block whose hash seeded the ranking and whose time
 * decided what is still open. If the chain cannot be read, open polls come newest first and nothing claims a ranking.
 */
export async function liveFeed(limit = 100) {
  const all = (await db.polls(10_000, "open")).map((p) => ({ ...p, answers: p.answers ?? 0 }));
  const block = await latestBlock().catch(() => null);
  if (!block) return { polls: all.slice(0, limit), block: null, now: Math.floor(Date.now() / 1000) };
  const now = Number(block.timestamp);
  const open = all.filter((p) => p.closes_at > now);
  return {
    polls: rank(open, block.hash).slice(0, limit),
    block: { number: String(block.number), hash: block.hash },
    now,
  };
}
