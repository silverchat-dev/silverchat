import { db } from "@/lib/server/db";

export const dynamic = "force-dynamic";

/** A token image by the hash of its bytes. It never changes, so browsers and CDNs may keep it forever. */
export async function GET(_req: Request, { params }: RouteContext<"/api/realm/image/[hash]">) {
  const { hash } = await params;
  if (!/^[0-9a-f]{64}$/.test(hash)) return new Response("not found", { status: 404 });
  const img = await db.realmImage(hash);
  if (!img) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(img.data), {
    headers: {
      "content-type": img.type,
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
