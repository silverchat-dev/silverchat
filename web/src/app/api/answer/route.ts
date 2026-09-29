import { isAddress, isHex, type Address, type Hex } from "viem";

import { MIN_HOLD_USD } from "@/lib/algorithm";
import { AGES, domain, REGIONS, tagsHash, types } from "@/lib/answer";
import type { Content } from "@/lib/content";
import { publicClient } from "@/lib/server/chain";
import { db } from "@/lib/server/db";
import { chainTime, isEligible } from "@/lib/server/eligibility";
import { clientIp, limited } from "@/lib/server/rate";

export const dynamic = "force-dynamic";

const headers = { "cache-control": "no-store" };
const fail = (error: string, status = 400) => Response.json({ error }, { status, headers });

export async function POST(req: Request) {
  if (limited(`answer:${clientIp(req)}`, 30)) return fail("too many requests", 429);
  if (Number(req.headers.get("content-length") ?? 0) > 4096) return fail("too large", 413);

  const b = await req.json().catch(() => null);
  if (!b || typeof b.pollId !== "string" || !/^\d{1,20}$/.test(b.pollId)) return fail("bad poll id");
  if (typeof b.voter !== "string" || !isAddress(b.voter)) return fail("bad address");
  if (typeof b.salt !== "string" || !isHex(b.salt) || b.salt.length !== 66) return fail("bad salt");
  if (typeof b.signature !== "string" || !isHex(b.signature)) return fail("bad signature");
  const region = typeof b.region === "string" && REGIONS.includes(b.region) ? b.region : "";
  const age = typeof b.age === "string" && AGES.includes(b.age) ? b.age : "";

  const poll = await db.poll(b.pollId);
  if (!poll) return fail("no such poll", 404);
  if (poll.status !== "open" || poll.closes_at <= (await chainTime())) return fail("this poll is closed", 409);
  if (!poll.content) return fail("this poll has no published question");

  const { questions } = JSON.parse(poll.content) as Content;
  const choices = b.choices;
  if (!Array.isArray(choices) || choices.length !== questions.length) return fail("answer every question once");
  if (!choices.every((c: unknown, i: number) => Number.isInteger(c) && (c as number) >= 0 && (c as number) < questions[i].options.length)) {
    return fail("a choice is out of range");
  }

  const voter = b.voter.toLowerCase() as Address;
  // verifyTypedData also accepts smart-account signatures (ERC-1271), so a Safe holding ZC can answer
  let valid: boolean;
  try {
    valid = await publicClient.verifyTypedData({
      address: voter,
      domain: domain(),
      types,
      primaryType: "Answer",
      message: { pollId: BigInt(b.pollId), choices, tagsHash: tagsHash(region, age), salt: b.salt as Hex },
      signature: b.signature as Hex,
    });
  } catch {
    return fail("could not check the signature right now, try again", 503);
  }
  if (!valid) return fail("the signature does not match", 401);
  if (!(await isEligible(poll, voter))) return fail(`this wallet held less than $${MIN_HOLD_USD} of ZC or SC when the poll opened`, 403);

  const added = await db.addAnswer({ poll_id: b.pollId, voter, choices, region, age, salt: b.salt, signature: b.signature });
  if (!added) return fail("this wallet already answered", 409);
  return Response.json({ ok: true }, { headers });
}
