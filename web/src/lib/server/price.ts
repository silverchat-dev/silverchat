import "server-only";

import { encodeAbiParameters, keccak256, type Address } from "viem";

import { poolManagerAbi, priceFeedAbi } from "@/lib/abi";
import { ADDR, ZERO } from "@/lib/config";

import { publicClient } from "./chain";

const WAD = 10n ** 18n;
const Q192 = 2n ** 192n;
// Stockereum builds every pool the same way: fee 0 (the hook charges), tick spacing 200
const poolId = (a: Address, b: Address) => {
  const [c0, c1] = BigInt(a) < BigInt(b) ? [a, b] : [b, a];
  return keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }],
      [c0, c1, 0, 200, ADDR.stockereumHook],
    ),
  );
};

/** `quote` per 1 `token` (wad) from the v4 slot0 at `block`. */
async function spot(token: Address, quote: Address, block: bigint) {
  const slot = keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [poolId(token, quote), 6n]));
  const raw = await publicClient.readContract({ address: ADDR.poolManager, abi: poolManagerAbi, functionName: "extsload", args: [slot], blockNumber: block });
  const sqrtP = BigInt(raw) & ((1n << 160n) - 1n);
  if (sqrtP === 0n) throw new Error("pool not initialized");
  // price = currency1 per currency0
  return BigInt(token) < BigInt(quote) ? (sqrtP * sqrtP * WAD) / Q192 : (Q192 * WAD) / (sqrtP * sqrtP);
}

/** Median over the last ~12 minutes, so one block's trade cannot set the price. */
async function median(token: Address, quote: Address) {
  const head = await publicClient.getBlockNumber();
  const xs = await Promise.all([0n, 10n, 30n, 60n].map((back) => spot(token, quote, head - back)));
  xs.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return (xs[1] + xs[2]) / 2n;
}

async function ethUsd() {
  const [, answer, , updatedAt] = await publicClient.readContract({ address: ADDR.ethUsdFeed, abi: priceFeedAbi, functionName: "latestRoundData" });
  // the feed updates at least hourly; allow two heartbeats before calling it stale
  if (answer <= 0n || Date.now() / 1000 - Number(updatedAt) > 7200) throw new Error("ETH/USD feed is stale");
  return BigInt(answer) * 10n ** 10n;
}

type Prices = { at: number; zc: bigint; sc: bigint | null };
let cached: Prices | null = null;
let inflight: Promise<Prices> | null = null;

async function read(): Promise<Prices> {
  const [wethPerZc, usdPerEth] = await Promise.all([median(ADDR.zc, ADDR.weth), ethUsd()]);
  const zc = (wethPerZc * usdPerEth) / WAD;
  const sc = ADDR.sc === ZERO ? null : ((await median(ADDR.sc, ADDR.zc)) * zc) / WAD;
  return { at: Date.now(), zc, sc };
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
