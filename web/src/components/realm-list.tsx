import Link from "next/link";

import { Empty, quiet } from "@/components/journal";
import { short, tokens } from "@/lib/format";
import { baseOf, feeLabel, GRADUATION, imageSrc } from "@/lib/realm";

export type TokenView = {
  token: string;
  realm: string;
  base: string;
  feePpm: number;
  name: string | null;
  symbol: string | null;
  uri: string | null;
  image: string | null;
  marketCapUsd: number | null;
  sold: number | null;
  graduated: boolean;
  price: number | null;
  trades: number;
  fees: string;
  at: number;
};

/** Launched tokens as a ruled list of signs, newest first. */
export function TokenGrid({ list }: { list: TokenView[] }) {
  if (!list.length)
    return (
      <Empty
        then={
          <Link href="/realm" className={`${quiet} font-mono text-xs`}>
            Walk the street →
          </Link>
        }
      >
        No sign hangs from this Realm yet.
      </Empty>
    );
  return (
    <ol className="ruled -mx-2">
      {list.map((t) => {
        const base = baseOf(t.base);
        const grad = Math.min(100, ((t.sold ?? 0) / GRADUATION) * 100);
        const src = imageSrc(t.image);
        return (
          <li key={t.token}>
            <Link
              href={`/realm/token/${t.token}`}
              className="group grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-start gap-x-4 rounded-md px-2 py-4 transition-colors hover:bg-paper/[0.04]"
            >
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt="" width={56} height={56} loading="lazy" referrerPolicy="no-referrer" className="h-14 w-14 rounded-md bg-film object-cover ring-1 ring-paper/10" />
              ) : (
                <span aria-hidden className="grid h-14 w-14 place-items-center rounded-md border border-dashed border-paper/30 font-mono text-[11px] text-silver">
                  {(t.symbol ?? "?").slice(0, 4)}
                </span>
              )}
              <span className="min-w-0 space-y-2">
                <span className="block min-w-0">
                  <span className="block text-[1.2rem] leading-snug wrap-anywhere">{t.name ?? "Name not shown"}</span>
                  <span className="block font-mono text-[11px] text-silver">
                    ${t.symbol ?? "?"} · {base?.name ?? "?"} pair · {feeLabel(t.feePpm)} fee
                  </span>
                </span>
                <span className="block space-y-1.5">
                  <span aria-hidden className="block h-1 w-full overflow-hidden rounded-full bg-paper/12">
                    <span className="block h-full rounded-full bg-paper" style={{ width: `${grad}%` }} />
                  </span>
                  <span className="flex flex-wrap justify-between gap-x-3 gap-y-1 font-mono text-[11px] text-silver">
                    {t.graduated ? <span className="rounded-full bg-paper px-2 py-0.5 text-developer">Graduated</span> : <span>Graduation {Math.round(grad)}%</span>}
                    <span>Realm {short(t.realm)}</span>
                  </span>
                </span>
              </span>
              <span className="flex flex-col items-end gap-1 text-right">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-silver">{t.marketCapUsd === null ? "" : "cap"}</span>
                <span className="text-[1.2rem] leading-none tabular-nums">{t.marketCapUsd === null ? "·" : `$${Math.round(t.marketCapUsd).toLocaleString("en-US")}`}</span>
                <span className="font-mono text-[11px] text-silver tabular-nums">{t.trades} trades</span>
                <span className="font-mono text-[11px] text-silver tabular-nums">
                  {tokens(t.fees, 4)} {base?.name ?? ""} burned
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
