import { db } from "@/lib/server/db";
import { serialize } from "@/lib/server/polls";
import { clientIp, limited } from "@/lib/server/rate";

export const dynamic = "force-dynamic";

/**
 * Every poll with its question, totals and roots, never who answered. Open to any client: build your own Silverchat
 * reader on it (Snowmoon, ch. 3). Answers of a fixed poll are at /api/polls/[id]/leaves.
 */
export async function GET(req: Request) {
  if (limited(`export:${clientIp(req)}`, 10)) return Response.json({ error: "too many requests" }, { status: 429 });
  const rows = await db.polls(10_000);
  return Response.json({ polls: rows.map(serialize) }, { headers: { "cache-control": "public, max-age=60" } });
}
