import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { isAddress, type Address, type Hex } from "viem";

import { TradeBox } from "@/components/realm";
import { RealmChart } from "@/components/realm-chart";
import { Empty, Figures, Page, Part, label, quiet } from "@/components/journal";
import { CopyAddress } from "@/components/realm-you";
import { ADDR, EXPLORER, ZERO } from "@/lib/config";
import { short, span, tokens, usd } from "@/lib/format";
import { baseOf, feeLabel, GRADUATION, imageSrc, OPENING_FDV_USD } from "@/lib/realm";
import { realmBurnerAbi } from "@/lib/abi";
import { publicClient } from "@/lib/server/chain";
import { db } from "@/lib/server/db";
import { displayTime } from "@/lib/server/eligibility";
import { serializeTokens } from "@/lib/server/realm";
import { STOPS, stopIndex } from "@/world/stops";

export const dynamic = "force-dynamic";

// the page and its metadata ask once per request
const load = cache(async (address: string) => {
  if (ADDR.realmFactory === ZERO || !isAddress(address)) return null;
  const [row] = await db.realmTokens({ token: address.toLowerCase() }, 1);
  if (!row) return null;
  const [[t], trades, burned, now, pending] = await Promise.all([
    serializeTokens([row]),
    db.realmTrades(row.pool_id, 30),
    db.realmBurned(),
    displayTime(),
    publicClient.readContract({ address: ADDR.realmBurner, abi: realmBurnerAbi, functionName: "pending", args: [row.base as Address] }).catch(() => null),
  ]);
  return { t, trades, burned, now, pending };
});

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
  const { t, trades, burned, now, pending } = data;
  const base = baseOf(t.base)!;
  const image = imageSrc(t.image);
  const openingUsd = t.baseUsd === null ? null : t.openingValue * t.baseUsd;
  // the app opens every launch at $4,000; one opened far from that was launched some other way
  const odd = openingUsd !== null && (openingUsd < OPENING_FDV_USD / 2 || openingUsd > OPENING_FDV_USD * 2);
  const sold = Math.max(0, Math.min(1, t.sold ?? 0));
  const age = Math.max(0, now - t.at);
  const feesUsd = t.baseUsd === null ? null : (Number(t.fees) / 1e18) * t.baseUsd;
  const grad = Math.min(100, (sold / GRADUATION) * 100);

  return (
    <Page>
      <header className="space-y-6">
        <p className={label}>
          No. {String(stopIndex("realm") + 1).padStart(2, "0")} ·{" "}
          <Link href="/realm" className={quiet}>
            {STOPS[stopIndex("realm")].label}
          </Link>{" "}
          · Token
        </p>
        <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-start gap-5 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:gap-6">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" width={104} height={104} referrerPolicy="no-referrer" className="h-[4.5rem] w-[4.5rem] rounded-lg bg-film object-cover text-[0px] ring-1 ring-paper/15 sm:h-[6.5rem] sm:w-[6.5rem]" />
          ) : (
            <span aria-hidden className="grid h-[4.5rem] w-[4.5rem] place-items-center rounded-lg border border-dashed border-paper/35 font-mono text-xs text-silver sm:h-[6.5rem] sm:w-[6.5rem]">
              {t.symbol?.slice(0, 4) ?? "?"}
            </span>
          )}
          <div className="min-w-0 space-y-2">
            <h1 className="text-[clamp(2rem,4.6vw,3rem)] leading-[1.04] tracking-[-0.01em] wrap-anywhere">{t.name ?? "Name not shown"}</h1>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5 font-mono text-[12px] text-silver">
              <span className="text-paper">${t.symbol ?? "?"}</span>
              <span>{base.name} pair</span>
              <span>{feeLabel(t.feePpm)} fee, all burned</span>
              <span>{span(age)} ago</span>
              {t.graduated && <span className="rounded-full bg-paper px-2 py-0.5 text-developer">Graduated</span>}
            </p>
          </div>
        </div>
        <p className="max-w-[34em] text-[1.075rem] leading-relaxed text-paper/80 text-pretty">{t.description ?? "No description."}</p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[12px]">
          <span className="inline-flex items-center gap-3">
            <a href={`${EXPLORER}/token/${t.token}`} target="_blank" rel="noreferrer" className={quiet}>
              {short(t.token)}
            </a>
            <CopyAddress value={t.token} />
          </span>
          {t.website && (
            <a href={t.website} target="_blank" rel="noopener noreferrer nofollow ugc" className={quiet}>
              {new URL(t.website).hostname}
            </a>
          )}
          {t.x && (
            <a href={`https://x.com/${t.x}`} target="_blank" rel="noopener noreferrer nofollow ugc" className={quiet}>
              X
            </a>
          )}
          <span className="text-silver">
            from{" "}
            <Link href={`/realm/${t.realm}`} className={quiet}>
              Realm {short(t.realm)}
            </Link>
          </span>
        </div>
        <p className="font-mono text-[11px] leading-relaxed text-silver">Names can be copied: check the address before you trade.</p>
      </header>

      <section aria-labelledby="price" className="space-y-7 border-t border-paper/20 pt-6">
        <div className="space-y-1.5">
          <h2 id="price" className={label}>
            Price
          </h2>
          <p className="text-[clamp(2.6rem,7vw,3.6rem)] leading-none tracking-[-0.015em] tabular-nums wrap-anywhere">{tiny(t.priceUsd)}</p>
        </div>
        <Figures
          items={[
            { label: "Market cap", value: money(t.marketCapUsd) },
            { label: "Volume", value: money(t.volumeUsd) },
            { label: "Trades", value: t.trades.toLocaleString("en-US") },
          ]}
        />
        <div className="space-y-2">
          <p className="flex items-baseline justify-between gap-4 font-mono text-[11px] text-silver">
            <span className="uppercase tracking-[0.16em]">Graduation</span>
            <span className={t.graduated ? "rounded-full bg-paper px-2 py-0.5 text-developer" : "text-paper tabular-nums"}>{t.graduated ? "Graduated" : `${(sold * 100).toFixed(1)}%`}</span>
          </p>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-paper/12" aria-hidden>
            <div className="h-full rounded-full bg-paper" style={{ width: `${grad}%` }} />
          </div>
          <p className="font-mono text-[11px] text-silver">At {Math.round(GRADUATION * 100)}% of the supply bought (25× the opening price).</p>
        </div>
        <RealmChart token={t.token} symbol={t.symbol ?? "?"} trades={t.trades} age={age} />
      </section>

      <Part title={`Trade $${t.symbol ?? "?"}`} id="trade">
        {odd && (
          <p role="note" className="border-l-2 border-paper pl-3 leading-snug">
            <strong className="font-normal">This launch opened at a {usd(openingUsd!)} valuation, far from the usual {usd(OPENING_FDV_USD)}.</strong> Check
            before you trade.
          </p>
        )}
        <TradeBox token={t.token as Address} base={t.base as Address} symbol={`$${t.symbol ?? "?"}`} poolId={t.poolId as Hex} />
      </Part>

      <Part title="Latest trades" id="trades" more={<span className="text-silver tabular-nums">{trades.length || ""}</span>}>
        {!trades.length ? (
          <Empty>No trades yet. The first buy sets the street talking.</Empty>
        ) : (
          <ol className="ruled -mx-2">
            {trades.map((x) => (
              <li key={x.id} className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-baseline gap-x-3 px-2 py-3 font-mono text-[12px] tabular-nums">
                <span className={x.buy ? "text-paper" : "text-silver"}>{x.buy ? "Buy" : "Sell"}</span>
                <span className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-4">
                  <span className="truncate">
                    {tokens(x.buy ? x.amount_out : x.amount_in, 0)} ${t.symbol}
                  </span>
                  <span className="truncate text-silver sm:text-paper">
                    {tokens(x.buy ? x.amount_in : x.amount_out, 4)} {base.name}
                  </span>
                </span>
                <span className="w-[6.5rem] text-right text-silver">{span(Math.max(0, now - x.at))}</span>
              </li>
            ))}
          </ol>
        )}
      </Part>

      <Part title="About this launch" id="launch">
        <p className="max-w-[34em] leading-relaxed text-paper/85">
          Opened at a {openingUsd === null ? "·" : usd(openingUsd)} valuation
          {odd && <strong className="font-normal underline decoration-paper/40 underline-offset-4"> (far from the usual {usd(OPENING_FDV_USD)}: check before you trade)</strong>}.
          {t.devBuy &&
            ` The creator bought ${tokens(t.devBuy, 0)}, ${((Number(t.devBuy) / 1e27) * 100).toFixed(2)}% of the supply, in the launch transaction at the trading fee.`}{" "}
          The liquidity is locked in the pool for good.
        </p>
      </Part>

      <Part title="Where the fees go" id="burns" more={<span className="text-silver">100% of fees burned</span>}>
        <p className="max-w-[34em] leading-relaxed text-paper/85">
          Every trade of ${t.symbol} pays {feeLabel(t.feePpm)}. All of it is burned: 80% buys $SC and burns it, 20% buys $ZC
          and burns it. SilverRealm keeps nothing.
        </p>
        <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
          <Ledger
            title={`$${t.symbol ?? "?"}`}
            rows={[
              [`Fees from $${t.symbol}`, `${tokens(t.fees, 4)} ${base.name}`, feesUsd === null ? null : usd(feesUsd)],
              ["$SC burned at launch", t.scBurned ? tokens(t.scBurned, 0) : "·", null],
              [`Waiting to burn, all ${base.name} fees`, pending === null ? "·" : `${tokens(pending, 4)} ${base.name}`, null],
            ]}
          />
          <Ledger
            title="All of SilverRealm"
            rows={[
              ["SilverRealm $SC burned", tokens(burned.sc, 0), null],
              ["SilverRealm $ZC burned", tokens(burned.zc, 0), null],
            ]}
          />
        </div>
        <p className="font-mono text-[11px] leading-relaxed text-silver">
          Fees wait in the burner until they are worth $20 (or a week passes), then they are converted and burned.{" "}
          <a href={`${EXPLORER}/address/${ADDR.realmBurner}`} target="_blank" rel="noreferrer" className={quiet}>
            burner {short(ADDR.realmBurner)}
          </a>
        </p>
      </Part>

    </Page>
  );
}

/** A short ledger: a label on the left, the amount on the right, a ruled line between rows. */
function Ledger({ title, rows }: { title: string; rows: [string, string, string | null][] }) {
  return (
    <div className="space-y-2">
      <h3 className="font-mono text-[11px] text-silver">{title}</h3>
      <dl className="border-t border-paper/20">
        {rows.map(([k, v, n]) => (
          <div key={k} className="flex items-baseline justify-between gap-4 border-b border-dashed border-paper/20 py-2.5">
            <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-silver">{k}</dt>
            <dd className="text-right text-lg leading-tight whitespace-nowrap tabular-nums">
              {v}
              {n && <span className="block font-mono text-[11px] text-silver">{n}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
