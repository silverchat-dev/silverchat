import { isAddress, type Hex } from "viem";

import { realmHookAbi } from "@/lib/abi";
import { ADDR, ZERO } from "@/lib/config";
import { publicClient } from "@/lib/server/chain";
import { db } from "@/lib/server/db";
import { busy, clientIp, limited } from "@/lib/server/rate";
import { serializeTokens } from "@/lib/server/realm";


export const dynamic = "force-dynamic";

/** One launched token: its pool, price, the fee a trade pays now, and its latest trades. */
export async function GET(req: Request, { params }: RouteContext<"/api/realm/token/[address]">) {
  if (limited(`realm:${clientIp(req)}`, 120)) return Response.json({ error: "too many requests" }, { status: 429 });
  if (ADDR.realmFactory === ZERO) return Response.json({ error: "SilverRealm is not live" }, { status: 404 });
  if (busy()) return Response.json({ error: "busy right now, try again in a minute" }, { status: 503 });
  const { address } = await params;
  if (!isAddress(address)) return Response.json({ error: "bad address" }, { status: 400 });
  const [row] = await db.realmTokens({ token: address.toLowerCase() }, 1);
  if (!row) return Response.json({ error: "not a SilverRealm token" }, { status: 404 });
  const [token, trades, fee] = await Promise.all([
    serializeTokens([row]).then((x) => x[0]),
    db.realmTrades(row.pool_id, 50),
    publicClient.readContract({ address: ADDR.realmHook, abi: realmHookAbi, functionName: "currentFee", args: [row.pool_id as Hex] }).catch(() => null),
  ]);
  return Response.json({ ...token, currentFeePpm: fee === null ? null : Number(fee), recent: trades }, { headers: { "cache-control": "no-store" } });
}
