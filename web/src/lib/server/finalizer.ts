import "server-only";

import { formatEther, TransactionNotFoundError, type Hex } from "viem";

import { tally } from "@/lib/algorithm";
import { askAbi } from "@/lib/abi";
import { ADDR, ZERO } from "@/lib/config";
import type { Content } from "@/lib/content";

import { feesOrThrow, poster as wallet, publicClient, send } from "./chain";
import { db, type PollRow } from "./db";
import { chainTime } from "./eligibility";
import { trees } from "./trees";

const LOW_ETH = 2n * 10n ** 16n;
let checked = 0;

/** The first block with a timestamp after `ts`. Its hash seeds the draw for paid places. */
async function firstBlockAfter(ts: number, from: bigint) {
  let lo = from;
  let hi = await publicClient.getBlockNumber();
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    if (Number((await publicClient.getBlock({ blockNumber: mid })).timestamp) > ts) hi = mid;
    else lo = mid + 1n;
  }
  return publicClient.getBlock({ blockNumber: lo });
}

/** Fix the result of every poll past its close: tally, both roots, then `finalize` from the poster key. */
export async function finalizeTick() {
  if (!wallet || ADDR.ask === ZERO) return;
  if (Date.now() - checked > 10 * 60_000) {
    checked = Date.now();
    const eth = await publicClient.getBalance({ address: wallet.account.address });
    if (eth < LOW_ETH) console.error(`[finalizer] poster has ${formatEther(eth)} ETH left`);
  }

  // a minute of slack after close, so an answer already in flight is stored before the answers are read
  const now = await chainTime();
  for (const poll of await db.due(now - 60)) {
    try {
      await finalizeOne(poll);
    } catch (e) {
      console.error(`[finalizer] poll ${poll.id}:`, e instanceof Error ? e.message.split("\n")[0] : e);
    }
  }
}

async function finalizeOne(poll: PollRow) {
  // a slow first attempt is still in the mempool: sending again would only revert
  // (only "not found" means it was dropped; a failed lookup is not a reason to send twice)
  if (poll.finalize_tx?.startsWith("0x")) {
    const gone = await publicClient.getTransaction({ hash: poll.finalize_tx as Hex }).then(() => false, (e) => e instanceof TransactionNotFoundError);
    if (!gone) return;
  }
  // over the gas cap there is no point searching the seed block and building the trees
  const fees = await feesOrThrow();
  // take the row before reading answers: nothing can be added after this
  if (!(await db.claimFinalizing(poll.id))) return;
  const seedBlock = await firstBlockAfter(poll.closes_at, BigInt(poll.block));
  const t = await trees(poll, seedBlock.hash as Hex);
  const questions = poll.content ? (JSON.parse(poll.content) as Content).questions : [];

  const record = {
    seed: seedBlock.hash as string,
    seed_block: String(seedBlock.number),
    tally: tally(questions, t.answers),
    result_root: t.resultRoot,
    reward_root: t.rewardRoot,
    reward_total: String(t.rewardTotal),
  };
  await db.setFinalizing(poll.id, { ...record, finalize_tx: "sending" });
  const hash = await send(wallet!, {
    address: ADDR.ask,
    abi: askAbi,
    functionName: "finalize",
    args: [BigInt(poll.id), t.resultRoot, t.rewardRoot, t.rewardTotal],
  }, fees);
  await db.setFinalizing(poll.id, { ...record, finalize_tx: hash });
  console.log(`[finalizer] poll ${poll.id}: ${t.answers.length} answers, ${formatEther(t.rewardTotal)} ZC to answerers (${hash})`);
}
