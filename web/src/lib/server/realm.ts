import "server-only";

import { encodeAbiParameters, keccak256, parseGwei, type Hex, type Log } from "viem";

import { poolManagerAbi, realmBurnerAbi, realmFactoryAbi, realmHookAbi } from "@/lib/abi";
import { ADDR, CHAIN_ID, ZERO } from "@/lib/config";
import { refused } from "@/lib/moderation";
import { BASES } from "@/lib/realm";

import { publicClient, send, walletFor } from "./chain";
import { db, type RealmTokenStats } from "./db";
import { ethUsd, prices } from "./price";

export const REALM_EVENTS = [...realmFactoryAbi, ...realmHookAbi, ...realmBurnerAbi].filter((x) => x.type === "event");
export const REALM_ADDRESSES = () => (ADDR.realmFactory === ZERO ? [] : [ADDR.realmFactory, ADDR.realmHook, ADDR.realmBurner]);

type RealmLog = Log & { eventName: string; args: Record<string, unknown> };

const lower = (x: unknown) => String(x).toLowerCase();

/** Store one SilverRealm log. `at` is its block's time. */
export async function onRealmLog(log: RealmLog, at: number) {
  const a = log.args;
  const id = `${log.blockNumber}:${log.logIndex}`;
  switch (log.eventName) {
    case "Launched":
      return db.upsertRealmToken(lower(a.token), {
        realm: lower(a.realm),
        base: lower(a.base),
        fee_ppm: Number(a.feePpm),
        pool_id: String(a.poolId),
        opening_tick: Number(a.openingTick),
        block: String(log.blockNumber),
        tx: log.transactionHash!,
        at,
      });
    case "Metadata":
      return db.upsertRealmToken(lower(a.token), { name: String(a.name).slice(0, 64), symbol: String(a.symbol).slice(0, 16), uri: String(a.uri).slice(0, 300) });
    case "LaunchBurn":
      return db.upsertRealmToken(lower(a.token), { sc_burned: String(a.scBurned) });
    case "DevBuy":
      return db.upsertRealmToken(lower(a.token), { dev_buy: String(a.tokens) });
    case "Trade":
      return db.saveRealmTrade({
        id,
        pool_id: String(a.poolId),
        trader: lower(a.sender),
        buy: Boolean(a.buy),
        amount_in: String(a.amountIn),
        amount_out: String(a.amountOut),
        fee: String(a.fee),
        block: String(log.blockNumber),
        at,
      });
    case "Burned":
      return db.saveRealmBurn({ id, base: lower(a.base), amount: String(a.amount), sc_burned: String(a.scBurned), zc_burned: String(a.zcBurned), block: String(log.blockNumber), at });
  }
}

/** Base per token (a float, both 18 decimals) of each pool now, from slot0, in one multicall. */
async function pricesOf(rows: RealmTokenStats[]) {
  if (!rows.length) return [];
  const slots = rows.map((r) => keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [r.pool_id as Hex, 6n])));
  const raw = await publicClient
    .multicall({ contracts: slots.map((s) => ({ address: ADDR.poolManager, abi: poolManagerAbi, functionName: "extsload", args: [s] }) as const) })
    .catch(() => rows.map(() => null));
  return rows.map((r, i) => {
    const res = raw[i];
    if (!res || res.status !== "success") return null;
    const sqrt = Number(BigInt(res.result) & ((1n << 160n) - 1n)) / 2 ** 96;
    // slot0 is currency1 per currency0
    return BigInt(r.token) < BigInt(r.base) ? sqrt * sqrt : 1 / (sqrt * sqrt);
  });
}

/** What the whole supply was worth in the base when the pool opened, from its opening tick. */
const openingValue = (r: RealmTokenStats) => {
  const perToken = BigInt(r.base) < BigInt(r.token) ? 1.0001 ** -r.opening_tick : 1.0001 ** r.opening_tick;
  return perToken * 1e9;
};

