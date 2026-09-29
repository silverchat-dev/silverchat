import "server-only";

import { parseUnits, type Hex } from "viem";

import { askAbi } from "@/lib/abi";
import { ADDR, ZERO } from "@/lib/config";

import { publicClient, send, walletFor } from "./chain";
import { prices, tokensFor } from "./price";

const wallet = walletFor(process.env.PRICER_PRIVATE_KEY);
const USD_PER_PERSON = parseUnits(process.env.PRICE_USD_PER_PERSON ?? "0.10", 18);

let pending: Hex | null = null;

/**
 * Keep `pricePerPerson` at the dollar price in ZC. Pushes only when it drifts more than 5%; a jump of more than 25%
 * in one step is left for a person to check.
 */
export async function priceTick() {
  if (!wallet || ADDR.ask === ZERO) return;
  if (pending) {
    const receipt = await publicClient.getTransactionReceipt({ hash: pending }).catch(() => null);
    if (!receipt) return;
    pending = null;
  }

  const target = tokensFor(USD_PER_PERSON, (await prices()).zc);
  const now = await publicClient.readContract({ address: ADDR.ask, abi: askAbi, functionName: "pricePerPerson" });
  if (now !== 0n) {
    const drift = ((target > now ? target - now : now - target) * 10_000n) / now;
    if (drift <= 500n) return;
    if (drift > 2_500n) throw new Error(`price moved ${Number(drift) / 100}% in one step, not pushing ${target}`);
  }
  pending = await send(wallet, { address: ADDR.ask, abi: askAbi, functionName: "setPrice", args: [target] });
  console.log(`[pricer] ${now} -> ${target} (${pending})`);
}
