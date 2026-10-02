import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isAddress, type Address, type Hex } from "viem";

import { TradeBox } from "@/components/realm";
import { RealmChart } from "@/components/realm-chart";
import { CopyAddress } from "@/components/realm-you";
import { ADDR, EXPLORER, ZERO } from "@/lib/config";
import { short, span, tokens, usd } from "@/lib/format";
import { baseOf, feeLabel, GRADUATION, imageSrc, OPENING_FDV_USD } from "@/lib/realm";
import { db } from "@/lib/server/db";
import { displayTime } from "@/lib/server/eligibility";
import { serializeTokens } from "@/lib/server/realm";

export const dynamic = "force-dynamic";

async function load(address: string) {
  if (ADDR.realmFactory === ZERO || !isAddress(address)) return null;
  const [row] = await db.realmTokens({ token: address.toLowerCase() }, 1);
  if (!row) return null;
  const [[t], trades, burned, now] = await Promise.all([serializeTokens([row]), db.realmTrades(row.pool_id, 30), db.realmBurned(), displayTime()]);
  return { t, trades, burned, now };
}

export async function generateMetadata({ params }: PageProps<"/realm/token/[address]">): Promise<Metadata> {
  const data = await load((await params).address);
  return {
    title: data?.t.name ? `${data.t.name} ($${data.t.symbol}) · silverchat` : "Token · silverchat",
    description: data?.t.description ?? undefined,
  };
}

const money = (n: number | null) => (n === null ? "·" : n >= 1000 ? `$${(n / 1000).toLocaleString("en-US", { maximumFractionDigits: 2 })}K` : usd(n));
const tiny = (n: number | null) => (n === null ? "·" : n >= 0.01 ? usd(n) : `$${n.toPrecision(3)}`);