/**
 * The public shape of launched tokens, prices read together. A name or symbol with a refused word is not shown, like
 * a removed poll.
 */
export async function serializeTokens(rows: RealmTokenStats[]) {
  const prices = await pricesOf(rows);
  return rows.map((t, i) => {
    const hidden = !!refused({ v: 1, questions: [{ q: `${t.name ?? ""} ${t.symbol ?? ""}`, options: [] }] });
    return {
      token: t.token,
      realm: t.realm,
      base: t.base,
      feePpm: t.fee_ppm,
      poolId: t.pool_id,
      name: hidden ? null : t.name,
      symbol: hidden ? null : t.symbol,
      uri: hidden ? null : t.uri,
      hidden,
      price: prices[i],
      openingValue: openingValue(t),
      scBurned: t.sc_burned,
      devBuy: t.dev_buy,
      trades: t.trades,
      fees: t.fees,
      at: t.at,
      tx: t.tx,
    };
  });
}

// ---- keeper: turns the burner's fees into burned SC and ZC

const keeper = walletFor(process.env.KEEPER_PRIVATE_KEY);
const MIN_USD = 20;
const MAX_USD = 500;
const AT_LEAST_EVERY = 7 * 86_400_000;
// minimums 5% under what recent prices say, after the pools' 1% fees
const SLACK = 0.95;
const FEE_CAP = parseGwei("10");

export async function realmTick() {
  if (!keeper || ADDR.realmBurner === ZERO) return;
  const [p, eth] = await Promise.all([prices(), ethUsd()]);
  if (!p.sc) return;
  const usd = { [ADDR.weth.toLowerCase()]: Number(eth) / 1e18, [ADDR.zc.toLowerCase()]: Number(p.zc) / 1e18, [ADDR.sc.toLowerCase()]: Number(p.sc) / 1e18 };
  const zcUsd = usd[ADDR.zc.toLowerCase()];
  const scUsd = usd[ADDR.sc.toLowerCase()];
  for (const b of BASES) {
    let amount = (await publicClient.readContract({ address: ADDR.realmBurner, abi: realmBurnerAbi, functionName: "pending", args: [b.address] })) as bigint;
    if (amount === 0n) continue;
    const value = (Number(amount) / 1e18) * usd[b.address.toLowerCase()];
    // not worth the gas
    if (value < 1) continue;
    const last = Number((await db.get(`realm:convert:${b.id}`)) ?? "0");
    if (value < MIN_USD && Date.now() - last < AT_LEAST_EVERY) continue;
    // at most $500 a time, so a backlog never asks the pools for more than their minimums allow; the rest goes next tick
    if (value > MAX_USD) amount = (amount * BigInt(Math.floor((MAX_USD / value) * 1e6))) / 1_000_000n;

    const units = Number(amount) / 1e18;
    let sc: number;
    let zc: number;
    if (b.id === "sc") {
      sc = units * 0.8;
      zc = ((units * 0.2 * scUsd) / zcUsd) * 0.99;
    } else {
      const allZc = b.id === "zc" ? units : ((units * usd[b.address.toLowerCase()]) / zcUsd) * 0.99;
      zc = allZc * 0.2;
      sc = ((allZc * 0.8 * zcUsd) / scUsd) * 0.99;
    }
    const wei = (x: number) => BigInt(Math.floor(x * SLACK * 1e6)) * 10n ** 12n;
    const hash = await send(keeper, { address: ADDR.realmBurner, abi: realmBurnerAbi, functionName: "convert", args: [b.address, amount, wei(sc), wei(zc)] }, FEE_CAP);
    const r = await publicClient.waitForTransactionReceipt({ hash, confirmations: CHAIN_ID === 1 ? 2 : 1, timeout: 180_000 });
    if (r.status !== "success") throw new Error(`convert ${b.id} reverted in ${hash}`);
    await db.set(`realm:convert:${b.id}`, String(Date.now()));
  }
}
