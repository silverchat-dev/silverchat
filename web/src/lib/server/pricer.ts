import "server-only";

import { parseUnits, type Hex } from "viem";

import { askAbi } from "@/lib/abi";
import { ADDR, ZERO } from "@/lib/config";

import { pricer as wallet, publicClient, send } from "./chain";
import { prices, tokensFor, USD_PER_PERSON } from "./price";

let pending: Hex | null = null;
let pushed = 0;

/**
 * Keep `pricePerPerson` at the dollar price in ZC. Pushes only when it drifts more than 5%, and moves at most 25% per
 * push, so one bad reading cannot swing it far and a real move still gets there in a few minutes.
 */
export async function priceTick() {
  if (!wallet || ADDR.ask === ZERO) return;
  if (pending) {
    // still in the mempool: a new tx would only queue behind it with the next nonce. Wait until it lands or is dropped.
    const landed = await publicClient.getTransactionReceipt({ hash: pending }).catch(() => null);
    if (!landed && (await publicClient.getTransaction({ hash: pending }).catch(() => null))) return;
    pending = null;
  }
  if (Date.now() - pushed < 10 * 60_000) return;

  const target = tokensFor(parseUnits(USD_PER_PERSON, 18), (await prices()).zc);
  const now = await publicClient.readContract({ address: ADDR.ask, abi: askAbi, functionName: "pricePerPerson" });
  let next = target;
  if (now !== 0n) {
    const drift = ((target > now ? target - now : now - target) * 10_000n) / now;
    if (drift <= 500n) return;
    if (drift > 2_500n) next = target > now ? (now * 125n) / 100n : (now * 75n) / 100n;
  }
  const hash = await send(wallet, { address: ADDR.ask, abi: askAbi, functionName: "setPrice", args: [next] });
  pending = hash;
  pushed = Date.now();
  console.log(`[pricer] ${now} -> ${next} (target ${target}, ${hash})`);
}
