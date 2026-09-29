import { isHex } from "viem";

import { db } from "@/lib/server/db";
import { finalTrees } from "@/lib/server/trees";

export const dynamic = "force-dynamic";

/** The proof that one answer is in a fixed poll's result root. Asked for by leaf, which only the voter can compute. */
export async function GET(req: Request) {
  const headers = { "cache-control": "no-store" };
  const q = new URL(req.url).searchParams;
  const id = q.get("poll") ?? "";
  const leaf = q.get("leaf") ?? "";
  if (!/^\d{1,20}$/.test(id) || !isHex(leaf) || leaf.length !== 66) return Response.json({ error: "bad request" }, { status: 400, headers });
  const poll = await db.poll(id);
  if (!poll || poll.status !== "final" || !poll.seed) return Response.json({ error: "not a fixed poll" }, { status: 404, headers });
  const { result } = await finalTrees(poll);
  const i = result ? [...result.entries()].findIndex(([, [l]]) => l === leaf.toLowerCase()) : -1;
  if (!result || i < 0) return Response.json({ included: false, resultRoot: poll.result_root }, { headers });
  return Response.json({ included: true, resultRoot: poll.result_root, proof: result.getProof(i) }, { headers });
}
