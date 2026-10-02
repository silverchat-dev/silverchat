import { createHash } from "node:crypto";

import { ADDR, ZERO } from "@/lib/config";
import { db } from "@/lib/server/db";
import { clientIp, limited } from "@/lib/server/rate";

export const dynamic = "force-dynamic";

const MAX_IMAGE = 512 * 1024;

/** The image type from the file's first bytes, never from what the client says. SVG is refused: it can carry script. */
function sniff(b: Buffer) {
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 6 && (b.subarray(0, 6).toString("latin1") === "GIF87a" || b.subarray(0, 6).toString("latin1") === "GIF89a")) return "image/gif";
  if (b.length > 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

const fail = (error: string, status = 400) => Response.json({ error }, { status, headers: { "cache-control": "no-store" } });

/** Upload a token image (PNG, JPEG, GIF or WebP, up to 512 KB). Returns the link to put in the launch. */
export async function POST(req: Request) {
  if (ADDR.realmFactory === ZERO) return fail("SilverRealm is not live", 404);
  if (limited(`realm-image:${clientIp(req)}`, 10, 3_600_000)) return fail("too many uploads; try again in an hour", 429);
  if (Number(req.headers.get("content-length") ?? Infinity) > MAX_IMAGE) return fail("the image must be 512 KB or less", 413);
  const data = Buffer.from(await req.arrayBuffer());
  if (data.length > MAX_IMAGE) return fail("the image must be 512 KB or less", 413);
  const type = sniff(data);
  if (!type) return fail("use a PNG, JPEG, GIF or WebP image");
  const hash = createHash("sha256").update(data).digest("hex");
  await db.saveRealmImage(hash, type, data);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  return Response.json({ uri: `${site}/api/realm/image/${hash}` }, { headers: { "cache-control": "no-store" } });
}
