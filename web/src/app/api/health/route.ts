import { formatEther, formatUnits } from "viem";

import { poster, pricer, publicClient } from "@/lib/server/chain";
import { db } from "@/lib/server/db";
import { prices, USD_PER_PERSON } from "@/lib/server/price";

export const dynamic = "force-dynamic";

// the two server wallets' ETH, read at most every 5 minutes: this route is hit on every visit to /ask and /demo
// a finalize costs about five times a price push, so the poster needs more headroom
const LOW = { poster: 2n * 10n ** 16n, pricer: 5n * 10n ** 15n };
let wallets: { at: number; poster: bigint | null; pricer: bigint | null } = { at: 0, poster: null, pricer: null };
async function balances() {
  if (Date.now() - wallets.at > 5 * 60_000) {
    const eth = (w: typeof poster) => (w ? publicClient.getBalance({ address: w.account.address }).catch(() => null) : null);
    const [a, b] = await Promise.all([eth(poster), eth(pricer)]);
    wallets = { at: Date.now(), poster: a, pricer: b };
  }
  return wallets;
}

/** What an uptime check needs: `ok` is false when the chain can't be read, indexing lags, a poll waits to be fixed, or a server wallet runs low. */
export async function GET() {
  const [head, cursor, p, w, late] = await Promise.all([
    publicClient.getBlockNumber().catch(() => null),
    db.get("indexer"),
    prices().catch(() => null),
    balances(),
    // closed over 15 minutes ago and still not fixed
    db.overdue(Math.floor(Date.now() / 1000) - 15 * 60),
  ]);
  const ok =
    head !== null &&
    cursor !== null &&
    head - BigInt(cursor) < 30n &&
    late === 0 &&
    (w.poster === null || w.poster >= LOW.poster) &&
    (w.pricer === null || w.pricer >= LOW.pricer);
  return Response.json(
    {
      ok,
      head: head?.toString() ?? null,
      indexed: cursor,
      late,
      posterEth: w.poster === null ? null : formatEther(w.poster),
      pricerEth: w.pricer === null ? null : formatEther(w.pricer),
      zcUsd: p ? formatUnits(p.zc, 18) : null,
      scUsd: p?.sc ? formatUnits(p.sc, 18) : null,
      stockerUsd: p?.stocker ? formatUnits(p.stocker, 18) : null,
      usdPerPerson: Number(USD_PER_PERSON),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
