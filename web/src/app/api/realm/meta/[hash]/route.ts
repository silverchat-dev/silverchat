import { db } from "@/lib/server/db";

export const dynamic = "force-dynamic";

/** A launch's metadata by the hash of its bytes. It never changes. */
export async function GET(_req: Request, { params }: RouteContext<"/api/realm/meta/[hash]">) {
  const { hash } = await params;
  if (!/^[0-9a-f]{64}$/.test(hash)) return new Response("not found", { status: 404 });
  const meta = await db.realmImage(hash);
  if (!meta || meta.type !== "application/json") return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(meta.data), {
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
