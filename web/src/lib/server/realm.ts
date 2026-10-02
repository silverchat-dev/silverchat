import "server-only";

import { encodeAbiParameters, keccak256, parseGwei, type Hex, type Log } from "viem";

import { poolManagerAbi, realmBurnerAbi, realmFactoryAbi, realmHookAbi } from "@/lib/abi";
import { ADDR, CHAIN_ID, ZERO } from "@/lib/config";
import { busy } from "@/lib/server/rate";
import { refused } from "@/lib/moderation";
import { BASES, GRADUATION, imageSrc, PAGE } from "@/lib/realm";

import { publicClient, send, walletFor } from "./chain";
import { db, type RealmFeedRow, type RealmTokenStats } from "./db";
import { displayTime } from "./eligibility";
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
  if (!stored || stored.type !== "application/json") return { image: null };
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
    return { image: null };
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
        // the hook sees the router (or the factory, for a creator's first buy), not the wallet; the wallet is whoever
        // sent the transaction
        trader: [ADDR.stockereumRouter, ADDR.realmFactory].some((x) => x.toLowerCase() === lower(a.sender))
          ? lower((await publicClient.getTransaction({ hash: log.transactionHash! }).catch(() => null))?.from ?? a.sender)
          : lower(a.sender),
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
type PoolFields = Pick<RealmTokenStats, "token" | "base" | "pool_id" | "opening_tick">;

async function pricesOf(rows: PoolFields[]) {
  if (!rows.length) return [];
  const slots = rows.map((r) => keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [r.pool_id as Hex, 6n])));
  const raw = await publicClient
    // one call for all of them: extsload is cheap, and viem's default batch would split a full board into hundreds
    .multicall({ batchSize: 0, contracts: slots.map((s) => ({ address: ADDR.poolManager, abi: poolManagerAbi, functionName: "extsload", args: [s] }) as const) })
    .catch(() => rows.map(() => null));
  return rows.map((r, i) => {
    const res = raw[i];
    if (!res || res.status !== "success") return null;
    const sqrt = Number(BigInt(res.result) & ((1n << 160n) - 1n)) / 2 ** 96;
    // a pool that is not there (the wrong chain, a bad row) has no price, not an infinite one
    if (sqrt === 0) return null;
    // slot0 is currency1 per currency0
    return BigInt(r.token) < BigInt(r.base) ? sqrt * sqrt : 1 / (sqrt * sqrt);
  });
}

/** What the whole supply was worth in the base when the pool opened, from its opening tick. */
const openingValue = (r: PoolFields) => {
  const perToken = BigInt(r.base) < BigInt(r.token) ? 1.0001 ** -r.opening_tick : 1.0001 ** r.opening_tick;
  return perToken * 1e9;
};

/**
 * The share of a token's supply bought out of its pool, from the pool's own curve: the locked range starts at the
 * opening price and runs to the end of the range, so the tokens left are L/√P and sold = 1 − √(opening / now). Only the
 * price moves it; tokens sent to the PoolManager, donations or claims cannot. 80% sold is a price 25× the opening.
 */
const soldAt = (t: PoolFields, price: number | null) => (price === null ? null : Math.max(0, 1 - Math.sqrt(openingValue(t) / 1e9 / price)));

/**
 * The public shape of launched tokens, prices and pool balances read together. A name or symbol with a refused word is
 * not shown, like a removed poll.
 */
const isHidden = (t: { name: string | null; symbol: string | null; description: string | null }) =>
  !!refused({ v: 1, questions: [{ q: `${t.name ?? ""} ${t.symbol ?? ""} ${t.description ?? ""}`, options: [] }] });

/** Base per token a trade was made at, before the hook's fee, as the chart reads it. */
const tradePrice = (buy: boolean, amountIn: string, amountOut: string, fee: string) => {
  const [inn, out, f] = [Number(amountIn), Number(amountOut), Number(fee)];
  if (!inn || !out) return null;
  return buy ? (inn - f) / out : (out + f) / inn;
};

