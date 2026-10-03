import { isAddress } from "viem";

import { clientIp, limited } from "@/lib/server/rate";
import { scoreOf } from "@/lib/server/score";

export const dynamic = "force-dynamic";

/** One wallet's Predict record, only when its profile is public. */
export async function GET(req: Request, { params }: RouteContext<"/api/scores/[address]">) {
  if (limited(`scores:${clientIp(req)}`, 60)) return Response.json({ error: "too many requests" }, { status: 429 });
  const { address } = await params;
  if (!isAddress(address)) return Response.json({ error: "bad address" }, { status: 400 });
  const s = await scoreOf(address.toLowerCase());
  if (!s) return Response.json({ error: "this profile is not public" }, { status: 404 });
  return Response.json(s, { headers: { "cache-control": "public, max-age=60" } });
}
