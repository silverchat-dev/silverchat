import { formatUnits } from "viem";

import { publicClient } from "@/lib/server/chain";
import { db } from "@/lib/server/db";
import { prices, USD_PER_PERSON } from "@/lib/server/price";

export const dynamic = "force-dynamic";

export async function GET() {
  const [head, cursor, p] = await Promise.all([
    publicClient.getBlockNumber().catch(() => null),
    db.get("indexer"),
    prices().catch(() => null),
  ]);
  return Response.json(
    {
      head: head?.toString() ?? null,
      indexed: cursor,
      zcUsd: p ? formatUnits(p.zc, 18) : null,
      scUsd: p?.sc ? formatUnits(p.sc, 18) : null,
      usdPerPerson: Number(USD_PER_PERSON),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