export async function serializeTokens(rows: RealmTokenStats[]) {
  const [prices, usd] = await Promise.all([pricesOf(rows), Promise.all([...new Set(rows.map((r) => r.base))].map(async (b) => [b, await baseUsd(b)] as const))]);
  const sold = rows.map((r, i) => soldAt(r, prices[i]));
  const usdOf = new Map(usd);
  return rows.map((t, i) => {
    const hidden = isHidden(t);
    const baseUsd = usdOf.get(t.base) ?? null;
    const price = prices[i];
    const priceUsd = price !== null && baseUsd !== null ? price * baseUsd : null;
    // the price a day ago: the last trade before then, or the opening price if nobody had traded yet
    const then = (t.p24_buy !== null && tradePrice(t.p24_buy, t.p24_in!, t.p24_out!, t.p24_fee!)) || openingValue(t) / 1e9;
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
      volume24hUsd: t.volume_24h,
      trades24h: t.trades_24h,
      lastTradeAt: t.last_trade_at,
      // untouched for a day is unchanged: the last trade's own price sits a little off the pool's after it
      change24h: price === null ? null : t.trades_24h === 0 ? 0 : price / then - 1,
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

export type TokenView = Awaited<ReturnType<typeof serializeTokens>>[number];

export const SORTS = ["trending", "new", "cap", "close", "graduated"] as const;
export type Sort = (typeof SORTS)[number];

/**
 * The board's order and filters over every launch: trending is the last day's volume, then the latest trade; close is
 * the most bought of the tokens not graduated yet. Hidden tokens are left out. `q` matches a name, symbol or address.
 */
export function arrange(list: TokenView[], o: { sort: Sort; q?: string; base?: string; page?: number }) {
  const q = o.q?.trim().toLowerCase();
  let out = list.filter(
    (t) => !t.hidden && (!o.base || t.base === o.base) && (!q || t.token === q || t.name?.toLowerCase().includes(q) || t.symbol?.toLowerCase().includes(q)),
  );
  const by = <T,>(f: (t: TokenView) => T, desc = true) => (a: TokenView, b: TokenView) => {
    const [x, y] = [f(a), f(b)];
    return x === y ? 0 : (x ?? -Infinity) < (y ?? -Infinity) === desc ? 1 : -1;
  };
  const then = (...fs: ((a: TokenView, b: TokenView) => number)[]) => (a: TokenView, b: TokenView) => fs.reduce((r, f) => r || f(a, b), 0);
  const newest = by((t) => t.at);
  if (o.sort === "close") out = out.filter((t) => !t.graduated);
  if (o.sort === "graduated") out = out.filter((t) => t.graduated);
  out.sort(
    {
      trending: then(by((t) => t.volume24hUsd), by((t) => t.lastTradeAt), newest),
      new: newest,
      cap: then(by((t) => t.marketCapUsd), newest),
      close: then(by((t) => t.sold), newest),
      graduated: then(by((t) => t.graduatedAt), newest),
    }[o.sort],
  );
  const page = Math.max(0, o.page ?? 0);
  return { tokens: out.slice(page * PAGE, (page + 1) * PAGE), total: out.length };
}

// every launch is read and priced in one go, cached 10 s; fine to about 1,000 launches, then keep the price and the
// share sold in realm_tokens (the keeper's tick reads them already) and sort in SQL
let everything: { at: number; list: Promise<TokenView[]> } | null = null;

export function allTokens() {
  if (!everything || Date.now() - everything.at > 10_000) {
    // only a refresh reads the chain, so only a refresh counts against the shared budget; a busy minute serves the last one
    if (everything && busy()) {
      // and the next try waits another 10 s, so a busy minute is not kept busy by the board itself
      everything.at = Date.now();
      return everything.list;
    }
    const list = db.realmTokens({}, 1000).then(serializeTokens);
    everything = { at: Date.now(), list };
    list.catch(() => (everything = null));
  }
  return everything.list;
}

/** The board's featured token: the biggest that has not graduated and traded in the last day, or the newest. */
export function featured(list: TokenView[]) {
  const shown = list.filter((t) => !t.hidden);
  const live = shown.filter((t) => !t.graduated && t.trades24h > 0).sort((a, b) => (b.marketCapUsd ?? 0) - (a.marketCapUsd ?? 0));
  return live[0] ?? shown.reduce<TokenView | null>((n, t) => (!n || t.at > n.at ? t : n), null);
}

/** The ticker's rows in dollars, hidden tokens left out. */
export async function feed(limit = 30) {
  const rows = await db.realmFeed(limit);
  return rows
    .filter((r) => !isHidden(r))
    .map((r: RealmFeedRow) => ({
      kind: r.kind,
      // trades indexed before the wallet was read show the router; no name beats a wrong one
      who: [ADDR.stockereumRouter, ADDR.realmFactory].some((x) => x.toLowerCase() === r.who) ? null : r.who,
      buy: r.buy,
      usd: r.base_amount === null || r.base_usd === null ? null : (Number(r.base_amount) / 1e18) * r.base_usd,
      token: r.token,
      symbol: r.symbol,
      image: r.image ?? (imageSrc(r.uri) ? r.uri : null),
      at: r.at,
    }));
}
export type FeedItem = Awaited<ReturnType<typeof feed>>[number];

/** Everything the board shows for one view of it, the same for the first render and every refresh. */
export async function board(o: { sort?: string | null; q?: string | null; base?: string | null; page?: string | number | null }) {
  const sort = (SORTS as readonly string[]).includes(o.sort ?? "") ? (o.sort as Sort) : "trending";
  const base = BASES.find((b) => b.id === o.base)?.address.toLowerCase();
  const page = Math.min(100, Math.max(0, Number.parseInt(String(o.page ?? "0"), 10) || 0));
  const [list, burned, ticker, now] = await Promise.all([allTokens(), db.realmBurned(), feed(), displayTime()]);
  const { tokens, total } = arrange(list, { sort, q: o.q?.slice(0, 64), base, page });
  const volumeUsd = list.reduce((s, t) => s + (t.volumeUsd ?? 0), 0);
  // the view as read, with the base as its short name, so a page can hand it back
  const view = { sort, base: BASES.find((b) => b.address.toLowerCase() === base)?.id ?? "" };
  return { tokens, total, featured: featured(list), burned, volumeUsd, feed: ticker, now, ...view };
}
export type Board = Awaited<ReturnType<typeof board>>;

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
  // a candle for every period up to now, flat where nobody traded, so the chart reads as time and not as a few bars;
  // at most the last 1,500 periods, carried in from the last candle before them
  const end = Math.floor(Date.now() / 1000);
  const from = end - (end % seconds) - 1499 * seconds;
  const before = out.filter((c) => c.time < from).at(-1);
  const recent = out.filter((c) => c.time >= from);
  if (before && (!recent.length || recent[0].time > from)) {
    recent.unshift({ time: from, open: before.close, high: before.close, low: before.close, close: before.close, volume: 0 });
  }
  const filled: Candle[] = [];
  for (const c of recent) {
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
  const rows = await db.realmUngraduated();
  const spot = await pricesOf(rows);
  for (const [i, x] of rows.entries()) {
    if ((soldAt(x, spot[i]) ?? 0) >= GRADUATION) await db.upsertRealmToken(x.token, { graduated_at: Math.floor(Date.now() / 1000) });
  }
  // trades whose dollar price could not be read when indexed get it now, from their own block
  for (const x of await db.realmTradesWithoutUsd(50)) {
    const usd = await usdAt(x.base, BigInt(x.block)).catch(() => null);
    if (usd !== null) await db.setRealmTradeUsd(x.id, usd);
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
