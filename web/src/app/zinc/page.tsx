import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Checks, ForkHead, Notes, OtherWay, Seen } from "@/components/fork";
import { Page } from "@/components/journal";
import { Zinc } from "@/components/zinc";
import { CASH_LIVE, EXPLORER, ZINC_LIVE } from "@/lib/config";
import { short } from "@/lib/format";

const VAULT = "0x4386FDbdA35D995beB3BF8625118Ec5982ec81fe";

export const generateMetadata = (): Metadata => (ZINC_LIVE ? {
  title: "Zinc · silverchat",
  description: "Shielded ZEC in, anonymous AI out, shielded ZEC back. zkAPI and NEAR Intents, in your browser.",
} : {});

// what each party sees, said plainly
const NOTES = [
  "Zcash sees a shielded wallet pay a NEAR deposit address. Who paid is hidden; the amount is public.",
  "NEAR Intents sees that swap, the burner it paid and your IP address. Its network of signers holds the coins while it swaps them. It cannot see what the ETH buys.",
  "Ethereum sees the burner put ETH into zkAPI's vault and, at the end, take what is left out. The amounts on both sides of NEAR can match: use round amounts and wait before the exit.",
  "zkAPI's server sees proofs and spending, never a prompt, and the proofs do not say which deposit paid. While few people use zkAPI, the time between a deposit and its first use can still link them: wait a while before you start. OpenRouter sees prompts under a short-lived key, never who paid. It can still read what you write: do not sign it.",
  "Above 1 ZEC per swap, a ZKPassport proof is asked for: 18 or older and on no sanctions list, nothing about nationality. The page checks it against ZKPassport's verifier on Ethereum through ZKPassport's own connection, so ZKPassport sees the burner's address; nobody sees your name, number or country. The check runs in this browser only.",
  "zkAPI is new (live on mainnet since 2026-10-01), its proving setup was made by one party, and it is not audited. Keep amounts small. If its server stops, the slow way out still works, after 24 hours.",
  "A private balance lasts 30 days from its deposit. After that anyone can close it, and all of it goes to zkAPI's operator. Send it home before then.",
  "The burner's key is the ETH on it; the private balance is a note in this browser, which the key cannot bring back. Zinc takes no fee. NEAR's quote includes its fees (about 0.3% for the round trip, plus a small network fee each way), and the vault's gas is paid from the burner.",
  "Everything runs in this browser. Our server passes zkAPI's calls through without reading them; like any web server, our host records the path and IP address of each request. Use Tor or a VPN if your IP address matters.",
];

// the same, in two short lists for a first look
const HIDDEN = [
  "Who paid: the ZEC comes from a shielded wallet.",
  "Which deposit pays for each answer: a zero-knowledge proof pays, not an account.",
  "Who wrote a prompt: OpenRouter sees a short-lived key, never who paid.",
  "Your name, number and country, when a ZKPassport proof is asked for.",
];
const SHOWN = [
  "The amounts: ZEC into NEAR, ETH into zkAPI's vault and out again.",
  "What you write, to OpenRouter. Do not sign it.",
  "Your IP address, to NEAR and to our host.",
  "The burner's address, to ZKPassport's connection.",
];

export default function ZincPage() {
  if (!ZINC_LIVE) notFound();
  return (
    <Page>
      <ForkHead side="zinc" otherLive={CASH_LIVE}>
        <p>
          Pay for any AI model with no account and no trail. Your ZEC becomes ETH through NEAR Intents, the ETH becomes a private
          zkAPI balance, and each answer is paid with a zero-knowledge proof. When you are done, what is left goes back to
          shielded ZEC.
        </p>
        <p className="text-[0.95rem] text-paper/65 italic">Zinc is not from the book: it is a tool for the people who hold ZEC and use AI.</p>
      </ForkHead>

      <Zinc />

      <Seen hidden={HIDDEN} shown={SHOWN} />
      <Notes title="Who sees what, in full" notes={NOTES} />
      <Checks
        rows={[
          { name: "zkAPI vault", href: `${EXPLORER}/address/${VAULT}`, text: short(VAULT) },
          { name: "Swaps by NEAR Intents", href: "https://docs.near-intents.org", text: "docs.near-intents.org" },
          { name: "Models by OpenRouter", href: "https://openrouter.ai", text: "openrouter.ai" },
        ]}
      />
      <OtherWay side="zinc" live={CASH_LIVE} />
    </Page>
  );
}
