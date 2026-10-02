import { isAddress, isHex, type Hex } from "viem";

import { publicClient } from "@/lib/server/chain";
import { db } from "@/lib/server/db";
import { busy, clientIp, limited } from "@/lib/server/rate";
import { profileMessage } from "@/lib/you";

export const dynamic = "force-dynamic";

const headers = { "cache-control": "no-store" };
const fail = (error: string, status = 400) => Response.json({ error }, { status, headers });

/** Whether a wallet's profile is public. Public already: the profile page answers the same question. */
export async function GET(req: Request) {
  if (limited(`profile:${clientIp(req)}`, 60)) return fail("too many requests", 429);
  const address = new URL(req.url).searchParams.get("address") ?? "";
  if (!isAddress(address)) return fail("bad address");
  return Response.json({ public: (await db.profile(address.toLowerCase()))?.public ?? false }, { headers });
}

/**
 * Show or hide a profile, signed by the wallet. The signature must be from the last ten minutes (a minute ahead is
 * allowed for clock drift) and newer than the one that set it last, so an old signature cannot be replayed.
 */
export async function POST(req: Request) {
  if (limited(`profile-set:${clientIp(req)}`, 10)) return fail("too many requests", 429);
  if (Number(req.headers.get("content-length") ?? Infinity) > 2048) return fail("too large", 413);
  const b = await req.json().catch(() => null);
  if (!b || typeof b.address !== "string" || !isAddress(b.address)) return fail("bad address");
  if (typeof b.public !== "boolean") return fail("public must be true or false");
  if (!Number.isInteger(b.at)) return fail("bad time");
  if (typeof b.signature !== "string" || !isHex(b.signature)) return fail("bad signature");
  const now = Math.floor(Date.now() / 1000);
  if (b.at < now - 600) return fail("the signature is too old, sign again");
  if (b.at > now + 60) return fail("this device's clock is ahead, check it and sign again");
  if (busy()) return fail("busy right now, try again in a minute", 503);

  const address = b.address.toLowerCase();
  const ok = await publicClient
    .verifyMessage({ address, message: profileMessage(address, b.public, b.at), signature: b.signature as Hex })
    .catch(() => false);
  if (!ok) return fail("the signature does not match", 401);
  if (!(await db.setProfile(address, b.public, b.at))) return fail("a newer choice is already saved", 409);
  return Response.json({ public: b.public }, { headers });
}
