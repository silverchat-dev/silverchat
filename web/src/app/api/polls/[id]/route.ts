import { db } from "@/lib/server/db";
import { serialize } from "@/lib/server/polls";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: RouteContext<"/api/polls/[id]">) {
  const { id } = await params;
  const headers = { "cache-control": "no-store" };
  if (!/^\d{1,20}$/.test(id)) return Response.json({ error: "not found" }, { status: 404, headers });
  const row = await db.poll(id);
  if (!row) return Response.json({ error: "not found" }, { status: 404, headers });
  return Response.json(serialize(row), { headers });
}
