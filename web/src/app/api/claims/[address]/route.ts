import { isAddress, isHex, type Address, type Hex } from "viem";

import { askAbi } from "@/lib/abi";
import { ADDR } from "@/lib/config";
import { rewardsMessage } from "@/lib/rewards";
import { publicClient } from "@/lib/server/chain";
import { db } from "@/lib/server/db";
import { busy, clientIp, limited } from "@/lib/server/rate";
import { finalTrees } from "@/lib/server/trees";

export const dynamic = "force-dynamic";

const WINDOW = 90 * 86_400;
const DAY = 86_400_000;

/**
 * Rewards an address can still claim, with proofs. Only the wallet itself may ask: which polls it was paid in says
 * which polls it answered, so the request carries a signature of `rewardsMessage` for today or yesterday, in the
 * `x-rewards-signature` header.
 */
export async function GET(req: Request, { params }: RouteContext<"/api/claims/[address]">) {
  const headers = { "cache-control": "no-store" };
  if (limited(`claims:${clientIp(req)}`, 30)) return Response.json({ error: "too many requests" }, { status: 429, headers });
  if (busy()) return Response.json({ error: "busy right now, try again in a minute" }, { status: 503, headers });
  const { address } = await params;
  const q = new URL(req.url).searchParams;
  const day = q.get("day") ?? "";
  // the signature comes in a header, so it doesn't end up in anyone's access logs
  const sig = req.headers.get("x-rewards-signature") ?? "";
  if (!isAddress(address)) return Response.json({ error: "bad address" }, { status: 400, headers });
  const fresh = [0, 1].some((back) => new Date(Date.now() - back * DAY).toISOString().slice(0, 10) === day);
  if (!fresh || !isHex(sig)) return Response.json({ error: "sign the rewards message first" }, { status: 401, headers });
  const ok = await publicClient.verifyMessage({ address, message: rewardsMessage(address, day), signature: sig as Hex }).catch(() => false);
  if (!ok) return Response.json({ error: "the signature does not match" }, { status: 401, headers });

  const account = address.toLowerCase() as Address;
  const found: { id: string; amount: string; proof: string[] }[] = [];
  for (const poll of await db.answeredFinal(account, Math.floor(Date.now() / 1000) - WINDOW)) {
    const t = await finalTrees(poll).catch(() => null);
    if (!t?.reward) continue;
    try {
      found.push({ id: poll.id, amount: t.each.toString(), proof: t.reward.getProof([account, t.each.toString()]) });
    } catch {
      // answered, but not drawn for a paid place
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
