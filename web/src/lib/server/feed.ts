import "server-only";

import type { Hex } from "viem";

import { rank } from "@/lib/algorithm";

import { publicClient } from "./chain";
import { db } from "./db";
import { chainTime } from "./eligibility";

/** Open polls in the order the published rules give, with the block whose hash seeded the ranking. */
export async function liveFeed(limit = 100) {
  const [block, now] = await Promise.all([publicClient.getBlock(), chainTime()]);
  const open = (await db.polls(limit, "open")).filter((p) => p.closes_at > now);
  const ranked = rank(
    open.map((p) => ({ ...p, answers: p.answers ?? 0 })),
    block.hash as Hex,
  );
  return { polls: ranked, block: { number: String(block.number), hash: block.hash as Hex }, now };
}
