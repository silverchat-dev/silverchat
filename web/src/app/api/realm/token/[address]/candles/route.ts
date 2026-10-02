import { isAddress } from "viem";

import { ADDR, ZERO } from "@/lib/config";
import { db } from "@/lib/server/db";
import { busy, clientIp, limited } from "@/lib/server/rate";
import { candles } from "@/lib/server/realm";

export const dynamic = "force-dynamic";

const FRAMES = [60, 300, 900, 3600, 14_400, 86_400];

/** Dollar candles for a token's chart: ?tf= seconds per candle (60, 300, 900, 3600, 14400, 86400). */
export async function GET(req: Request, { params }: RouteContext<"/api/realm/token/[address]/candles">) {
  if (limited(`realm:${clientIp(req)}`, 120)) return Response.json({ error: "too many requests" }, { status: 429 });
  if (ADDR.realmFactory === ZERO) return Response.json({ error: "SilverRealm is not live" }, { status: 404 });
  if (busy()) return Response.json({ error: "busy right now, try again in a minute" }, { status: 503 });
  const { address } = await params;
  const tf = Number(new URL(req.url).searchParams.get("tf") ?? 900);
  if (!isAddress(address) || !FRAMES.includes(tf)) return Response.json({ error: "bad address or timeframe" }, { status: 400 });
  const [row] = await db.realmTokens({ token: address.toLowerCase() }, 1);
  if (!row) return Response.json({ error: "not a SilverRealm token" }, { status: 404 });
  return Response.json({ candles: await candles(row, tf) }, { headers: { "cache-control": "no-store" } });
}
