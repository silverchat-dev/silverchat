"use client";

import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

import { Empty, Figures, Part, action, field, label, second } from "@/components/journal";
import { Connect } from "@/components/realm-you";
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
  // ink for up, soft ink for down, and the sign says which: the green is kept for the one thing to do
  return <span className={v >= 0 ? "text-paper" : "text-silver"}>{`${v >= 0 ? "+" : ""}${(v * 100).toFixed(v * 100 >= 1000 ? 0 : 1)}%`}</span>;
}

function Thumb({ t, size }: { t: Pick<TokenView, "image" | "symbol">; size: string }) {
  const src = imageSrc(t.image);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" className={`${size} shrink-0 rounded-md bg-film object-cover ring-1 ring-paper/10`} />
  ) : (
    <span aria-hidden className={`${size} grid shrink-0 place-items-center rounded-md border border-dashed border-paper/30 font-mono text-[11px] tracking-[0.08em] text-silver`}>
      {(t.symbol ?? "?").slice(0, 4)}
    </span>
  );
}

/** How far a token is on its way to graduating: a thin ink rule filling up. */
function Bar({ t, thick }: { t: TokenView; thick?: boolean }) {
  return (
    <span className={`block w-full overflow-hidden rounded-full bg-paper/12 ${thick ? "h-1.5" : "h-1"}`} aria-hidden>
      <span className="block h-full rounded-full bg-paper" style={{ width: `${grad(t)}%` }} />
    </span>
  );
}

const Graduated = () => <span className="rounded-full bg-paper px-2 py-0.5 text-developer">Graduated</span>;

/** One launch on the board: its picture, its name, what it is worth and how close it is to graduating. */
function Card({ t, now }: { t: TokenView; now: number }) {
  return (
    <li>
      <Link
        href={`/realm/token/${t.token}`}
        className="group grid grid-cols-[3.5rem_minmax(0,1fr)_5.25rem] items-start gap-x-4 rounded-md px-2 py-4 transition-colors hover:bg-paper/[0.04] sm:grid-cols-[4.5rem_minmax(0,1fr)_6.5rem]"
      >
        <Thumb t={t} size="h-14 w-14 sm:h-[4.5rem] sm:w-[4.5rem]" />
        <span className="min-w-0 space-y-2">
          <span className="block min-w-0">
            <span className="block truncate text-[1.2rem] leading-snug">{t.name ?? "Name not shown"}</span>
            <span className="block font-mono text-[11px] leading-relaxed text-silver">
              ${t.symbol ?? "?"} · by {short(t.realm)} · {age(now - t.at)}
            </span>
          </span>
          {t.description && <span className="line-clamp-2 block text-[0.95rem] leading-snug text-paper/75">{t.description}</span>}
          <span className="block space-y-1.5 pt-0.5">
            <Bar t={t} />
            <span className="flex flex-wrap justify-between gap-x-3 gap-y-1 font-mono text-[11px] text-silver">
              {t.graduated ? <Graduated /> : <span>Graduation {Math.floor(grad(t))}%</span>}
              <span>
                {baseOf(t.base)?.name ?? "?"} · {feeLabel(t.feePpm)} fee
              </span>
            </span>
          </span>
        </span>
        <span className="flex flex-col items-end gap-1 text-right">
          <span className="text-[1.2rem] leading-snug tabular-nums">{money(t.marketCapUsd)}</span>
          <span className="font-mono text-[11px] tabular-nums">
            <Change v={t.change24h} />
          </span>
          <span className="font-mono text-[11px] text-silver tabular-nums">vol {money(t.volume24hUsd)}</span>
          {t.lastTradeAt !== null && <span className="font-mono text-[11px] leading-snug text-silver">traded {age(now - t.lastTradeAt)} ago</span>}
          <span aria-hidden className="pt-1 font-mono text-sm text-silver transition-transform group-hover:translate-x-0.5 group-hover:text-paper">
            →
          </span>
        </span>
      </Link>
    </li>
  );
}

