import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Cash } from "@/components/cash";
import { ADDR, CASH_LIVE, EXPLORER } from "@/lib/config";
import { short } from "@/lib/format";
import { RAILGUN, RELAY_ADAPT } from "@/lib/cash/routes";

// static metadata would ship even with the 404, so it is built only once SilverCash is live
export const generateMetadata = (): Metadata => (CASH_LIVE ? {
  title: "SilverCash · silverchat",
  description: "Deposit $SC, $ZC or ETH, swap privately, withdraw to a fresh wallet. On Railgun, in your browser.",
} : {});

// what the page can and cannot hide, said plainly
const NOTES = [
  "Your deposit is public: anyone sees your wallet put coins into Railgun. What you do after it is not tied to that wallet.",
  "A private swap shows which coins and how much on Ethereum, but not whose. Few people hold $SC privately, so an amount in can match an amount out: swap to ETH inside, wait, and take out ETH in round amounts.",
  "Every deposit, and every swap's result, waits about an hour while Railgun checks it against lists of stolen and sanctioned funds (Chainalysis, Elliptic and others). Funds on those lists can only go back where they came from.",
  "$SC held privately earns no Stockereum holder rewards: Railgun's contract holds it, not you.",
  "SilverCash runs in this browser: your words, keys and balances never reach our server. It talks to Railgun's data services, a public Ethereum RPC and broadcaster peers, which see your IP address. Use a VPN or Tor if that matters.",
  "Railgun is a separate protocol we do not run. Its contracts and fees are its own. Keep your 12 words: they work in Railway or any Railgun wallet, with or without this site.",
];

export default function CashPage() {
  // the page ships before it goes live; until NEXT_PUBLIC_CASH=1 it does not exist
  if (!CASH_LIVE) notFound();
  return (
    <section className="mx-auto max-w-6xl space-y-12 px-5 py-10 sm:px-8 md:py-14">
      <header className="max-w-2xl space-y-4">
        <h1 className="text-5xl leading-tight">SilverCash</h1>
        <p className="font-mono text-sm uppercase tracking-[0.2em] text-silver">Deposit. Shield. Swap. Withdraw.</p>
        <p className="text-lg leading-relaxed text-paper/80">
          Private money for the Silverchat ecosystem. Deposit $SC, $ZC or ETH into a private balance, swap between them inside
          it, and withdraw to a fresh wallet. It runs on Railgun, in your browser. SilverCash takes no fee.
        </p>
      </header>

      <Cash />

      <section aria-labelledby="cash-notes" className="max-w-3xl space-y-4">
        <h2 id="cash-notes" className="font-mono text-xs uppercase tracking-[0.14em] text-silver">
          What it hides, and what it does not
        </h2>
        <ul className="space-y-3 leading-relaxed text-paper/80">
          {NOTES.map((t) => (
            <li key={t} className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-3">
              <span aria-hidden className="text-silver">·</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
        <p className="font-mono text-xs text-silver">
          Railgun:{" "}
          <a href={`${EXPLORER}/address/${RAILGUN}`} target="_blank" rel="noreferrer" className="underline underline-offset-4">
            {short(RAILGUN)}
          </a>{" "}
          · RelayAdapt:{" "}
          <a href={`${EXPLORER}/address/${RELAY_ADAPT}`} target="_blank" rel="noreferrer" className="underline underline-offset-4">
            {short(RELAY_ADAPT)}
          </a>{" "}
          · swaps through Stockereum&apos;s router{" "}
          <a href={`${EXPLORER}/address/${ADDR.stockereumRouter}`} target="_blank" rel="noreferrer" className="underline underline-offset-4">
            {short(ADDR.stockereumRouter)}
          </a>
        </p>
      </section>
    </section>
  );
}
