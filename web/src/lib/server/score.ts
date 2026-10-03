import "server-only";

import { db, type Score } from "./db";

/**
 * A score shows only after this many settled markets: fewer says more about luck than about the forecaster. A local fork
 * may lower it (local-up sets 1) so the end to end check can see a score; production leaves it at 10.
 */
export const SCORE_MIN = Number(process.env.SCORE_MIN ?? 10);

export type Ranked = Score & { accuracy: number; rank: number; agent: { name: string; url: string | null } | null };

let cached: { at: number; list: Promise<Ranked[]> } | null = null;

/**
 * Forecasters with a public profile and at least SCORE_MIN settled markets, best first: by accuracy, then by how many
 * markets, then by net ZC. Sides are public on-chain once revealed, so the score shows nothing Ethereum does not; it is
 * listed only for wallets that chose a public profile. Cached for a minute.
 */
export function leaderboard() {
  if (!cached || Date.now() - cached.at > 60_000) {
    const list = Promise.all([db.scores(), db.publicProfiles(), db.agents()]).then(([all, open, agents]) => {
      // an agent's flag is public by design, so a declared agent is listed like a public profile
      const agent = new Map(agents.map((a) => [a.address, { name: a.name, url: a.url }]));
      const shown = new Set([...open, ...agent.keys()]);
      return all
        .filter((s) => s.resolved >= SCORE_MIN && shown.has(s.address))
        .map((s) => ({ ...s, accuracy: s.correct / s.resolved, agent: agent.get(s.address) ?? null }))
        .sort((a, b) => b.accuracy - a.accuracy || b.resolved - a.resolved || (BigInt(b.net) > BigInt(a.net) ? 1 : BigInt(b.net) < BigInt(a.net) ? -1 : 0))
        .map((s, i) => ({ ...s, rank: i + 1 }));
    });
    cached = { at: Date.now(), list };
    list.catch(() => (cached = null));
  }
  return cached.list;
}

/** One wallet's ranked score, or null: neither a public profile nor an agent, or fewer than SCORE_MIN settled markets. */
export async function scoreOf(address: string) {
  // the board holds only public profiles and declared agents with enough settled markets
  return (await leaderboard()).find((s) => s.address === address) ?? null;
}