/** The launch most worth a look right now: the brightest sign on the street. */
function Featured({ t, now }: { t: TokenView; now: number }) {
  return (
    <Part title="Brightest on the street" id="featured">
      <Link href={`/realm/token/${t.token}`} className="group -mx-2 grid grid-cols-[5.5rem_minmax(0,1fr)] gap-5 rounded-lg px-2 py-2 transition-colors hover:bg-paper/[0.04] sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-7">
        <Thumb t={t} size="h-[5.5rem] w-[5.5rem] sm:h-[8.5rem] sm:w-[8.5rem]" />
        <span className="flex min-w-0 flex-col gap-4">
          <span className="space-y-1.5">
            <span className="block text-[clamp(1.6rem,4vw,2.2rem)] leading-[1.08] wrap-anywhere">{t.name ?? "Name not shown"}</span>
            <span className="block font-mono text-[11px] text-silver">
              ${t.symbol ?? "?"} · by {short(t.realm)} · {age(now - t.at)} old
            </span>
            {t.description && <span className="line-clamp-3 block max-w-[32em] leading-snug text-paper/80">{t.description}</span>}
          </span>
          <dl className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4">
            {[
              ["Cap", money(t.marketCapUsd)],
              ["24h", t.change24h === null ? "·" : `${t.change24h >= 0 ? "+" : ""}${(t.change24h * 100).toFixed(1)}%`],
              ["Vol 24h", money(t.volume24hUsd)],
              ["Trades", t.trades.toLocaleString("en-US")],
            ].map(([k, v]) => (
              <div key={k} className="space-y-0.5">
                <dt className={label}>{k}</dt>
                <dd className="text-xl leading-tight tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          <span className="block space-y-2">
            <Bar t={t} thick />
            <span className="flex flex-wrap justify-between gap-x-4 gap-y-1 font-mono text-[11px] text-silver">
              <span>{t.graduated ? "Graduated" : `Graduation ${Math.floor(grad(t))}% · at 80% of the supply bought`}</span>
              <span className="text-paper transition-transform group-hover:translate-x-0.5">Trade →</span>
            </span>
          </span>
        </span>
      </Link>
    </Part>
  );
}

/** The latest buys, sells and launches, running along the street like a sign's moving letters. */
function Ticker({ items }: { items: FeedItem[] }) {
  if (!items.length) return null;
  const row = (dup: boolean) => (
    <ul aria-hidden={dup} className={`flex shrink-0 gap-7 pr-7 ${dup ? "motion-reduce:hidden" : ""}`}>
      {items.map((x, i) => (
        <li key={`${x.token}${x.at}${i}`}>
          <Link href={`/realm/token/${x.token}`} tabIndex={dup ? -1 : undefined} className="flex items-center gap-2 py-1 whitespace-nowrap transition-colors hover:text-paper">
            <Thumb t={x} size="h-5 w-5" />
            <span className={x.kind === "launch" ? "text-paper underline decoration-paper/40 underline-offset-2" : x.buy ? "text-paper" : "text-silver"}>
              {x.kind === "launch" ? "launched" : x.buy ? "bought" : "sold"}
            </span>
            <span className="text-paper">${x.symbol ?? "?"}</span>
            {x.usd !== null && <span className="tabular-nums">{money(x.usd)}</span>}
            {x.who && <span className="text-silver/80">{short(x.who)}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
  return (
    <div aria-label="Latest trades and launches" role="region" className="ticker -mx-5 overflow-hidden border-y border-dashed border-paper/25 px-5 py-2 font-mono text-[11px] text-silver motion-reduce:overflow-x-auto sm:-mx-9 sm:px-9">
      <div className="ticker-track flex w-max">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}

/** The page's one green action: launch from your own Realm, or connect a wallet first. */
export function Launch() {
  const { address } = useAccount();
  if (!address) return <Connect label="Connect to launch a token" />;
  return (
    <Link href={`/realm/${address.toLowerCase()}`} className={`${action} min-h-11`}>
      Launch a token
    </Link>
  );
}

// a filter word: the tap area is a full 44 px on a phone, the ink fill only as tall as the word
const pill = "group inline-flex min-h-11 shrink-0 items-center font-mono text-[12px] tracking-[0.04em] text-silver transition-colors hover:text-paper aria-pressed:text-developer sm:min-h-9";
const pillInk = "rounded-full px-3 py-1.5 transition-colors group-aria-pressed:bg-paper";

/** SilverRealm's board: every launch, sorted and searched like any launchpad's, refreshed while you watch. The page's head sits above it. */
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

  return (
    <>
      <Part title="The street · since launch">
        <Figures
          columns={2}
          items={[
            { label: "Launches", value: head.burned.launches.toLocaleString("en-US") },
            { label: "Volume", value: money(head.volumeUsd) },
            { label: "$SC burned", value: tokens(head.burned.sc, 0) },
            { label: "$ZC burned", value: tokens(head.burned.zc, 0) },
          ]}
        />
        <Ticker items={head.feed} />
      </Part>

      {head.featured && !view.q && <Featured t={head.featured} now={head.now} />}

      <Part title="Every sign on the street" id="launches" more={<span className="text-silver tabular-nums">{head.total || ""}</span>}>
        <div className="space-y-3">
          <label className="block">
            <span className="sr-only">Search launches</span>
            <input
              type="search"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Search a name, $symbol or address"
              maxLength={64}
              className={`${field} text-base`}
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-x-6">
            <div role="group" aria-label="Sort" className="-mx-1 flex flex-wrap">
              {TABS.map(([id, name]) => (
                <button key={id} type="button" aria-pressed={view.sort === id} onClick={() => setView((v) => ({ ...v, sort: id }))} className={pill}>
                  <span className={pillInk}>{name}</span>
                </button>
              ))}
            </div>
            <div role="group" aria-label="Paired with" className="-mx-1 flex flex-wrap items-center">
              <span className={`${label} px-1`} aria-hidden>
                Paired with
              </span>
              {[["", "All"] as const, ...BASES.map((b) => [b.id, b.name.replace("$", "")] as const)].map(([id, name]) => (
                <button key={id || "all"} type="button" aria-pressed={view.base === id} onClick={() => setView((v) => ({ ...v, base: id }))} className={pill}>
                  <span className={pillInk}>{name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {q.isError && !list.length ? (
          <Empty>{q.error.message}. Trying again shortly.</Empty>
        ) : !list.length ? (
          <Empty>
            {view.q
              ? `Nothing on the street matches "${view.q}".`
              : view.sort === "graduated"
                ? "No token has graduated yet."
                : "The street is dark. No token has been launched yet, so the first sign is yours."}
          </Empty>
        ) : (
          <ol className={`ruled -mx-2 transition-opacity ${q.isPlaceholderData ? "opacity-60" : ""}`}>
            {list.map((t) => (
              <Card key={t.token} t={t} now={head.now} />
            ))}
          </ol>
        )}
        {q.hasNextPage && (
          <button type="button" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage} className={`${second} min-h-11`}>
            {q.isFetchingNextPage ? "Loading…" : "Load more"}
          </button>
        )}
      </Part>
    </>
  );
}
