import Link from "next/link";

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

/** Launched tokens as a contact sheet of frames, newest first. */
export function TokenGrid({ list }: { list: TokenView[] }) {
  if (!list.length) return <p className="text-xl text-paper/80">No tokens yet.</p>;
  return (
    <ol className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))]">
      {list.map((t) => {
        const base = baseOf(t.base);
        return (
          <li key={t.token} className="film">
            <Link href={`/realm/token/${t.token}`} className="flex h-full min-h-40 flex-col justify-between gap-6 bg-paper p-5 text-developer hover:brightness-[1.04]">
              <span className="space-y-1">
                {imageSrc(t.image) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageSrc(t.image)!} alt="" width={48} height={48} loading="lazy" referrerPolicy="no-referrer" className="mb-2 h-12 w-12 object-cover" />
                )}
                <span className="block text-2xl leading-snug wrap-anywhere">{t.name ?? "Name not shown"}</span>
                <span className="block font-mono text-xs text-developer/70">
                  ${t.symbol ?? "?"} · {base?.name ?? "?"} pair · {feeLabel(t.feePpm)} fee
                </span>
              </span>
              <span className="space-y-2">
                <span className="flex flex-wrap justify-between gap-x-3 gap-y-1 font-mono text-xs text-developer/70">
                  <span>{t.marketCapUsd === null ? "·" : `$${Math.round(t.marketCapUsd).toLocaleString("en-US")} cap`}</span>
                  <span>{t.trades} trades</span>
                  <span>{tokens(t.fees, 4)} {base?.name ?? ""} burned</span>
                </span>
                <span className="block h-1 w-full bg-developer/10">
                  <span className="block h-full bg-developer" style={{ width: `${Math.min(100, ((t.sold ?? 0) / GRADUATION) * 100)}%` }} />
                </span>
                <span className="flex justify-between font-mono text-xs text-developer/70">
                  <span>{t.graduated ? <span className="bg-developer px-1.5 text-paper">Graduated</span> : `Graduation ${Math.round(((t.sold ?? 0) / GRADUATION) * 100)}%`}</span>
                  <span>Realm {short(t.realm)}</span>
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
