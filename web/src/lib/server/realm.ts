import "server-only";

import { encodeAbiParameters, keccak256, parseGwei, type Hex, type Log } from "viem";

import { poolManagerAbi, realmBurnerAbi, realmFactoryAbi, realmHookAbi } from "@/lib/abi";
import { ADDR, CHAIN_ID, ZERO } from "@/lib/config";
import { refused } from "@/lib/moderation";
import { BASES, GRADUATION, imageSrc } from "@/lib/realm";

import { publicClient, send, walletFor } from "./chain";
import { db, type RealmTokenStats } from "./db";
import { ethUsd, prices, usdAt } from "./price";

export const REALM_EVENTS = [...realmFactoryAbi, ...realmHookAbi, ...realmBurnerAbi].filter((x) => x.type === "event");
export const REALM_ADDRESSES = () => (ADDR.realmFactory === ZERO ? [] : [ADDR.realmFactory, ADDR.realmHook, ADDR.realmBurner]);

type RealmLog = Log & { eventName: string; args: Record<string, unknown> };

const lower = (x: unknown) => String(x).toLowerCase();

/** Dollars per one base coin now, or null when it cannot be read. */
export async function baseUsd(base: string): Promise<number | null> {
  const p = await prices().catch(() => null);
  if (!p) return null;
  const wad = base === ADDR.weth.toLowerCase() ? p.eth : base === ADDR.zc.toLowerCase() ? p.zc : base === ADDR.sc.toLowerCase() ? p.sc : base === ADDR.stocker.toLowerCase() ? p.stocker : null;
  return wad === null ? null : Number(wad) / 1e18;
}

/** An https link with no user info, or null. */
export function safeUrl(s: string | null) {
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" && !u.username && !u.password ? u.toString() : null;
  } catch {
    return null;
  }
}

const META = /\/api\/realm\/meta\/([0-9a-f]{64})$/;

/**
 * The description, links and image a launch's metadata names, when the uri is our own content-addressed metadata.
 * Everything is checked again here: the JSON was written by whoever launched.
 */
async function readMeta(uri: string) {
  const m = uri.match(META);
  if (!m) return { image: imageSrc(uri) ? uri : null };
  const stored = await db.realmImage(m[1]);
  if (!stored || stored.type !== "application/json") return {};
  try {
    const j = JSON.parse(stored.data.toString("utf8"));
    const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : null);
    const website = safeUrl(text(j.website, 200));
    const x = text(j.x, 15);
    const image = text(j.image, 300);
    return {
      // no control, format or invisible characters (right-to-left overrides, zero-width tricks)
      description: text(j.description, 280)?.replace(/\p{C}/gu, "") ?? null,
      website,
      x: x && /^[A-Za-z0-9_]{1,15}$/.test(x) ? x : null,
      image: image && imageSrc(image) ? image : null,
    };
  } catch {
    return {};
  }
}

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
    case "Metadata": {
      const uri = String(a.uri).slice(0, 300);
      return db.upsertRealmToken(lower(a.token), { name: String(a.name).slice(0, 64), symbol: String(a.symbol).slice(0, 16), uri, ...(await readMeta(uri)) });
    }
    case "LaunchBurn":
      return db.upsertRealmToken(lower(a.token), { sc_burned: String(a.scBurned) });
    case "DevBuy":
      return db.upsertRealmToken(lower(a.token), { dev_buy: String(a.tokens) });
    case "Trade": {
      const base = await db.realmBaseOf(String(a.poolId));
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
        // what the base was worth in that block, so a late or rebuilt index still prices it right
        base_usd: base ? await usdAt(base, log.blockNumber!).catch(() => null) : null,
      });
    }
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
 * The share of a token's supply bought out of its pool, from the pool's own curve: the locked range starts at the
 * opening price and runs to the end of the range, so the tokens left are L/√P and sold = 1 − √(opening / now). Only the
 * price moves it; tokens sent to the PoolManager, donations or claims cannot. 80% sold is a price 25× the opening.
 */
const soldAt = (t: RealmTokenStats, price: number | null) => (price === null ? null : Math.max(0, 1 - Math.sqrt(openingValue(t) / 1e9 / price)));

/**
 * The public shape of launched tokens, prices and pool balances read together. A name or symbol with a refused word is
 * not shown, like a removed poll.
 */
