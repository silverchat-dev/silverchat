import { db } from "@/lib/server/db";
import { finalTrees } from "@/lib/server/trees";

export const dynamic = "force-dynamic";

/** Every answer of a fixed poll as (choices, salt), no voter: enough to recompute the result root and the totals. */
export async function GET(_req: Request, { params }: RouteContext<"/api/polls/[id]/leaves">) {
  const { id } = await params;
  const headers = { "cache-control": "public, max-age=300" };
  const poll = /^\d{1,20}$/.test(id) ? await db.poll(id) : null;
  if (!poll || poll.status !== "final" || !poll.seed) return Response.json({ error: "not a fixed poll" }, { status: 404, headers });
  const t = await finalTrees(poll);
  const answers = t.answers.map((a) => ({ choices: a.choices, salt: a.salt })).sort((x, y) => (x.salt < y.salt ? -1 : 1));
  return Response.json({ id, resultRoot: poll.result_root, answers }, { headers });
}
