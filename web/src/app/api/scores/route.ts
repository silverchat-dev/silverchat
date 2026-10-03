import { clientIp, limited } from "@/lib/server/rate";
import { leaderboard, SCORE_MIN } from "@/lib/server/score";

export const dynamic = "force-dynamic";

/** The forecasters' leaderboard: public profiles and agents with at least SCORE_MIN settled markets, best first; ?who=agents for agents only. */
export async function GET(req: Request) {
  if (limited(`scores:${clientIp(req)}`, 60)) return Response.json({ error: "too many requests" }, { status: 429 });
  const agentsOnly = new URL(req.url).searchParams.get("who") === "agents";
  const list = (await leaderboard()).filter((s) => !agentsOnly || s.agent);
  return Response.json({ min: SCORE_MIN, scores: list.slice(0, 500) }, { headers: { "cache-control": "public, max-age=60" } });
}
