import "server-only";

import { erc20Abi, type Address } from "viem";

import { distributorAbi, launchHookAbi } from "@/lib/abi";

import { ADDR, ZERO } from "@/lib/config";
import { SPLIT } from "@/lib/pricing";

import { publicClient } from "./chain";
import { db } from "./db";
import { poolId } from "./price";

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
  /** Answers signed in the last 24 hours. */
  dayAnswers: number;
  /** ZC paid into polls asked in the last DAY_BLOCKS blocks; null while the head block cannot be read. */
  daySpent: bigint | null;
  /** ZC burned by polls fixed in the last 24 hours. */
  dayBurned: bigint;
  /** Stockereum's SC holder rewards, in ZC: credited to holders so far, paid out of that, and how many hold SC. */
  scHolderEarned: bigint | null;
  scHolderPaid: bigint | null;
  scHolders: number | null;
};

// SC's distributor, found once through its launch record: null when SC is unset or holder rewards are off
let distributor: Address | null | undefined;
async function holderRewards() {
  if (ADDR.sc === ZERO) return null;
  if (distributor === undefined) {
    const launch = await publicClient.readContract({ address: ADDR.stockereumHook, abi: launchHookAbi, functionName: "getLaunch", args: [poolId(ADDR.sc, ADDR.zc)] });
    distributor = launch.feesToHolders ? launch.feeRecipient : null;
  }
  if (!distributor) return null;
  const [earned, paid, holders] = await Promise.all([
    publicClient.readContract({ address: distributor, abi: distributorAbi, functionName: "totalNotified" }),
    publicClient.readContract({ address: distributor, abi: distributorAbi, functionName: "totalDistributed" }),
    publicClient.readContract({ address: distributor, abi: distributorAbi, functionName: "holderCount" }),
  ]);
  return { earned: BigInt(earned), paid, holders: Number(holders) };
}

/** About a day of Ethereum blocks, at 12 seconds each. */
export const DAY_BLOCKS = 7_200n;

let cached: { at: number; stats: Stats } | null = null;
let head: bigint | null = null;

/**
 * Where the ZC paid into Silverchat went. Each fixed poll is split with SilverAsk.finalize's own integer math, poll by
 * poll (summing first would round differently). Cached for a minute.
 */
export async function stats(): Promise<Stats> {
  if (cached && Date.now() - cached.at < 60_000) return cached.stats;
  const [{ polls, answers, dayAnswers }, chain, rewards] = await Promise.all([
    db.ledger(),
    Promise.all([
      ADDR.ask === ZERO ? null : publicClient.readContract({ address: ADDR.zc, abi: erc20Abi, functionName: "balanceOf", args: [ADDR.ask] }),
      publicClient.readContract({ address: ADDR.zc, abi: erc20Abi, functionName: "balanceOf", args: [BURN] }),
      publicClient.readContract({ address: ADDR.zc, abi: erc20Abi, functionName: "totalSupply" }),
      publicClient.getBlockNumber(),
    // one failed read keeps the last good numbers instead of blanking them for a minute
    ]).catch(() => [cached?.stats.inContract ?? null, cached?.stats.burnAddress ?? null, cached?.stats.supply ?? null, head] as const),
    holderRewards().catch(() => null),
  ]);

  head = chain[3];
  const dayAgo = Math.floor(Date.now() / 1000) - 86_400;
  const s: Stats = {
    polls: polls.length, answers, spent: 0n, earned: 0n, returned: 0n, treasury: 0n, burned: 0n, open: 0n,
    inContract: chain[0], burnAddress: chain[1], supply: chain[2],
    dayAnswers, daySpent: null, dayBurned: 0n,
    // a failed read keeps the last good numbers
    scHolderEarned: rewards?.earned ?? cached?.stats.scHolderEarned ?? null,
    scHolderPaid: rewards?.paid ?? cached?.stats.scHolderPaid ?? null,
    scHolders: rewards?.holders ?? cached?.stats.scHolders ?? null,
  };
  let daySpent = 0n;
  for (const p of polls) {
    const cost = BigInt(p.cost);
    s.spent += cost;
    if (head !== null && BigInt(p.block) > head - DAY_BLOCKS) daySpent += cost;
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
      if ((p.finalize_at ?? 0) >= dayAgo) s.dayBurned += cost - pool - treasury;
    }
  }
  if (head !== null) s.daySpent = daySpent;
  cached = { at: Date.now(), stats: s };
  return s;
}
