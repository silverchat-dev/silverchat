import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Cash } from "@/components/cash";
import { Checks, ForkHead, Notes, OtherWay, Seen } from "@/components/fork";
import { Page } from "@/components/journal";
import { ADDR, CASH_LIVE, EXPLORER, ZINC_LIVE } from "@/lib/config";
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

// the same, in two short lists for a first look
const HIDDEN = [
  "Who holds your private balance, and what it holds.",
  "Who made a private swap or a withdrawal.",
  "Your 12 words, keys and balances: they stay in this browser.",
];
const SHOWN = [
  "Your deposit: your wallet putting coins into Railgun.",
  "A private swap's coins and amounts.",
  "What comes out, and the address it goes to.",
  "Your IP address, to Railgun's data services, the RPC and broadcasters.",
];

export default function CashPage() {
  // the page ships before it goes live; until NEXT_PUBLIC_CASH=1 it does not exist
  if (!CASH_LIVE) notFound();
  return (
    <Page>
      <ForkHead side="cash" otherLive={ZINC_LIVE}>
        <p>
          Private money for the Silverchat ecosystem. Deposit $SC, $ZC or ETH into a private balance, swap between them inside
          it, and withdraw to a fresh wallet. It runs on Railgun, in your browser. SilverCash takes no fee.
        </p>
      </ForkHead>

      <Cash />

      <Seen hidden={HIDDEN} shown={SHOWN} />
      <Notes title="What it hides, and what it does not, in full" notes={NOTES} />
      <Checks
        rows={[
          { name: "Railgun", href: `${EXPLORER}/address/${RAILGUN}`, text: short(RAILGUN) },
          { name: "RelayAdapt", href: `${EXPLORER}/address/${RELAY_ADAPT}`, text: short(RELAY_ADAPT) },
          { name: "Swaps, through Stockereum's router", href: `${EXPLORER}/address/${ADDR.stockereumRouter}`, text: short(ADDR.stockereumRouter) },
        ]}
      />
      <OtherWay side="cash" live={ZINC_LIVE} />
    </Page>
  );
}
