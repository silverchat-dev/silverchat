import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isAddress, type Address } from "viem";

import { TradeBox } from "@/components/realm";
import { ADDR, EXPLORER, ZERO } from "@/lib/config";
import { short, tokens } from "@/lib/format";
import { baseOf, feeLabel } from "@/lib/realm";
import { db } from "@/lib/server/db";

import { serializeToken } from "../../../api/realm/route";

export const dynamic = "force-dynamic";

async function load(address: string) {
  if (ADDR.realmFactory === ZERO || !isAddress(address)) return null;
  const [row] = await db.realmTokens({ token: address.toLowerCase() }, 1);
  return row ? { t: await serializeToken(row), trades: await db.realmTrades(row.pool_id, 30) } : null;
}

export async function generateMetadata({ params }: PageProps<"/realm/token/[address]">): Promise<Metadata> {
  const data = await load((await params).address);
  return { title: data?.t.name ? `${data.t.name} ($${data.t.symbol}) · silverchat` : "Token · silverchat" };
}

export default async function TokenPage({ params }: PageProps<"/realm/token/[address]">) {
  const data = await load((await params).address);
  if (!data) notFound();
  const { t, trades } = data;
  const base = baseOf(t.base);
  const image = t.uri && /^https:\/\//.test(t.uri) ? t.uri : null;
  return (
    <section className="mx-auto grid max-w-6xl gap-10 px-5 py-10 sm:px-8 md:py-14 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="space-y-8">
        <header className="space-y-3">
          {image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" width={96} height={96} referrerPolicy="no-referrer" className="h-24 w-24 object-cover" />
          )}
          <h1 className="text-5xl leading-tight wrap-anywhere">{t.name ?? "Name not shown"}</h1>
          <p className="font-mono text-sm text-paper/80">
            ${t.symbol ?? "?"} · {base?.name} pair · {feeLabel(t.feePpm)} fee, all burned · launched from{" "}
            <Link href={`/realm/${t.realm}`} className="underline underline-offset-4">
              Realm {short(t.realm)}
            </Link>
          </p>
          <p className="font-mono text-xs break-all text-silver">
            Token{" "}
            <a href={`${EXPLORER}/token/${t.token}`} target="_blank" rel="noreferrer" className="underline underline-offset-4">
              {t.token}
            </a>
            . Names can be copied: check this address before you trade.
          </p>
        </header>
        <dl className="grid gap-6 font-mono text-sm sm:grid-cols-3">
          <div>
            <dt className="uppercase tracking-[0.14em] text-silver">Price</dt>
            <dd className="text-xl">{t.price === null ? "·" : `${t.price.toPrecision(4)} ${base?.name}`}</dd>
          </div>
          <div>
            <dt className="uppercase tracking-[0.14em] text-silver">$SC burned at launch</dt>
            <dd className="text-xl">{t.scBurned ? tokens(t.scBurned, 0) : "·"}</dd>
          </div>
          <div>
            <dt className="uppercase tracking-[0.14em] text-silver">Fees, all burned</dt>
            <dd className="text-xl">
              {tokens(t.fees, 4)} {base?.name}
            </dd>
          </div>
        </dl>
        {t.devBuy && <p className="text-sm text-paper/80">The creator bought {tokens(t.devBuy, 0)} at launch, in the same transaction, at the trading fee.</p>}
        <section className="space-y-3">
          <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-silver">Latest trades</h2>
          {!trades.length ? (
            <p className="text-paper/80">No trades yet.</p>
          ) : (
            <ol className="divide-y divide-paper/15 font-mono text-xs">
              {trades.map((x) => (
                <li key={x.id} className="flex flex-wrap justify-between gap-x-4 py-2">
                  <span>{x.buy ? "Buy" : "Sell"}</span>
                  <span>
                    {tokens(x.buy ? x.amount_out : x.amount_in, 0)} ${t.symbol}
                  </span>
                  <span>
                    {tokens(x.buy ? x.amount_in : x.amount_out, 4)} {base?.name}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
      <aside>
        <TradeBox token={t.token as Address} base={t.base as Address} symbol={`$${t.symbol ?? "?"}`} />
      </aside>
    </section>
  );
}
