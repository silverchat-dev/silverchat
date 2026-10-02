import "server-only";

import { MIN_HOLD_USD } from "@/lib/algorithm";
import { askAbi } from "@/lib/abi";
import { ADDR, CHAIN_ID, DEPLOY_BLOCK, PREDICT_BLOCK, REALM_BLOCK, ZERO } from "@/lib/config";

import { publicClient } from "./chain";
import { db } from "./db";
import { onPredictLog, PREDICT_EVENTS, syncMarkets } from "./predict";
import { prices, tokensFor } from "./price";
import { onRealmLog, REALM_ADDRESSES, REALM_EVENTS } from "./realm";

// the RPC's free plan answers eth_getLogs for at most 10 blocks at a time
const CHUNK = 10n;
// every tick looks back this far again, so a reorg that reorders asks heals itself; with the 2-block lag below this
// keeps a normal tick to one request
const TAIL = 6n;
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
  // on mainnet, two blocks behind the tip, so a short reorg can't leave a result here that the chain dropped (a local
  // fork only makes blocks when it is sent something)
  const head = (await publicClient.getBlockNumber()) - (CHAIN_ID === 1 ? 2n : 0n);
  const saved = await db.get("indexer");
  let from = saved ? BigInt(saved) + 1n : DEPLOY_BLOCK;
  // SilverPredict goes live after SilverAsk: the first time it is on, read its logs from its own deploy block
  const predictOn = ADDR.predict !== ZERO && PREDICT_BLOCK > 0n;
  // keyed by address, so a new SilverPredict is read from its own deploy block too
  const rewind = predictOn && !(await db.get(`indexer:predict:${ADDR.predict.toLowerCase()}`));
  if (rewind && PREDICT_BLOCK < from) from = PREDICT_BLOCK;
  // the same for SilverRealm
  const realmOn = ADDR.realmFactory !== ZERO && REALM_BLOCK > 0n;
  const rewindRealm = realmOn && !(await db.get(`indexer:realm:${ADDR.realmFactory.toLowerCase()}`));
  if (rewindRealm && REALM_BLOCK < from) from = REALM_BLOCK;
  if (from > head - TAIL) from = head - TAIL;
  if (from < DEPLOY_BLOCK) from = DEPLOY_BLOCK;

  while (from <= head) {
    const to = from + CHUNK - 1n < head ? from + CHUNK - 1n : head;
    // one request for both contracts: the free plan's 10-block chunks make every extra call count
    const predict = ADDR.predict !== ZERO;
    const realm = REALM_ADDRESSES().map((a) => a.toLowerCase());
    const logs = await publicClient.getLogs({
      address: [ADDR.ask, ...(predict ? [ADDR.predict] : []), ...REALM_ADDRESSES()],
      events: [...EVENTS, ...(predict ? PREDICT_EVENTS : []), ...(realm.length ? REALM_EVENTS : [])],
      fromBlock: from,
      toBlock: to,
    });
    const touched = new Set<string>();
    const times = new Map<bigint, number>();
    for (const log of logs) {
      if (predict && log.address.toLowerCase() === ADDR.predict.toLowerCase()) {
        touched.add(await onPredictLog(log as Parameters<typeof onPredictLog>[0]));
      } else if (realm.includes(log.address.toLowerCase())) {
        if (!times.has(log.blockNumber)) times.set(log.blockNumber, Number((await publicClient.getBlock({ blockNumber: log.blockNumber })).timestamp));
        await onRealmLog(log as Parameters<typeof onRealmLog>[0], times.get(log.blockNumber)!);
      } else if (log.eventName === "Asked") {
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
        const id = String(log.args.id);
        // our finalizer writes its roots before it sends; anything else fixed on-chain means the poster key is not ours alone
        const row = await db.poll(id);
        if (row && (row.result_root !== log.args.resultRoot || row.reward_root !== log.args.rewardRoot)) {
          console.error(`[indexer] ALERT poll ${id} was fixed with roots this server did not compute (tx ${log.transactionHash}); rotate the poster key`);
        }
        // our finalizer stamps when it sent the tx; after a rebuild from the chain, the log's block time stands in
        const at = row?.finalize_at ?? Number((await publicClient.getBlock({ blockNumber: log.blockNumber })).timestamp);
        await db.setFinalized(id, log.args.resultRoot!, log.args.rewardRoot!, String(log.args.rewardTotal), log.transactionHash, at);
      } else if (log.eventName === "Refunded") {
        await db.setRefunded(String(log.args.id));
      }
    }
    await syncMarkets(touched);
    await db.set("indexer", String(to));
    from = to + 1n;
  }
  if (rewind) await db.set(`indexer:predict:${ADDR.predict.toLowerCase()}`, "1");
  if (rewindRealm) await db.set(`indexer:realm:${ADDR.realmFactory.toLowerCase()}`, "1");
  await db.pruneDrafts();
  await db.pruneRealmImages();
}
