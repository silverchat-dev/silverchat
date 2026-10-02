import { type Address } from "viem";

import { ADDR } from "./config";

/** SilverRealm, shared by the browser and the server. */
export const BASES = [
  { id: "eth", name: "ETH", address: ADDR.weth },
  { id: "zc", name: "$ZC", address: ADDR.zc },
  { id: "sc", name: "$SC", address: ADDR.sc },
  { id: "stocker", name: "$STOCKER", address: ADDR.stocker },
] as const;

/** A token graduates once this share of its supply has left the pool, as on Stockereum: a milestone, nothing moves. */
export const GRADUATION = 0.8;
/** Launches per page of the board. */
export const PAGE = 60;
export const baseOf = (address: string) => BASES.find((b) => b.address.toLowerCase() === address.toLowerCase()) ?? null;

export const FEES = [10_000, 20_000, 30_000] as const;
/** What the whole supply is worth at the opening price, as on Stockereum. */
export const OPENING_FDV_USD = 4000;
export const SUPPLY = 10n ** 27n;

/** A SilverRealm pool: fee 0 (the hook charges), tick spacing 200, the RealmHook. */
export const realmKey = (token: Address, base: Address) => {
  const [c0, c1] = BigInt(token) < BigInt(base) ? [token, base] : [base, token];
  return { currency0: c0, currency1: c1, fee: 0, tickSpacing: 200, hooks: ADDR.realmHook };
};

export const feeLabel = (ppm: number) => `${ppm / 10_000}%`;

/** Where to show a token's image from: our own uploads by their path (so any copy of the site serves them), other https links as they are. */
export function imageSrc(uri: string | null) {
  if (!uri) return null;
  const own = uri.match(/\/api\/realm\/image\/([0-9a-f]{64})$/);
  if (own) return `/api/realm/image/${own[1]}`;
  return /^https:\/\/\S+$/.test(uri) ? uri : null;
}
