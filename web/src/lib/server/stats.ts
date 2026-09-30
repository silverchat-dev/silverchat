import "server-only";

import { erc20Abi } from "viem";

import { ADDR, ZERO } from "@/lib/config";
import { SPLIT } from "@/lib/pricing";

import { publicClient } from "./chain";
import { db } from "./db";

const BURN = "0x000000000000000000000000000000000000dEaD";

export type Stats = {
  polls: number;
  answers: number;
  spent: bigint;
  earned: bigint;
  returned: bigint;
  treasury: bigint;
  burned: bigint;
  open: bigint;
  inContract: bigint | null;
  burnAddress: bigint | null;
  supply: bigint | null;
};

let cached: { at: number; stats: Stats } | null = null;

/**
 * Where the ZC paid into Silverchat went. Each fixed poll is split with SilverAsk.finalize's own integer math, poll by
 * poll (summing first would round differently). Cached for a minute.
 */
export async function stats(): Promise<Stats> {
  if (cached && Date.now() - cached.at < 60_000) return cached.stats;
  const [{ polls, answers }, chain] = await Promise.all([
    db.ledger(),
    Promise.all([
      ADDR.ask === ZERO ? null : publicClient.readContract({ address: ADDR.zc, abi: erc20Abi, functionName: "balanceOf", args: [ADDR.ask] }),
      publicClient.readContract({ address: ADDR.zc, abi: erc20Abi, functionName: "balanceOf", args: [BURN] }),
      publicClient.readContract({ address: ADDR.zc, abi: erc20Abi, functionName: "totalSupply" }),
    // one failed read keeps the last good numbers instead of blanking them for a minute
    ]).catch(() => [cached?.stats.inContract ?? null, cached?.stats.burnAddress ?? null, cached?.stats.supply ?? null] as const),
  ]);

  const s: Stats = { polls: polls.length, answers, spent: 0n, earned: 0n, returned: 0n, treasury: 0n, burned: 0n, open: 0n, inContract: chain[0], burnAddress: chain[1], supply: chain[2] };
  for (const p of polls) {
    const cost = BigInt(p.cost);
    s.spent += cost;
    if (p.status === "open") s.open += cost;
    else if (p.status === "refunded") s.returned += cost;
    else {
      const pool = (cost * SPLIT[0][1]) / 10_000n;
      const treasury = (cost * SPLIT[1][1]) / 10_000n;
      const earned = BigInt(p.reward_total ?? 0);
      s.earned += earned;
      s.returned += pool - earned;
      s.treasury += treasury;
      s.burned += cost - pool - treasury;
    }
  }
  cached = { at: Date.now(), stats: s };
  return s;
}
