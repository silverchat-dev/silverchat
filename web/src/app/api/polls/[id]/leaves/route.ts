import { db } from "@/lib/server/db";
import { clientIp, limited } from "@/lib/server/rate";

export const dynamic = "force-dynamic";

/** Every answer of a fixed poll as (choices, salt), no voter: enough to recompute the result root and the totals. */
export async function GET(req: Request, { params }: RouteContext<"/api/polls/[id]/leaves">) {
  const { id } = await params;
  const headers = { "cache-control": "public, max-age=300" };
  if (limited(`leaves:${clientIp(req)}`, 30)) return Response.json({ error: "too many requests" }, { status: 429, headers: { "cache-control": "no-store" } });
  const poll = /^\d{1,20}$/.test(id) ? await db.poll(id) : null;
  if (!poll || poll.status !== "final") return Response.json({ error: "not a fixed poll" }, { status: 404, headers: { "cache-control": "no-store" } });
  // sorted by salt, so the order says nothing about when anyone answered
  const answers = (await db.answers(poll.id)).map((a) => ({ choices: a.choices, salt: a.salt })).sort((x, y) => (x.salt < y.salt ? -1 : 1));
  return Response.json({ id, resultRoot: poll.result_root, answers }, { headers });
}
