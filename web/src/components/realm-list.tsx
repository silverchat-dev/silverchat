import Link from "next/link";

import { short, tokens } from "@/lib/format";
import { baseOf, feeLabel, imageSrc } from "@/lib/realm";

export type TokenView = {
  token: string;
  realm: string;
  base: string;
  feePpm: number;
  name: string | null;
  symbol: string | null;
  uri: string | null;
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
                {imageSrc(t.uri) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageSrc(t.uri)!} alt="" width={48} height={48} loading="lazy" referrerPolicy="no-referrer" className="mb-2 h-12 w-12 object-cover" />
                )}
                <span className="block text-2xl leading-snug wrap-anywhere">{t.name ?? "Name not shown"}</span>
                <span className="block font-mono text-xs text-developer/70">
                  ${t.symbol ?? "?"} · {base?.name ?? "?"} pair · {feeLabel(t.feePpm)} fee
                </span>
              </span>
              <span className="flex flex-wrap justify-between gap-x-3 gap-y-1 font-mono text-xs text-developer/70">
                <span>{t.trades} trades</span>
                <span>{tokens(t.fees, 4)} {base?.name ?? ""} burned in fees</span>
                <span>Realm {short(t.realm)}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