export async function serializeTokens(rows: RealmTokenStats[]) {
  const [prices, usd] = await Promise.all([pricesOf(rows), Promise.all([...new Set(rows.map((r) => r.base))].map(async (b) => [b, await baseUsd(b)] as const))]);
  const sold = rows.map((r, i) => soldAt(r, prices[i]));
  const usdOf = new Map(usd);
  return rows.map((t, i) => {
    const hidden = !!refused({ v: 1, questions: [{ q: `${t.name ?? ""} ${t.symbol ?? ""} ${t.description ?? ""}`, options: [] }] });
    const baseUsd = usdOf.get(t.base) ?? null;
    const price = prices[i];
    const priceUsd = price !== null && baseUsd !== null ? price * baseUsd : null;
    return {
      token: t.token,
      realm: t.realm,
      base: t.base,
      feePpm: t.fee_ppm,
      poolId: t.pool_id,
      name: hidden ? null : t.name,
      symbol: hidden ? null : t.symbol,
      uri: hidden ? null : t.uri,
      image: hidden ? null : (t.image ?? (imageSrc(t.uri) ? t.uri : null)),
      description: hidden ? null : t.description,
      website: hidden ? null : t.website,
      x: hidden ? null : t.x,
      hidden,
      price,
      baseUsd,
      priceUsd,
      marketCapUsd: priceUsd === null ? null : priceUsd * 1e9,
      volumeUsd: t.volume_usd,
      openingValue: openingValue(t),
      sold: sold[i],
      graduated: t.graduated_at !== null || (sold[i] ?? 0) >= GRADUATION,
      graduatedAt: t.graduated_at,
      scBurned: t.sc_burned,
      devBuy: t.dev_buy,
      trades: t.trades,
      fees: t.fees,
      at: t.at,
      tx: t.tx,
    };
  });
}

export type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };

/**
 * Candles in dollars per token from a pool's trades: each trade at the pool's own price, before the hook's fee, times
 * what the base was worth then. The first candle starts at the opening price.
 */
export async function candles(t: RealmTokenStats, seconds: number): Promise<Candle[]> {
  const trades = await db.realmChartTrades(t.pool_id);
  const now = (await baseUsd(t.base)) ?? 0;
  const out: Candle[] = [];
  let last = (openingValue(t) / 1e9) * (trades[0]?.base_usd ?? now);
  const put = (at: number, price: number, volume: number) => {
    const time = at - (at % seconds);
    const c = out.at(-1);
    if (c && c.time === time) {
      c.high = Math.max(c.high, price);
      c.low = Math.min(c.low, price);
      c.close = price;
      c.volume += volume;
    } else {
      out.push({ time, open: last, high: Math.max(last, price), low: Math.min(last, price), close: price, volume });
    }
    last = price;
  };
  put(t.at, last, 0);
  for (const x of trades) {
    const usd = x.base_usd ?? now;
    const [inn, outt, fee] = [Number(x.amount_in), Number(x.amount_out), Number(x.fee)];
    if (!inn || !outt) continue;
    const base = x.buy ? inn - fee : outt + fee;
    const tokens = x.buy ? outt : inn;
    put(x.at, (base / tokens) * usd, (base / 1e18) * usd);
  }
  // a candle for every period up to now, flat where nobody traded, so the chart reads as time and not as a few bars
  const end = Math.floor(Date.now() / 1000);
  const filled: Candle[] = [];
  for (const c of out) {
    const prev = filled.at(-1);
    for (let time = prev ? prev.time + seconds : c.time; prev && time < c.time; time += seconds) {
      filled.push({ time, open: prev.close, high: prev.close, low: prev.close, close: prev.close, volume: 0 });
    }
    filled.push(c);
  }
  for (let c = filled.at(-1); c && c.time + seconds <= end; c = filled.at(-1)) {
    filled.push({ time: c.time + seconds, open: c.close, high: c.close, low: c.close, close: c.close, volume: 0 });
  }
  return filled.slice(-1500);
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
  if (ADDR.realmFactory === ZERO) return;
  // graduation is a milestone: the first time 80% of a supply is out of its pool, note when
  const open = await db.realmUngraduated();
  const rows = (await Promise.all(open.map((x) => db.realmTokens({ token: x.token }, 1)))).flat();
  const spot = await pricesOf(rows);
  for (const [i, x] of rows.entries()) {
    if ((soldAt(x, spot[i]) ?? 0) >= GRADUATION) await db.upsertRealmToken(x.token, { graduated_at: Math.floor(Date.now() / 1000) });
  }
  if (!keeper || ADDR.realmBurner === ZERO) return;
  const [p, eth] = await Promise.all([prices(), ethUsd()]);
  if (!p.sc) return;
  const usd: Record<string, number> = {
    [ADDR.weth.toLowerCase()]: Number(eth) / 1e18,
    [ADDR.zc.toLowerCase()]: Number(p.zc) / 1e18,
    [ADDR.sc.toLowerCase()]: Number(p.sc) / 1e18,
  };
  if (p.stocker) usd[ADDR.stocker.toLowerCase()] = Number(p.stocker) / 1e18;
  const zcUsd = usd[ADDR.zc.toLowerCase()];
  const scUsd = usd[ADDR.sc.toLowerCase()];
  for (const b of BASES) {
    let amount = (await publicClient.readContract({ address: ADDR.realmBurner, abi: realmBurnerAbi, functionName: "pending", args: [b.address] })) as bigint;
    if (amount === 0n || usd[b.address.toLowerCase()] === undefined) continue;
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
      // STOCKER goes to WETH first: one more 1% pool on the way to ZC
      const hops = b.id === "zc" ? 0 : b.id === "stocker" ? 2 : 1;
      const allZc = ((units * usd[b.address.toLowerCase()]) / zcUsd) * 0.99 ** hops;
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
