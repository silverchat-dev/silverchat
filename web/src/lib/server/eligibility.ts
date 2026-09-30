import "server-only";

import { erc20Abi, type Address } from "viem";

import { ADDR, ZERO } from "@/lib/config";

import { publicClient } from "./chain";
import type { PollRow } from "./db";

// a balance at a past block never changes, so the answer can be kept for good
const cache = new Map<string, boolean>();

const balanceAt = (token: Address, voter: Address, block: bigint) =>
  publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [voter], blockNumber: block });

/**
 * Holders of $20 of ZC or SC at the block the poll was asked. A token can sit in one wallet only at the end of that
 * block, so passing it around or borrowing it in the same block buys no extra answers. Needs an archive RPC.
 */
export async function isEligible(poll: PollRow, voter: Address) {
  const key = `${poll.id}:${voter}`;
  const known = cache.get(key);
  if (known !== undefined) return known;

  const block = BigInt(poll.block);
  let ok = (await balanceAt(ADDR.zc, voter, block)) >= BigInt(poll.min_hold_zc);
  if (!ok && poll.min_hold_sc && ADDR.sc !== ZERO) ok = (await balanceAt(ADDR.sc, voter, block)) >= BigInt(poll.min_hold_sc);

  if (cache.size > 100_000) cache.clear();
  cache.set(key, ok);
  return ok;
}

let clock: { at: number; ts: number } | null = null;

/** The latest block's timestamp: polls open and close by chain time, not by this server's clock. */
export async function chainTime() {
  if (clock && Date.now() - clock.at < 12_000) return clock.ts;
  const block = await publicClient.getBlock();
  clock = { at: Date.now(), ts: Number(block.timestamp) };
  return clock.ts;
}

/** Chain time for display; a slow RPC must not break a page. */
export const displayTime = () => chainTime().catch(() => Math.floor(Date.now() / 1000));
