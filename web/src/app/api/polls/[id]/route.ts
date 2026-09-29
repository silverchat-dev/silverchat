import { isAddress, type Address } from "viem";

import { db } from "@/lib/server/db";
import { isEligible } from "@/lib/server/eligibility";
import { serialize } from "@/lib/server/polls";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: RouteContext<"/api/polls/[id]">) {
  const { id } = await params;
  const headers = { "cache-control": "no-store" };
  if (!/^\d{1,20}$/.test(id)) return Response.json({ error: "not found" }, { status: 404, headers });
  const row = await db.poll(id);
  if (!row) return Response.json({ error: "not found" }, { status: 404, headers });

  const body = { ...serialize(row), answers: await db.answerCount(id) };
  // ?address= tells a wallet whether it can answer; while open that is all anyone learns, never the totals
  const address = new URL(req.url).searchParams.get("address");
  if (address && isAddress(address)) {
    const voter = address.toLowerCase() as Address;
    return Response.json({ ...body, you: { eligible: await isEligible(row, voter), answered: await db.answered(id, voter) } }, { headers });
  }
  return Response.json(body, { headers });
}
