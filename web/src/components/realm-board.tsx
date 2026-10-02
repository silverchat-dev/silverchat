"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

import { short, tokens } from "@/lib/format";
import { BASES, baseOf, feeLabel, GRADUATION, imageSrc, PAGE } from "@/lib/realm";
import type { Board, FeedItem, Sort, TokenView } from "@/lib/server/realm";

const TABS: [Sort, string][] = [
  ["trending", "Trending"],
  ["new", "New"],
  ["cap", "Market cap"],
  ["close", "Near graduation"],
  ["graduated", "Graduated"],
];

export type View = { sort: Sort; q: string; base: string };

const money = (n: number | null) =>
  n === null ? "·" : `$${n.toLocaleString("en-US", n >= 1000 ? { notation: "compact", maximumFractionDigits: 1 } : { maximumFractionDigits: n >= 1 ? 0 : 2 })}`;
const age = (s: number) => (s < 60 ? `${Math.max(0, s)}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86_400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86_400)}d`);
const grad = (t: TokenView) => Math.min(100, ((t.sold ?? 0) / GRADUATION) * 100);

function Change({ v }: { v: number | null }) {
  if (v === null) return null;
  // the darkroom palette: up is paper, down is silver, the sign says which
  return <span className={v >= 0 ? "text-paper" : "text-silver"}>{`${v >= 0 ? "+" : ""}${(v * 100).toFixed(v * 100 >= 1000 ? 0 : 1)}%`}</span>;
}

function Thumb({ t, size }: { t: Pick<TokenView, "image" | "symbol">; size: string }) {
  const src = imageSrc(t.image);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" className={`${size} shrink-0 bg-film object-cover`} />
  ) : (
    <span aria-hidden className={`${size} grid shrink-0 place-items-center bg-film font-mono text-xs text-silver`}>
      {(t.symbol ?? "?").slice(0, 4)}
    </span>
  );
}

function Bar({ t }: { t: TokenView }) {
  return (
    <span className="block space-y-1">
      <span className="block h-1 w-full bg-paper/10">
        <span className="block h-full bg-paper" style={{ width: `${grad(t)}%` }} />
      </span>
      <span className="flex justify-between gap-2 font-mono text-[11px] whitespace-nowrap text-silver">
        {t.graduated ? <span className="bg-paper px-1.5 text-developer">Graduated</span> : <span>Graduation {Math.floor(grad(t))}%</span>}
        <span>{baseOf(t.base)?.name ?? "?"} · {feeLabel(t.feePpm)} fee</span>
      </span>
    </span>
  );
}

/** One launch on the board: its picture, its name, what it is worth and how close it is to graduating. */
function Card({ t, now }: { t: TokenView; now: number }) {
  return (
    <li>
      <Link
        href={`/realm/token/${t.token}`}
        className="flex h-full gap-4 border border-paper/12 p-3 transition-colors hover:border-paper/40 hover:bg-paper/[0.03] focus-visible:border-paper"
      >
        <Thumb t={t} size="h-20 w-20 sm:h-28 sm:w-28" />
        <span className="flex min-w-0 flex-1 flex-col justify-between gap-2">
          <span className="min-w-0 space-y-0.5">
            <span className="flex items-baseline justify-between gap-2">
              <span className="truncate text-lg leading-snug">{t.name ?? "Name not shown"}</span>
              <span className="shrink-0 font-mono text-[11px] text-silver">{age(now - t.at)}</span>
            </span>
            <span className="block truncate font-mono text-xs text-silver">
              ${t.symbol ?? "?"} · by {short(t.realm)}
            </span>
            {t.description && <span className="line-clamp-2 text-sm leading-snug text-paper/70">{t.description}</span>}
          </span>
          <span className="flex flex-wrap items-baseline gap-x-3 font-mono text-xs">
            <span>
              <span className="text-silver">cap</span> {money(t.marketCapUsd)}
            </span>
            <Change v={t.change24h} />
            <span className="text-silver">vol {money(t.volume24hUsd)}</span>
            {t.lastTradeAt !== null && <span className="text-silver">last trade {age(now - t.lastTradeAt)} ago</span>}
          </span>
          <Bar t={t} />
        </span>
      </Link>
    </li>
  );
}

