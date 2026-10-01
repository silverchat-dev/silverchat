import { isAddress, isHex, type Address, type Hex } from "viem";

import { predictAbi } from "@/lib/abi";
import { ADDR, ZERO } from "@/lib/config";
import { commitmentOf, NO, YES, type Side } from "@/lib/market";
import { publicClient } from "@/lib/server/chain";
import { db } from "@/lib/server/db";
import { busy, clientIp, limited } from "@/lib/server/rate";

export const dynamic = "force-dynamic";

const headers = { "cache-control": "no-store" };
const fail = (error: string, status = 400) => Response.json({ error }, { status, headers });

/**
 * Hand the keeper your sealed side, so it can reveal it if your browser does not within 48 hours of close. It is kept
 * only if it opens the commitment SilverPredict holds for you right now. No route ever gives a seal back.
 */
export async function POST(req: Request, { params }: RouteContext<"/api/markets/[id]/seal">) {
  if (limited(`seal:${clientIp(req)}`, 30)) return fail("too many requests", 429);
  if (Number(req.headers.get("content-length") ?? Infinity) > 1024) return fail("too large", 413);
  if (ADDR.predict === ZERO) return fail("Predict is not live", 404);
  const { id } = await params;
  if (!/^\d{1,20}$/.test(id)) return fail("bad market id");
  const b = await req.json().catch(() => null);
  if (!b || typeof b.staker !== "string" || !isAddress(b.staker)) return fail("bad address");
  if (b.side !== YES && b.side !== NO) return fail("side must be 1 or 2");
  if (typeof b.salt !== "string" || !isHex(b.salt) || b.salt.length !== 66) return fail("bad salt");
  if (busy()) return fail("busy right now, try again in a minute", 503);

  const staker = b.staker.toLowerCase() as Address;
  // from the chain, not the indexer: the stake may be seconds old
  const [amount, commitment] = await publicClient.readContract({
    address: ADDR.predict,
    abi: predictAbi,
    functionName: "stakes",
    args: [BigInt(id), staker],
  });
  if (amount === 0n) return fail("no stake from this wallet in this market", 404);
  if (commitmentOf(BigInt(id), staker, b.side as Side, b.salt as Hex) !== commitment) return fail("this seal does not open your stake", 401);
  await db.saveSeal({ market_id: id, staker, side: b.side, salt: b.salt });
  return Response.json({ ok: true }, { headers });
}
