import { isAddress } from "viem";

import { ADDR, ZERO } from "@/lib/config";
import { db } from "@/lib/server/db";
import { clientIp, limited } from "@/lib/server/rate";
import { serializeToken } from "@/lib/server/realm";

export const dynamic = "force-dynamic";

/** Launches, newest first, optionally one Realm's, and what SilverRealm has burned so far. */
export async function GET(req: Request) {
  if (limited(`realm:${clientIp(req)}`, 120)) return Response.json({ error: "too many requests" }, { status: 429 });
  if (ADDR.realmFactory === ZERO) return Response.json({ error: "SilverRealm is not live" }, { status: 404 });
  const realm = new URL(req.url).searchParams.get("realm");
  if (realm && !isAddress(realm)) return Response.json({ error: "bad address" }, { status: 400 });
  const [rows, burned] = await Promise.all([db.realmTokens(realm ? { realm: realm.toLowerCase() } : {}, 60), db.realmBurned()]);
  return Response.json({ tokens: await Promise.all(rows.map(serializeToken)), burned }, { headers: { "cache-control": "no-store" } });
}
