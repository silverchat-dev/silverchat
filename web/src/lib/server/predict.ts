import "server-only";

import { formatEther, type Address, type Hex, type Log } from "viem";

import { predictAbi, priceFeedAbi, realityAbi } from "@/lib/abi";
import { ADDR, ZERO } from "@/lib/config";
import { KEEPER_REVEALS_AFTER, REVEAL_WINDOW, STATUS, badTitle, feedName, priceTitle, titleOf } from "@/lib/market";

import { publicClient, send, walletFor } from "./chain";
import { db, type MarketRow } from "./db";
import { chainTime } from "./eligibility";

export const PREDICT_EVENTS = predictAbi.filter((x) => x.type === "event");

const keeper = walletFor(process.env.KEEPER_PRIVATE_KEY);
const LOW_ETH = 5n * 10n ** 16n;
const UNRESOLVED = `0x${"f".repeat(63)}e`;
const NO_ANSWER_VOID = 30 * 86_400;
const BATCH = 50;
let checked = 0;

type PredictLog = Log & { eventName: string; args: Record<string, unknown> };

/** Store one SilverPredict log. Returns the market it touched, so the caller can read that market back from the chain. */
export async function onPredictLog(log: PredictLog): Promise<string> {
  const a = log.args;
  const id = String(a.id);
  switch (log.eventName) {
    case "Opened":
      await db.upsertMarket(id, {
        kind: Number(a.kind),
        opener: String(a.opener).toLowerCase(),
        closes_at: Number(a.closesAt),
        resolves_at: Number(a.resolvesAt),
        lock: String(a.lock),
        block: String(log.blockNumber),
        tx: log.transactionHash!,
      });
      break;
    case "PriceMarket":
      await db.upsertMarket(id, { feed: String(a.feed).toLowerCase(), threshold: String(a.threshold) });
      break;
    case "EventMarket":
      await db.upsertMarket(id, {
        question_id: String(a.questionId),
        question: String(a.question),
        arbitrator: String(a.arbitrator).toLowerCase(),
        min_bond: String(a.minBond),
      });
      break;
    case "Staked":
      await db.upsertStake({ market_id: id, staker: String(a.staker).toLowerCase(), amount: String(a.amount), commitment: String(a.commitment) });
      break;
    case "Revealed":
      await db.setStake(id, String(a.staker).toLowerCase(), { side: Number(a.side) });
      break;
    case "Claimed":
      await db.setStake(id, String(a.staker).toLowerCase(), { claimed: true });
      break;
  }
  return id;
}

/** Pool, revealed totals and status come from the contract itself, never added up here. */
export async function syncMarkets(ids: Iterable<string>) {
  const list = [...new Set(ids)];
  if (!list.length || ADDR.predict === ZERO) return;
  const rows = await publicClient.multicall({
    contracts: list.map((id) => ({ address: ADDR.predict, abi: predictAbi, functionName: "market", args: [BigInt(id)] }) as const),
    allowFailure: false,
  });
  for (const [i, m] of rows.entries()) {
    await db.upsertMarket(list[i], {
      pool: String(m.pool),
      yes: String(m.yes),
      no: String(m.no),
      payout: String(m.payout),
      status: m.status,
      refund: m.refund,
      invalid: m.invalid,
      lock_claimed: m.lockClaimed,
    });
  }
}

/** The public shape of a market. A question with a refused word is not shown, like a removed poll. */
export function serializeMarket(m: MarketRow) {
  const price = m.kind === 0;
  const hidden = !price && !!m.question && !!badTitle(titleOf(m.question));
  return {
    id: m.id,
    kind: price ? ("price" as const) : ("event" as const),
    title: price ? (m.feed && m.threshold ? priceTitle(m.feed, BigInt(m.threshold), m.resolves_at) : null) : hidden || !m.question ? null : titleOf(m.question),
    hidden,
    question: hidden ? null : m.question,
    feed: m.feed ? feedName(m.feed) : null,
    threshold: m.threshold,
    questionId: m.question_id,
    opener: m.opener,
    closesAt: m.closes_at,
    resolvesAt: m.resolves_at,
    revealEnds: m.closes_at + REVEAL_WINDOW,
    lock: m.lock,
    pool: m.pool,
    stakes: m.stakes ?? 0,
    // sides are only known from reveals, which open at close
    yes: m.yes,
    no: m.no,
    payout: m.payout,
    status: STATUS[m.status] ?? "none",
    refund: m.refund,
    invalid: m.invalid,
    lockClaimed: m.lock_claimed,
    tx: m.tx,
  };
}

/**
 * The keeper: reveals the seals it holds once the stakers' own browsers had 48 of the 72 hours, settles markets
 * when they can be settled, reopens a Reality question that was answered too soon, voids what can only be voided
 * and sends the SC lock of an invalid market to the treasury. It never answers a question; the operator does that
 * on reality.eth.
 */
