import { isAddress } from "viem";

import { ADDR, ZERO } from "@/lib/config";
import { db } from "@/lib/server/db";
import { busy, clientIp, limited } from "@/lib/server/rate";
import { board, serializeTokens } from "@/lib/server/realm";

export const dynamic = "force-dynamic";

/**
 * The board: launches sorted and filtered (?sort, ?q, ?base, ?page), the featured one, the ticker and what SilverRealm
 * has burned. With ?realm, one Realm's launches, newest first.
 */
export async function GET(req: Request) {
  if (limited(`realm:${clientIp(req)}`, 120)) return Response.json({ error: "too many requests" }, { status: 429 });
  if (ADDR.realmFactory === ZERO) return Response.json({ error: "SilverRealm is not live" }, { status: 404 });
  const p = new URL(req.url).searchParams;
  const realm = p.get("realm");
  const headers = { "cache-control": "no-store" };
  if (realm) {
    if (busy()) return Response.json({ error: "busy right now, try again in a minute" }, { status: 503 });
    if (!isAddress(realm)) return Response.json({ error: "bad address" }, { status: 400 });
    const [rows, burned] = await Promise.all([db.realmTokens({ realm: realm.toLowerCase() }, 60), db.realmBurned()]);
    return Response.json({ tokens: await serializeTokens(rows), burned }, { headers });
  }
  return Response.json(await board({ sort: p.get("sort"), q: p.get("q"), base: p.get("base"), page: p.get("page") }), { headers });
}
