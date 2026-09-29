import { isAddress, type Address } from "viem";

import { askAbi } from "@/lib/abi";
import { ADDR } from "@/lib/config";
import { publicClient } from "@/lib/server/chain";
import { db } from "@/lib/server/db";
import { clientIp, limited } from "@/lib/server/rate";
import { finalTrees } from "@/lib/server/trees";

export const dynamic = "force-dynamic";

const WINDOW = 90 * 86_400;

/** Rewards this address can still claim, with proofs. Checked against the chain on every call. */
export async function GET(req: Request, { params }: RouteContext<"/api/claims/[address]">) {
  const headers = { "cache-control": "no-store" };
  if (limited(`claims:${clientIp(req)}`, 60)) return Response.json({ error: "too many requests" }, { status: 429, headers });
  const { address } = await params;
  if (!isAddress(address)) return Response.json({ error: "bad address" }, { status: 400, headers });
  const account = address.toLowerCase() as Address;

  const found: { id: string; amount: string; proof: string[] }[] = [];
  for (const poll of await db.finalSince(Math.floor(Date.now() / 1000) - WINDOW)) {
    const t = await finalTrees(poll);
    if (!t.reward) continue;
    for (const [i, [who, amount]] of t.reward.entries()) {
      if (String(who).toLowerCase() === account) found.push({ id: poll.id, amount: String(amount), proof: t.reward.getProof(i) });
    }
  }
  if (!found.length) return Response.json({ claims: [] }, { headers });

  // someone may have claimed on this address's behalf since; the chain decides
  const claimed = await publicClient.multicall({
    contracts: found.map((f) => ({ address: ADDR.ask, abi: askAbi, functionName: "claimed", args: [BigInt(f.id), account] }) as const),
    allowFailure: false,
  });
  return Response.json({ claims: found.filter((_, i) => !claimed[i]) }, { headers });
}
