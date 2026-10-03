import { clientIp, limited } from "@/lib/server/rate";
import { leaderboard, SCORE_MIN } from "@/lib/server/score";

export const dynamic = "force-dynamic";

/** The forecasters' leaderboard: public profiles with at least SCORE_MIN settled Predict markets, best first. */
export async function GET(req: Request) {
  if (limited(`scores:${clientIp(req)}`, 60)) return Response.json({ error: "too many requests" }, { status: 429 });
  const list = await leaderboard();
  return Response.json({ min: SCORE_MIN, scores: list.slice(0, 500) }, { headers: { "cache-control": "public, max-age=60" } });
}
