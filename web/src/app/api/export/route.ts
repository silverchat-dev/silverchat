import { db } from "@/lib/server/db";
import { serialize } from "@/lib/server/polls";

export const dynamic = "force-dynamic";

/**
 * Every poll with its question, totals and roots, never who answered. Open to any client: build your own Silverchat
 * reader on it (Snowmoon, ch. 3). Answers of a fixed poll are at /api/polls/[id]/leaves.
 */
export async function GET() {
  const rows = await db.polls(10_000);
  return Response.json({ polls: rows.map(serialize) }, { headers: { "cache-control": "public, max-age=60" } });
}
