import "server-only";

import { MIN_HOLD_USD } from "@/lib/algorithm";
import { askAbi } from "@/lib/abi";
import { ADDR, DEPLOY_BLOCK, ZERO } from "@/lib/config";

import { publicClient } from "./chain";
import { db } from "./db";
import { prices, tokensFor } from "./price";

const CHUNK = 9_000n;
// every tick looks back this far again, so a reorg that reorders asks heals itself
const TAIL = 32n;
const MIN_HOLD = BigInt(MIN_HOLD_USD) * 10n ** 18n;

const EVENTS = askAbi.filter((x) => x.type === "event" && ["Asked", "Finalized", "Refunded"].includes(x.name));

let inflight: Promise<void> | null = null;

/** Read SilverAsk logs from the saved cursor to the head. Rows first, then the cursor, per chunk. */
export function indexTick() {
  inflight ??= run().finally(() => (inflight = null));
  return inflight;
}

async function run() {
  if (ADDR.ask === ZERO) return;
  if (DEPLOY_BLOCK === 0n) throw new Error("NEXT_PUBLIC_DEPLOY_BLOCK is not set");
  const head = await publicClient.getBlockNumber();
  const saved = await db.get("indexer");
  let from = saved ? BigInt(saved) + 1n : DEPLOY_BLOCK;
  if (from > head - TAIL) from = head - TAIL;
  if (from < DEPLOY_BLOCK) from = DEPLOY_BLOCK;

  while (from <= head) {
    const to = from + CHUNK - 1n < head ? from + CHUNK - 1n : head;
    const logs = await publicClient.getLogs({ address: ADDR.ask, events: EVENTS, fromBlock: from, toBlock: to });
    for (const log of logs) {
      if (log.eventName === "Asked") {
        const p = await prices();
        await db.upsertAsked({
          id: String(log.args.id),
          hash: log.args.contentHash!,
          asker: log.args.asker!.toLowerCase(),
          breadth: Number(log.args.breadth),
          priority: log.args.priority!,
          cost: String(log.args.cost),
          closes_at: log.args.closesAt!,
          block: String(log.blockNumber),
          tx: log.transactionHash,
          log_index: log.logIndex,
          min_hold_zc: String(tokensFor(MIN_HOLD, p.zc)),
          min_hold_sc: p.sc ? String(tokensFor(MIN_HOLD, p.sc)) : null,
        });
      } else if (log.eventName === "Finalized") {
        await db.setFinalized(String(log.args.id), log.args.resultRoot!, log.args.rewardRoot!, String(log.args.rewardTotal), log.transactionHash);
      } else if (log.eventName === "Refunded") {
        await db.setRefunded(String(log.args.id));
      }
    }
    await db.set("indexer", String(to));
    from = to + 1n;
  }
  await db.pruneDrafts();
}
