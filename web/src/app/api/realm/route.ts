import { isAddress, type Address, type Hex } from "viem";

import { ADDR, ZERO } from "@/lib/config";
import { refused } from "@/lib/moderation";
import { db, type RealmTokenStats } from "@/lib/server/db";
import { clientIp, limited } from "@/lib/server/rate";
import { priceOf } from "@/lib/server/realm";

export const dynamic = "force-dynamic";

/** The public shape of a launched token. A name or symbol with a refused word is not shown, like a removed poll. */
export async function serializeToken(t: RealmTokenStats) {
  const hidden = !!refused({ v: 1, questions: [{ q: `${t.name ?? ""} ${t.symbol ?? ""}`, options: [] }] });
  const price = await priceOf(t.pool_id as Hex, t.token as Address, t.base as Address).catch(() => null);
  return {
    token: t.token,
    realm: t.realm,
    base: t.base,
    feePpm: t.fee_ppm,
    poolId: t.pool_id,
    name: hidden ? null : t.name,
    symbol: hidden ? null : t.symbol,
    uri: hidden ? null : t.uri,
    hidden,
    price,
    scBurned: t.sc_burned,
    devBuy: t.dev_buy,
    trades: t.trades,
    fees: t.fees,
    at: t.at,
    tx: t.tx,
  };
}

/** Launches, newest first, optionally one Realm's, and what SilverRealm has burned so far. */
export async function GET(req: Request) {
  if (limited(`realm:${clientIp(req)}`, 120)) return Response.json({ error: "too many requests" }, { status: 429 });
  if (ADDR.realmFactory === ZERO) return Response.json({ error: "SilverRealm is not live" }, { status: 404 });
  const realm = new URL(req.url).searchParams.get("realm");
  if (realm && !isAddress(realm)) return Response.json({ error: "bad address" }, { status: 400 });
  const [rows, burned] = await Promise.all([db.realmTokens(realm ? { realm: realm.toLowerCase() } : {}, 60), db.realmBurned()]);
  return Response.json({ tokens: await Promise.all(rows.map(serializeToken)), burned }, { headers: { "cache-control": "no-store" } });
}
