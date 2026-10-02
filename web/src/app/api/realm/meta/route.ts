import { createHash } from "node:crypto";

import { ADDR, ZERO } from "@/lib/config";
import { refused } from "@/lib/moderation";
import { imageSrc } from "@/lib/realm";
import { db } from "@/lib/server/db";
import { safeUrl } from "@/lib/server/realm";
import { clientIp, limited } from "@/lib/server/rate";

export const dynamic = "force-dynamic";

const fail = (error: string, status = 400) => Response.json({ error }, { status, headers: { "cache-control": "no-store" } });

/**
 * Store a launch's metadata (image, description, website, X handle) as JSON under the hash of its bytes. The launch puts
 * the returned link on-chain, so it can never point at anything else.
 */
export async function POST(req: Request) {
  if (ADDR.realmFactory === ZERO) return fail("SilverRealm is not live", 404);
  if (limited(`realm-meta:${clientIp(req)}`, 20, 3_600_000)) return fail("too many requests; try again in an hour", 429);
  if (limited("realm-meta", 200, 3_600_000)) return fail("too many right now; try again later", 503);
  if (Number(req.headers.get("content-length") ?? Infinity) > 2048) return fail("too large", 413);
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== "object") return fail("send a JSON object");
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const meta = {
    image: str(b.image),
    description: str(b.description),
    website: str(b.website),
    x: str(b.x)?.replace(/^@/, "").replace(/^https:\/\/(www\.)?(x|twitter)\.com\//, "").replace(/\/$/, "") ?? null,
  };
  if (meta.image && !imageSrc(meta.image)) return fail("the image must be an https link or one uploaded here");
  if (meta.description && [...meta.description].length > 280) return fail("keep the description under 280 characters");
  meta.website = safeUrl(meta.website) ?? (meta.website ? "bad" : null);
  if (meta.website === "bad" || (meta.website && meta.website.length > 200)) return fail("the website must be an https link");
  if (meta.description) meta.description = meta.description.replace(/\p{C}/gu, "");
  if (meta.x && !/^[A-Za-z0-9_]{1,15}$/.test(meta.x)) return fail("write the X account as its handle, like @silverchat");
  if (meta.description && refused({ v: 1, questions: [{ q: meta.description, options: [] }] })) return fail("Silverchat does not show that description");
  const data = Buffer.from(JSON.stringify(meta));
  const hash = createHash("sha256").update(data).digest("hex");
  await db.saveRealmImage(hash, "application/json", data);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  return Response.json({ uri: `${site}/api/realm/meta/${hash}` }, { headers: { "cache-control": "no-store" } });
}
