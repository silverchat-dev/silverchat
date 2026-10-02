import "server-only";

import { encodeAbiParameters, keccak256, type Address } from "viem";

import { poolManagerAbi, priceFeedAbi } from "@/lib/abi";
import { ADDR, ZERO } from "@/lib/config";

import { publicClient } from "./chain";

/** What asking one person costs, in dollars; the pricer turns it into ZC. */
export const USD_PER_PERSON = process.env.PRICE_USD_PER_PERSON ?? "1";

const WAD = 10n ** 18n;
const Q192 = 2n ** 192n;
// Stockereum builds every pool the same way: fee 0 (the hook charges), tick spacing 200
export const poolId = (a: Address, b: Address, hook: Address = ADDR.stockereumHook) => {
  const [c0, c1] = BigInt(a) < BigInt(b) ? [a, b] : [b, a];
  return keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }],
      [c0, c1, 0, 200, hook],
    ),
  );
};

/** `quote` per 1 `token` (wad) from the v4 slot0 at `block`. */
async function spot(token: Address, quote: Address, block: bigint, hook?: Address) {
  const slot = keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [poolId(token, quote, hook), 6n]));
  const raw = await publicClient.readContract({ address: ADDR.poolManager, abi: poolManagerAbi, functionName: "extsload", args: [slot], blockNumber: block });
  const sqrtP = BigInt(raw) & ((1n << 160n) - 1n);
  if (sqrtP === 0n) throw new Error("pool not initialized");
  // price = currency1 per currency0
  return BigInt(token) < BigInt(quote) ? (sqrtP * sqrtP * WAD) / Q192 : (Q192 * WAD) / (sqrtP * sqrtP);
}

/** Dollars per one base coin of SilverRealm at `block`: ETH from Chainlink, the coins from their pools then. */
export function usdAt(base: string, block: bigint) {
  // one answer per coin and block: twenty trades in a block ask the chain once
  const key = `${base}:${block}`;
  let hit = usdAtCache.get(key);
  if (!hit) {
    hit = readUsdAt(base, block);
    hit.catch(() => usdAtCache.delete(key));
    usdAtCache.set(key, hit);
    if (usdAtCache.size > 2000) usdAtCache.delete(usdAtCache.keys().next().value!);
  }
  return hit;
}

const usdAtCache = new Map<string, Promise<number | null>>();

async function readUsdAt(base: string, block: bigint) {
  const [, answer, , updatedAt] = await publicClient.readContract({ address: ADDR.ethUsdFeed, abi: priceFeedAbi, functionName: "latestRoundData", blockNumber: block });
  const { timestamp } = await publicClient.getBlock({ blockNumber: block });
  // the same guard as ethUsd(): a price, not older than two heartbeats at that block
  if (answer <= 0n || Number(timestamp) - Number(updatedAt) > 7200) throw new Error("ETH/USD feed was stale at that block");
  const eth = Number(answer) / 1e8;
  if (base === ADDR.weth.toLowerCase()) return eth;
  const zcInEth = Number(await spot(ADDR.zc, ADDR.weth, block)) / 1e18;
  if (base === ADDR.zc.toLowerCase()) return zcInEth * eth;
  if (base === ADDR.sc.toLowerCase()) return (Number(await spot(ADDR.sc, ADDR.zc, block)) / 1e18) * zcInEth * eth;
  if (base === ADDR.stocker.toLowerCase()) return (Number(await spot(ADDR.stocker, ADDR.weth, block, ADDR.stockereumOldHook)) / 1e18) * eth;
  return null;
}

/** Median over the last ~12 minutes, so one block's trade cannot set the price. */
async function median(token: Address, quote: Address, hook?: Address) {
  const head = await publicClient.getBlockNumber();
  const xs = await Promise.all([0n, 10n, 30n, 60n].map((back) => spot(token, quote, head - back, hook)));
  xs.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return (xs[1] + xs[2]) / 2n;
}

export async function ethUsd() {
  const [, answer, , updatedAt] = await publicClient.readContract({ address: ADDR.ethUsdFeed, abi: priceFeedAbi, functionName: "latestRoundData" });
  // the feed updates at least hourly; allow two heartbeats before calling it stale
  if (answer <= 0n || Date.now() / 1000 - Number(updatedAt) > 7200) throw new Error("ETH/USD feed is stale");
  return BigInt(answer) * 10n ** 10n;
}

type Prices = { at: number; zc: bigint; sc: bigint | null; eth: bigint; stocker: bigint | null };
let cached: Prices | null = null;
let inflight: Promise<Prices> | null = null;

async function read(): Promise<Prices> {
  const [wethPerZc, usdPerEth] = await Promise.all([median(ADDR.zc, ADDR.weth), ethUsd()]);
  const zc = (wethPerZc * usdPerEth) / WAD;
  // a pool that isn't there yet (or is younger than the median's 60 blocks) is "no SC price", not a failed read
  const sc =
    ADDR.sc === ZERO
      ? null
      : await median(ADDR.sc, ADDR.zc).then(
          (x) => (x * zc) / WAD,
          (e) => {
            if (e instanceof Error && e.message === "pool not initialized") return null;
            throw e;
          },
        );
  // STOCKER trades against WETH on Stockereum's first hook; only SilverRealm needs it, so a failed read is "no price"
  const stocker = await median(ADDR.stocker, ADDR.weth, ADDR.stockereumOldHook).then(
    (x) => (x * usdPerEth) / WAD,
    () => null,
  );
  return { at: Date.now(), zc, sc, eth: usdPerEth, stocker };
}

/**
 * USD per token, wad. SC is null until it has a pool. Cached for a minute; callers at the same moment share one read,
 * and a failed refresh falls back to the last good reading for up to 15 minutes.
 */
export async function prices(): Promise<Prices> {
  if (cached && Date.now() - cached.at < 60_000) return cached;
  inflight ??= read()
    .then((p) => (cached = p))
    .catch((e) => {
      if (cached && Date.now() - cached.at < 15 * 60_000) return cached;
      throw e;
    })
    .finally(() => (inflight = null));
  return inflight;
}

/** Tokens (wei) worth `usd` dollars at `usdPerToken` (wad). */
export const tokensFor = (usd: bigint, usdPerToken: bigint) => (usd * WAD) / usdPerToken;
