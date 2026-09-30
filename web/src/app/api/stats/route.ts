import { stats } from "@/lib/server/stats";

export const dynamic = "force-dynamic";

/** The same numbers as /stats, amounts in wei as strings. */
export async function GET() {
  const s = await stats();
  const json = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v]));
  return Response.json(json, { headers: { "cache-control": "public, max-age=60" } });
}