/** The launch most worth a look right now, printed big under the safelight. */
function Featured({ t, now }: { t: TokenView; now: number }) {
  return (
    <section aria-labelledby="featured" className="space-y-3">
      <h2 id="featured" className="font-mono text-xs uppercase tracking-[0.14em] text-silver">
        On the light box
      </h2>
      <Link href={`/realm/token/${t.token}`} className="grid gap-5 bg-paper p-4 text-developer hover:brightness-[1.03] sm:grid-cols-[auto_minmax(0,1fr)] sm:p-5">
        <Thumb t={t} size="h-40 w-40 sm:h-44 sm:w-44" />
        <span className="flex min-w-0 flex-col justify-between gap-4">
          <span className="space-y-1">
            <span className="block text-3xl leading-tight wrap-anywhere">{t.name ?? "Name not shown"}</span>
            <span className="block font-mono text-xs text-developer/70">
              ${t.symbol ?? "?"} · by {short(t.realm)} · {age(now - t.at)} old
            </span>
            {t.description && <span className="line-clamp-3 block max-w-2xl leading-snug text-developer/80">{t.description}</span>}
          </span>
          <span className="space-y-3">
            <span className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-sm">
              <span>
                <span className="text-developer/60">cap</span> {money(t.marketCapUsd)}
              </span>
              {t.change24h !== null && (
                <span>
                  <span className="text-developer/60">24h</span> {`${t.change24h >= 0 ? "+" : ""}${(t.change24h * 100).toFixed(1)}%`}
                </span>
              )}
              <span>
                <span className="text-developer/60">vol 24h</span> {money(t.volume24hUsd)}
              </span>
              <span>
                <span className="text-developer/60">trades</span> {t.trades}
              </span>
            </span>
            <span className="block h-1.5 w-full bg-developer/10">
              <span className="block h-full bg-developer" style={{ width: `${grad(t)}%` }} />
            </span>
            <span className="flex justify-between font-mono text-xs text-developer/70">
              <span>{t.graduated ? "Graduated" : `Graduation ${Math.floor(grad(t))}% · at 80% of the supply bought`}</span>
              <span>Trade →</span>
            </span>
          </span>
        </span>
      </Link>
    </section>
  );
}

