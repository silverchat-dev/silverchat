import "server-only";

import { parseUnits, type Hex } from "viem";

import { askAbi } from "@/lib/abi";
import { ADDR, ZERO } from "@/lib/config";

import { publicClient, send, walletFor } from "./chain";
import { prices, tokensFor } from "./price";

const wallet = walletFor(process.env.PRICER_PRIVATE_KEY);
const USD_PER_PERSON = parseUnits(process.env.PRICE_USD_PER_PERSON ?? "0.10", 18);

let pending: { hash: Hex; at: number } | null = null;

/**
 * Keep `pricePerPerson` at the dollar price in ZC. Pushes only when it drifts more than 5%, and moves at most 25% per
 * push, so one bad reading cannot swing it far and a real move still gets there in a few minutes.
 */
export async function priceTick() {
  if (!wallet || ADDR.ask === ZERO) return;
  if (pending) {
    const receipt = await publicClient.getTransactionReceipt({ hash: pending.hash }).catch(() => null);
    // a tx that never lands (dropped in a gas spike) is given up after 10 minutes and sent again
    if (!receipt && Date.now() - pending.at < 10 * 60_000) return;
    pending = null;
  }

  const target = tokensFor(USD_PER_PERSON, (await prices()).zc);
  const now = await publicClient.readContract({ address: ADDR.ask, abi: askAbi, functionName: "pricePerPerson" });
  let next = target;
  if (now !== 0n) {
    const drift = ((target > now ? target - now : now - target) * 10_000n) / now;
    if (drift <= 500n) return;
    if (drift > 2_500n) next = target > now ? (now * 125n) / 100n : (now * 75n) / 100n;
  }
  const hash = await send(wallet, { address: ADDR.ask, abi: askAbi, functionName: "setPrice", args: [next] });
  pending = { hash, at: Date.now() };
  console.log(`[pricer] ${now} -> ${next} (target ${target}, ${hash})`);
}
