import { isAddress, type Address } from "viem";

import { db } from "@/lib/server/db";
import { isEligible } from "@/lib/server/eligibility";
import { serialize } from "@/lib/server/polls";
import { clientIp, limited } from "@/lib/server/rate";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: RouteContext<"/api/polls/[id]">) {
  const { id } = await params;
  const headers = { "cache-control": "no-store" };
  if (!/^\d{1,20}$/.test(id)) return Response.json({ error: "not found" }, { status: 404, headers });
  const row = await db.poll(id);
  if (!row) return Response.json({ error: "not found" }, { status: 404, headers });

  const body = { ...serialize(row), answers: await db.answerCount(id) };
  // ?address= says whether a wallet may answer an open poll. It never says whether it did: that would out the voter.
  const address = new URL(req.url).searchParams.get("address");
  if (address && isAddress(address) && row.status === "open") {
    if (limited(`you:${clientIp(req)}`, 30)) return Response.json({ error: "too many requests" }, { status: 429, headers });
    return Response.json({ ...body, you: { eligible: await isEligible(row, address.toLowerCase() as Address) } }, { headers });
  }
  return Response.json(body, { headers });
}