/** The latest buys, sells and launches, running along the top like a ticker tape. */
function Ticker({ items }: { items: FeedItem[] }) {
  if (!items.length) return null;
  const row = (dup: boolean) => (
    <ul aria-hidden={dup} className={`flex shrink-0 gap-8 pr-8 ${dup ? "motion-reduce:hidden" : ""}`}>
      {items.map((x, i) => (
        <li key={`${x.token}${x.at}${i}`}>
          <Link href={`/realm/token/${x.token}`} tabIndex={dup ? -1 : undefined} className="flex items-center gap-2 whitespace-nowrap hover:text-paper">
            <Thumb t={x} size="h-5 w-5" />
            <span className={x.kind === "launch" ? "text-paper underline decoration-paper/40 underline-offset-2" : x.buy ? "text-paper" : "text-silver"}>
              {x.kind === "launch" ? "launched" : x.buy ? "bought" : "sold"}
            </span>
            <span className="text-paper">${x.symbol ?? "?"}</span>
            {x.usd !== null && <span>{money(x.usd)}</span>}
            {x.who && <span className="text-silver/70">{short(x.who)}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="ticker overflow-hidden border-y border-paper/12 py-2.5 font-mono text-xs text-silver motion-reduce:overflow-x-auto">
      <div className="ticker-track flex w-max">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}

function Launch() {
  const { address } = useAccount();
  if (!address) return <ConnectButton label="Connect to launch a token" />;
  return (
    <Link href={`/realm/${address.toLowerCase()}`} className="inline-block bg-safelight px-5 py-2.5 font-mono text-sm text-developer hover:brightness-110">
      Launch a token
    </Link>
  );
}

/** SilverRealm's board: every launch, sorted and searched like any launchpad's, refreshed while you watch. */
export function RealmBoard({ first, view: start }: { first: Board; view: View }) {
  const [view, setView] = useState(start);
  const [typed, setTyped] = useState(start.q);

  // search waits for a pause in typing; the view lives in the address, so a link shares it
  useEffect(() => {
    const id = setTimeout(() => setView((v) => (v.q === typed.trim() ? v : { ...v, q: typed.trim() })), 250);
    return () => clearTimeout(id);
  }, [typed]);
  useEffect(() => {
    const p = new URLSearchParams();
    if (view.sort !== "trending") p.set("sort", view.sort);
    if (view.q) p.set("q", view.q);
    if (view.base) p.set("base", view.base);
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [view]);

  const same = view.sort === start.sort && view.q === start.q && view.base === start.base;
  const q = useInfiniteQuery({
    queryKey: ["realmBoard", view],
    queryFn: async ({ pageParam }) => {
      const p = new URLSearchParams({ sort: view.sort, q: view.q, base: view.base, page: String(pageParam) });
      const r = await fetch(`/api/realm?${p}`);
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "could not load");
      return (await r.json()) as Board;
    },
    initialPageParam: 0,
    getNextPageParam: (last, all) => (all.length * PAGE < last.total ? all.length : undefined),
    initialData: same ? { pages: [first], pageParams: [0] } : undefined,
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  });

  const head = q.data?.pages[0] ?? first;
  const list = q.data?.pages.flatMap((p) => p.tokens) ?? [];
  const stat = (k: string, v: string) => (
    <div>
      <dt className="text-[11px] uppercase tracking-[0.14em] text-silver">{k}</dt>
      <dd className="text-2xl">{v}</dd>
    </div>
  );
  const chip = "border border-paper/20 px-3 py-1.5 aria-pressed:border-paper aria-pressed:bg-paper aria-pressed:text-developer";

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl space-y-3">
          <h1 className="text-5xl leading-tight">SilverRealm</h1>
          <p className="text-lg leading-relaxed text-paper/80">
            Launch what you believe in. Each launch burns $5 of $SC, and every trading fee goes 100% back to the ecosystem:
            80% buys and burns $SC, 20% buys and burns $ZC.
          </p>
        </div>
        <Launch />
      </header>

      <dl className="grid grid-cols-2 gap-4 font-mono sm:grid-cols-4">
        {stat("Launches", head.burned.launches.toLocaleString("en-US"))}
        {stat("Volume", money(head.volumeUsd))}
        {stat("$SC burned", tokens(head.burned.sc, 0))}
        {stat("$ZC burned", tokens(head.burned.zc, 0))}
      </dl>

      <Ticker items={head.feed} />

      {head.featured && !view.q && <Featured t={head.featured} now={head.now} />}

      <section aria-label="Launches" className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="group" aria-label="Sort" className="-mx-1 flex max-w-full gap-1 overflow-x-auto px-1 font-mono text-xs">
            {TABS.map(([id, label]) => (
              <button key={id} type="button" aria-pressed={view.sort === id} onClick={() => setView((v) => ({ ...v, sort: id }))} className={`${chip} shrink-0`}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 font-mono text-xs sm:w-auto">
            <input
              type="search"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Search name, $symbol or address"
              aria-label="Search launches"
              maxLength={64}
              className="min-w-0 basis-full border border-paper/20 bg-transparent px-3 py-1.5 text-paper placeholder:text-silver/70 focus:border-paper focus:outline-none sm:w-72 sm:basis-auto"
            />
            <div role="group" aria-label="Paired with" className="flex gap-1">
              {[["", "All"] as const, ...BASES.map((b) => [b.id, b.name.replace("$", "")] as const)].map(([id, label]) => (
                <button key={id || "all"} type="button" aria-pressed={view.base === id} onClick={() => setView((v) => ({ ...v, base: id }))} className={chip}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {q.isError && !list.length ? (
          <p className="text-paper/80">{q.error.message}. Trying again shortly.</p>
        ) : !list.length ? (
          <p className="py-10 text-xl text-paper/80">
            {view.q ? `Nothing matches "${view.q}".` : view.sort === "graduated" ? "No token has graduated yet." : "No launches yet. The first one is yours."}
          </p>
        ) : (
          <ol className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-3 ${q.isPlaceholderData ? "opacity-60" : ""}`}>
            {list.map((t) => (
              <Card key={t.token} t={t} now={head.now} />
            ))}
          </ol>
        )}
        {q.hasNextPage && (
          <button type="button" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage} className="border border-paper/25 px-5 py-2 font-mono text-sm hover:border-paper disabled:opacity-50">
            {q.isFetchingNextPage ? "Loading…" : "Load more"}
          </button>
        )}
      </section>
    </div>
  );
}
