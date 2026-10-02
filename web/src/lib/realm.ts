import { type Address } from "viem";

import { ADDR } from "./config";

/** SilverRealm, shared by the browser and the server. */
export const BASES = [
  { id: "eth", name: "ETH", address: ADDR.weth },
  { id: "zc", name: "$ZC", address: ADDR.zc },
  { id: "sc", name: "$SC", address: ADDR.sc },
] as const;
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
