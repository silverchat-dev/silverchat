import { canonical, contentHash, parseContent } from "@/lib/content";
import { db, type PollRow } from "@/lib/server/db";
import { serialize } from "@/lib/server/polls";
import { clientIp, limited } from "@/lib/server/rate";

export const dynamic = "force-dynamic";

const headers = { "cache-control": "no-store" };

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const limit = Math.min(Math.max(Number(params.get("limit")) || 50, 1), 100);
  const status = params.get("status") as PollRow["status"] | null;
  if (status && status !== "open" && status !== "final" && status !== "refunded") {
    return Response.json({ error: "status must be open, final or refunded" }, { status: 400, headers });
  }
  const rows = await db.polls(limit, status ?? undefined);
  return Response.json({ polls: rows.map(serialize) }, { headers });
}

/** Publish poll content before paying for it. The same content always gets the same hash. */
export async function POST(req: Request) {
  if (limited(`polls:${clientIp(req)}`, 20)) return Response.json({ error: "too many requests" }, { status: 429, headers });
  if (Number(req.headers.get("content-length") ?? 0) > 16_384) return Response.json({ error: "too large" }, { status: 413, headers });

  const body = await req.json().catch(() => null);
  const content = parseContent(body);
  if (typeof content === "string") return Response.json({ error: content }, { status: 400, headers });

  const text = canonical(content);
  const hash = contentHash(text);
  await db.saveDraft(hash, text);
  return Response.json({ contentHash: hash }, { headers });
}
