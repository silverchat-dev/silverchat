import { db } from "@/lib/server/db";
import { serializeMarket } from "@/lib/server/predict";
import { clientIp, limited } from "@/lib/server/rate";

export const dynamic = "force-dynamic";

/** Every Predict market, newest first. Sides show only once they are revealed on-chain, after close. */
export async function GET(req: Request) {
  if (limited(`markets:${clientIp(req)}`, 60)) return Response.json({ error: "too many requests" }, { status: 429 });
  const rows = await db.markets(200);
  return Response.json({ markets: rows.map(serializeMarket) }, { headers: { "cache-control": "no-store" } });
}
