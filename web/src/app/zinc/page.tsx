import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Zinc } from "@/components/zinc";
import { EXPLORER, ZINC_LIVE } from "@/lib/config";
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
  "Above 0.1 ZEC per swap, a ZKPassport proof is asked for. The page checks it against ZKPassport's verifier on Ethereum through ZKPassport's own connection, so ZKPassport sees the burner's address; nobody sees your name, number or country. The check runs in this browser only.",
  "zkAPI is new (live on mainnet since 2026-10-01), its proving setup was made by one party, and it is not audited. Keep amounts small. If its server stops, the slow way out still works, after 24 hours.",
  "A private balance lasts 30 days from its deposit. After that anyone can close it, and all of it goes to zkAPI's operator. Send it home before then.",
  "The burner's key is the ETH on it; the private balance is a note in this browser, which the key cannot bring back. Zinc takes no fee. NEAR's quote includes its fees (about 0.3% for the round trip, plus a small network fee each way), and the vault's gas is paid from the burner.",
  "Everything runs in this browser. Our server passes zkAPI's calls through without reading them; like any web server, our host records the path and IP address of each request. Use Tor or a VPN if your IP address matters.",
];

export default function ZincPage() {
  if (!ZINC_LIVE) notFound();
  return (
    <section className="mx-auto max-w-6xl space-y-12 px-5 py-10 sm:px-8 md:py-14">
      <header className="max-w-2xl space-y-4">
        <h1 className="text-5xl leading-tight">Zinc</h1>
        <p className="font-mono text-sm uppercase tracking-[0.2em] text-silver">Shielded ZEC in. Anonymous AI out. Shielded ZEC back.</p>
        <p className="text-lg leading-relaxed text-paper/80">
          Pay for any AI model with no account and no trail. Your ZEC becomes ETH through NEAR Intents, the ETH becomes a private
          zkAPI balance, and each answer is paid with a zero-knowledge proof. When you are done, what is left goes back to
          shielded ZEC. Zinc is not from the book: it is a tool for the people who hold ZEC and use AI.
        </p>
      </header>

      <Zinc />

      <section aria-labelledby="zinc-notes" className="max-w-3xl space-y-4">
        <h2 id="zinc-notes" className="font-mono text-xs uppercase tracking-[0.14em] text-silver">
          Who sees what
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
          zkAPI vault:{" "}
          <a href={`${EXPLORER}/address/${VAULT}`} target="_blank" rel="noreferrer" className="underline underline-offset-4">
            {short(VAULT)}
          </a>{" "}
          · swaps by{" "}
          <a href="https://docs.near-intents.org" target="_blank" rel="noreferrer" className="underline underline-offset-4">
            NEAR Intents
          </a>{" "}
          · models by{" "}
          <a href="https://openrouter.ai" target="_blank" rel="noreferrer" className="underline underline-offset-4">
            OpenRouter
          </a>
        </p>
      </section>
    </section>
  );
}