export async function predictTick() {
  if (!keeper || ADDR.predict === ZERO) return;
  if (Date.now() - checked > 10 * 60_000) {
    checked = Date.now();
    const eth = await publicClient.getBalance({ address: keeper.account.address });
    if (eth < LOW_ETH) console.error(`[keeper] keeper has ${formatEther(eth)} ETH left`);
  }
  const now = await chainTime();
  for (const m of await db.marketsToKeep()) {
    try {
      await keep(m, now);
    } catch (e) {
      console.error(`[keeper] market ${m.id}:`, e instanceof Error ? e.message.split("\n")[0] : e);
    }
  }
}

const call = (functionName: string, args: readonly unknown[]) => ({ address: ADDR.predict, abi: predictAbi, functionName, args });

/** Send, wait for it, then read the market back, so the next tick never sends the same thing twice. */
async function sendAndWait(id: string, c: ReturnType<typeof call>) {
  const hash = await send(keeper!, c);
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 180_000 });
  if (receipt.status !== "success") throw new Error(`${c.functionName} reverted in ${hash}`);
  await syncMarkets([id]);
  return hash;
}

async function keep(m: MarketRow, now: number) {
  const id = BigInt(m.id);
  if (m.status !== 1) {
    await sendAndWait(m.id, call("claimLock", [id]));
    return;
  }
  const windowEnd = m.closes_at + REVEAL_WINDOW;
  if (now >= m.closes_at + KEEPER_REVEALS_AFTER && now < windowEnd) {
    const seals = await db.sealsToReveal(m.id);
    for (let i = 0; i < seals.length; i += BATCH) {
      const batch = seals.slice(i, i + BATCH);
      await sendAndWait(
        m.id,
        call("reveal", [id, batch.map((s) => s.staker as Address), batch.map((s) => s.side), batch.map((s) => s.salt as Hex)]),
      );
      for (const s of batch) await db.setStake(m.id, s.staker, { side: s.side });
    }
    return;
  }
  if (now < Math.max(m.resolves_at, windowEnd)) return;

  if (m.kind === 0 && m.feed) {
    const round = await roundAt(m.feed as Address, m.resolves_at);
    if (round !== null) return void (await sendAndWait(m.id, call("settlePrice", [id, round])));
  } else if (m.question_id) {
    const settled = await sendAndWait(m.id, call("settleEvent", [id])).catch(() => null);
    if (settled) return;
    await reopenIfTooSoon(m);
  }
  // only an unanswered event after 30 days, or anything after 180; the contract decides, the simulation asks it
  if (now >= m.resolves_at + NO_ANSWER_VOID) await sendAndWait(m.id, call("voidMarket", [id])).catch(() => null);
}

/** Reality marks an answer given before the question opened as "too soon"; a reopened copy lets it be answered again. */
async function reopenIfTooSoon(m: MarketRow) {
  const qid = m.question_id as Hex;
  const read = (functionName: "isFinalized" | "resultFor") =>
    publicClient.readContract({ address: ADDR.reality, abi: realityAbi, functionName, args: [qid] });
  if (!(await read("isFinalized")) || (await read("resultFor")) !== UNRESOLVED) return;
  const hash = await keeper!.writeContract({
    address: ADDR.reality,
    abi: realityAbi,
    functionName: "reopenQuestion",
    // same content, arbitrator, timeout and bond; a nonce SilverPredict never uses
    args: [0n, m.question!, m.arbitrator as Address, 2 * 86_400, m.resolves_at, (1n << 128n) + BigInt(m.id), BigInt(m.min_bond ?? 0), qid],
  });
  await publicClient.waitForTransactionReceipt({ hash, timeout: 180_000 });
  console.error(`[keeper] market ${m.id}: reopened a question answered too soon (${hash})`);
}

/**
 * The Chainlink round that was the latest at `t`, by binary search in the feed's current phase. Null while the round
 * after it does not exist yet. A time before the current phase began is left for a hand settle; it needs the old
 * aggregator's last round, which happens once in years.
 */
async function roundAt(feed: Address, t: number): Promise<bigint | null> {
  const read = async (round: bigint) =>
    Number((await publicClient.readContract({ address: feed, abi: priceFeedAbi, functionName: "getRoundData", args: [round] }))[3]);
  const [latest, , , latestAt] = await publicClient.readContract({ address: feed, abi: priceFeedAbi, functionName: "latestRoundData" });
  if (Number(latestAt) <= t) return null;
  const phase = latest >> 64n;
  let lo = 1n;
  let hi = latest & ((1n << 64n) - 1n);
  if ((await read((phase << 64n) | lo)) > t) {
    console.error(`[keeper] ${feedName(feed)}: ${t} is before the current Chainlink phase; settle with settlePrice by hand`);
    return null;
  }
  while (lo < hi) {
    const mid = (lo + hi + 1n) / 2n;
    if ((await read((phase << 64n) | mid)) <= t) lo = mid;
    else hi = mid - 1n;
  }
  return (phase << 64n) | lo;
}
