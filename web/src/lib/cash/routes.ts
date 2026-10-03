import { encodeFunctionData, erc20Abi, parseAbi, type Address, type Hex } from "viem";

import { routerAbi } from "@/lib/abi";
import { ADDR } from "@/lib/config";

/**
 * A private swap is a list of calls RelayAdapt makes with the coins it was just given out of Railgun: approve
 * Stockereum's router, swap on the SC/ZC or ZC/WETH pool, wrap or unwrap ETH. Railgun then shields back whatever
 * RelayAdapt holds of the coin bought. Every call must succeed or the whole transaction reverts, so a moved price
 * refuses the swap instead of filling it worse than `minOut`.
 */
export const RELAY_ADAPT = "0xAc9f360Ae85469B27aEDdEaFC579Ef2d052aD405" as Address;
export const RAILGUN = "0xfa7093cdd9ee6932b4eb2c9e1cde7ce00b1fa4b9" as Address;

export type Coin = "sc" | "zc" | "eth";
export type Call = { to: Address; data: Hex; value: bigint };

// inside Railgun, ETH is held as WETH
export const tokenOf = (c: Coin) => (c === "sc" ? ADDR.sc : c === "zc" ? ADDR.zc : ADDR.weth);

// Stockereum builds every pool the same way: fee 0 (the hook charges), tick spacing 200
const key = (a: Address, b: Address) => {
  const [currency0, currency1] = BigInt(a) < BigInt(b) ? [a, b] : [b, a];
  return { currency0, currency1, fee: 0, tickSpacing: 200, hooks: ADDR.stockereumHook };
};
export const scZc = () => key(ADDR.sc, ADDR.zc);
export const zcWeth = () => key(ADDR.zc, ADDR.weth);

const relayAbi = parseAbi(["function wrapBase(uint256 amount)", "function unwrapBase(uint256 amount)"]);
const call = (to: Address, data: Hex, value = 0n): Call => ({ to, data, value });
const approve = (token: Address, amount: bigint) => call(token, encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [ADDR.stockereumRouter, amount] }));
const router = (data: Hex, value = 0n) => call(ADDR.stockereumRouter, data, value);

/**
 * The calls for swapping `amount` of `from` (what RelayAdapt holds after Railgun's unshield fee) into `to`, refusing
 * less than `minOut`. SC and ETH meet through ZC in one router call each way.
 */
export function swapCalls(from: Coin, to: Coin, amount: bigint, minOut: bigint): Call[] {
  const r = (functionName: string, args: unknown[], value = 0n) =>
    router(encodeFunctionData({ abi: routerAbi, functionName, args } as Parameters<typeof encodeFunctionData>[0]), value);
  const route = `${from}>${to}`;
  switch (route) {
    case "sc>zc":
      return [approve(ADDR.sc, amount), r("sell", [scZc(), ADDR.sc, ADDR.zc, amount, minOut, "0x"])];
    case "zc>sc":
      return [approve(ADDR.zc, amount), r("buy", [scZc(), ADDR.zc, amount, minOut, "0x"])];
    case "zc>eth":
      return [approve(ADDR.zc, amount), r("sell", [zcWeth(), ADDR.zc, ADDR.weth, amount, minOut, "0x"])];
    case "eth>zc":
      return [approve(ADDR.weth, amount), r("buy", [zcWeth(), ADDR.weth, amount, minOut, "0x"])];
    case "sc>eth":
      // SC to ZC to ETH in one router call, then the ETH back into WETH so Railgun can shield it
      return [
        approve(ADDR.sc, amount),
        r("sellForEth", [scZc(), ADDR.sc, ADDR.zc, amount, 0n, minOut, "0x"]),
        call(RELAY_ADAPT, encodeFunctionData({ abi: relayAbi, functionName: "wrapBase", args: [0n] })),
      ];
    case "eth>sc":
      // WETH out to ETH, then ETH to ZC to SC in one router call
      return [
        call(RELAY_ADAPT, encodeFunctionData({ abi: relayAbi, functionName: "unwrapBase", args: [amount] })),
        r("buyWithEth", [scZc(), ADDR.zc, 0n, minOut, "0x"], amount),
      ];
    default:
      throw new Error(`no route ${route}`);
  }
}

/** What RelayAdapt is left with after Railgun takes its unshield fee (basis points) from `amount`. */
export const afterFee = (amount: bigint, feeBps: bigint) => amount - (amount * feeBps) / 10_000n;
