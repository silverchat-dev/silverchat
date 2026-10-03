import { isAddress, isHex, type Hex } from "viem";

import { agentDomain, agentTypes } from "@/lib/agent";
import { refused } from "@/lib/moderation";
import { publicClient } from "@/lib/server/chain";
import { db } from "@/lib/server/db";
import { busy, clientIp, limited } from "@/lib/server/rate";
import { safeUrl } from "@/lib/server/realm";

export const dynamic = "force-dynamic";

const headers = { "cache-control": "no-store" };
const fail = (error: string, status = 400) => Response.json({ error }, { status, headers });

/** Wallets that say they are agents, newest first. Public by design: an agent's flag is what splits results. */
export async function GET(req: Request) {
  if (limited(`agents:${clientIp(req)}`, 60)) return fail("too many requests", 429);
  const list = await db.agents();
  return Response.json({ agents: list.map(({ address, name, url, signed_at }) => ({ address, name, url, since: signed_at })) }, { headers });
}

/**
 * Say a wallet is an agent, or stop saying it, with an EIP-712 Agent signature (see /docs#agents). The signature must be
 * from the last ten minutes and newer than the one saved, so an old one cannot be replayed. Answers given while a
 * wallet is an agent count on the agents' side of results fixed while it still is.
 */
export async function POST(req: Request) {
  if (limited(`agents-set:${clientIp(req)}`, 10)) return fail("too many requests", 429);
  if (Number(req.headers.get("content-length") ?? Infinity) > 2048) return fail("too large", 413);
  const b = await req.json().catch(() => null);
  if (!b || typeof b.address !== "string" || !isAddress(b.address)) return fail("bad address");
  // the name is signed as sent, so it must already be tidy: no spaces at either end, at least one letter or number
  if (typeof b.name !== "string" || !/^[\p{L}\p{N}](?:[\p{L}\p{N} ._-]{0,38}[\p{L}\p{N}._-])?$/u.test(b.name)) {
    return fail("a name of 1 to 40 letters, numbers, spaces, dots and dashes, starting with a letter or number");
  }
  if (typeof b.url !== "string" || b.url.length > 200 || (b.url && !safeUrl(b.url))) return fail("the link must be https, at most 200 characters, or empty");
  if (typeof b.active !== "boolean") return fail("active must be true or false");
  if (!Number.isInteger(b.at)) return fail("bad time");
  if (typeof b.signature !== "string" || !isHex(b.signature)) return fail("bad signature");
  if (refused({ v: 1, questions: [{ q: b.name, options: [] }] })) return fail("that name is not allowed");
  const now = Math.floor(Date.now() / 1000);
  if (b.at < now - 600) return fail("the signature is too old, sign again");
  if (b.at > now + 60) return fail("this device's clock is ahead, check it and sign again");
  if (busy()) return fail("busy right now, try again in a minute", 503);

  const address = b.address.toLowerCase();
  const ok = await publicClient
    .verifyTypedData({
      address,
      domain: agentDomain(),
      types: agentTypes,
      primaryType: "Agent",
      message: { name: b.name, url: b.url, active: b.active, at: BigInt(b.at) },
      signature: b.signature as Hex,
    })
    .catch(() => false);
  if (!ok) return fail("the signature does not match", 401);
  if (!(await db.setAgent({ address, name: b.name, url: b.url || null, active: b.active, signed_at: b.at }))) return fail("a newer declaration is already saved", 409);
  return Response.json({ address, active: b.active }, { headers });
}