export default async function TokenPage({ params }: PageProps<"/realm/token/[address]">) {
  const data = await load((await params).address);
  if (!data) notFound();
  const { t, trades, burned, now } = data;
  const base = baseOf(t.base)!;
  const image = imageSrc(t.image);
  const openingUsd = t.baseUsd === null ? null : t.openingValue * t.baseUsd;
  // the app opens every launch at $4,000; one opened far from that was launched some other way
  const odd = openingUsd !== null && (openingUsd < OPENING_FDV_USD / 2 || openingUsd > OPENING_FDV_USD * 2);
  const sold = Math.max(0, Math.min(1, t.sold ?? 0));
  const age = Math.max(0, now - t.at);
  const feesUsd = t.baseUsd === null ? null : (Number(t.fees) / 1e18) * t.baseUsd;
  const stat = "space-y-1 border border-paper/15 px-4 py-3";

  return (
    <section className="mx-auto grid max-w-7xl gap-6 px-5 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="min-w-0 space-y-6">
        <header className="space-y-5 border border-paper/15 p-5">
          <div className="flex flex-wrap items-start gap-5">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="" width={96} height={96} referrerPolicy="no-referrer" className="h-24 w-24 rounded-full object-cover" />
            ) : (
              <span aria-hidden className="grid h-24 w-24 place-items-center rounded-full border border-paper/20 font-mono text-silver">
                {t.symbol?.slice(0, 4) ?? "?"}
              </span>
            )}
            <div className="min-w-0 flex-1 space-y-2">
              <h1 className="text-4xl leading-tight wrap-anywhere">
                {t.name ?? "Name not shown"} <span className="font-mono text-lg text-silver">${t.symbol ?? "?"}</span>
              </h1>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-silver">
                <a href={`${EXPLORER}/token/${t.token}`} target="_blank" rel="noreferrer" className="hover:text-paper">
                  {short(t.token)}
                </a>
                <CopyAddress value={t.token} />
                <span>{span(age)} ago</span>
                <span className="border border-paper/25 px-1.5">{feeLabel(t.feePpm)} fee, all burned</span>
                <span className="border border-paper/25 px-1.5">{base.name} pair</span>
                {t.graduated && <span className="bg-paper px-1.5 text-developer">Graduated</span>}
                {t.website && (
                  <a href={t.website} target="_blank" rel="noopener noreferrer nofollow ugc" className="text-paper hover:underline">
                    {new URL(t.website).hostname}
                  </a>
                )}
                {t.x && (
                  <a href={`https://x.com/${t.x}`} target="_blank" rel="noopener noreferrer nofollow ugc" className="text-paper hover:underline">
                    X
                  </a>
                )}
              </p>
              <p className="text-paper/80">{t.description ?? "No description."}</p>
              <p className="font-mono text-xs text-silver">
                Launched from{" "}
                <Link href={`/realm/${t.realm}`} className="underline underline-offset-4 hover:text-paper">
                  Realm {short(t.realm)}
                </Link>
                . Names can be copied: check the address before you trade.
              </p>
            </div>
          </div>
          <dl className="grid gap-3 font-mono sm:grid-cols-4">
            <div className={stat}>
              <dt className="text-xs uppercase tracking-[0.14em] text-silver">Price</dt>
              <dd className="text-lg">{tiny(t.priceUsd)}</dd>
            </div>
            <div className={stat}>
              <dt className="text-xs uppercase tracking-[0.14em] text-silver">Market cap</dt>
              <dd className="text-lg">{money(t.marketCapUsd)}</dd>
            </div>
            <div className={stat}>
              <dt className="text-xs uppercase tracking-[0.14em] text-silver">Volume</dt>
              <dd className="text-lg">{money(t.volumeUsd)}</dd>
            </div>
            <div className={stat}>
              <dt className="text-xs uppercase tracking-[0.14em] text-silver">Trades</dt>
              <dd className="text-lg">{t.trades.toLocaleString("en-US")}</dd>
            </div>
          </dl>
          <div className="space-y-2">
            <p className="flex justify-between font-mono text-xs uppercase tracking-[0.14em] text-silver">
              <span>Graduation · {Math.round(GRADUATION * 100)}% of the supply bought (25× the opening price)</span>
              <span className={t.graduated ? "bg-paper px-1.5 text-developer" : ""}>{t.graduated ? "Graduated" : `${(sold * 100).toFixed(1)}%`}</span>
            </p>
            <div className="h-1.5 w-full bg-paper/10">
              <div className="h-full bg-paper" style={{ width: `${Math.min(100, (sold / GRADUATION) * 100)}%` }} />
            </div>
          </div>
          <p className="text-sm text-paper/70">
            Opened at a {openingUsd === null ? "·" : usd(openingUsd)} valuation
            {odd && <strong className="text-paper"> (far from the usual {usd(OPENING_FDV_USD)}: check before you trade)</strong>}.
            {t.devBuy &&
              ` The creator bought ${tokens(t.devBuy, 0)}, ${((Number(t.devBuy) / 1e27) * 100).toFixed(2)}% of the supply, in the launch transaction at the trading fee.`}{" "}
            The liquidity is locked in the pool for good.
          </p>
        </header>

        <RealmChart token={t.token} symbol={t.symbol ?? "?"} />

        <section className="space-y-3 border border-paper/15 p-5">
          <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-silver">Latest trades</h2>
          {!trades.length ? (
            <p className="text-paper/80">No trades yet.</p>
          ) : (
            <ol className="divide-y divide-paper/10 font-mono text-xs">
              {trades.map((x) => (
                <li key={x.id} className="grid grid-cols-[3rem_1fr_1fr_5rem] gap-3 py-2">
                  <span className={x.buy ? "text-[#7fb08c]" : "text-[#c4655b]"}>{x.buy ? "Buy" : "Sell"}</span>
                  <span>
                    {tokens(x.buy ? x.amount_out : x.amount_in, 0)} ${t.symbol}
                  </span>
                  <span>
                    {tokens(x.buy ? x.amount_in : x.amount_out, 4)} {base.name}
                  </span>
                  <span className="text-right text-silver">{span(Math.max(0, now - x.at))}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <aside className="space-y-6">
        <TradeBox token={t.token as Address} base={t.base as Address} symbol={`$${t.symbol ?? "?"}`} poolId={t.poolId as Hex} />
        <section className="space-y-4 border border-paper/15 p-5">
          <h2 className="flex items-center justify-between">
            <span className="text-lg">Burns</span>
            <span className="border border-paper/25 px-1.5 font-mono text-xs text-silver">100% of fees</span>
          </h2>
          <p className="text-sm text-paper/80">
            Every trade of ${t.symbol} pays {feeLabel(t.feePpm)}. All of it is burned: 80% buys $SC and burns it, 20% buys $ZC and
            burns it. SilverRealm keeps nothing.
          </p>
          <dl className="grid grid-cols-2 gap-3 font-mono">
            <div className={stat}>
              <dt className="text-xs uppercase tracking-[0.14em] text-silver">Fees from ${t.symbol}</dt>
              <dd>
                {tokens(t.fees, 4)} {base.name}
              </dd>
              <dd className="text-xs text-silver">{feesUsd === null ? "" : usd(feesUsd)}</dd>
            </div>
            <div className={stat}>
              <dt className="text-xs uppercase tracking-[0.14em] text-silver">$SC burned at launch</dt>
              <dd>{t.scBurned ? tokens(t.scBurned, 0) : "·"}</dd>
            </div>
            <div className={stat}>
              <dt className="text-xs uppercase tracking-[0.14em] text-silver">SilverRealm $SC burned</dt>
              <dd>{tokens(burned.sc, 0)}</dd>
            </div>
            <div className={stat}>
              <dt className="text-xs uppercase tracking-[0.14em] text-silver">SilverRealm $ZC burned</dt>
              <dd>{tokens(burned.zc, 0)}</dd>
            </div>
          </dl>
          <p className="font-mono text-xs text-silver">
            Fees wait in the burner until they are worth $20 (or a week passes), then they are converted and burned.{" "}
            <a href={`${EXPLORER}/address/${ADDR.realmBurner}`} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-paper">
              burner {short(ADDR.realmBurner)}
            </a>
          </p>
        </section>
      </aside>
    </section>
  );
}
