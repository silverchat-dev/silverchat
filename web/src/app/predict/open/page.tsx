import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { OpenMarketForm } from "@/components/predict";
import { ADDR, ZERO } from "@/lib/config";

export const metadata: Metadata = { title: "Open a market · silverchat" };

export default function OpenMarketPage() {
  if (ADDR.predict === ZERO) notFound();
  return (
    <section className="mx-auto max-w-6xl space-y-10 px-5 py-10 sm:px-8 md:py-14">
      <header className="max-w-2xl space-y-4">
        <h1 className="text-5xl leading-tight">Open a market</h1>
        <p className="text-lg leading-relaxed text-paper/80">
          Lock $SC to open a market. People stake $ZC on YES or NO until it closes. A price market reads Chainlink at the
          time you set. An event market asks Reality.eth, where anyone can answer with an ETH bond and Kleros settles a
          dispute.
        </p>
      </header>
      <OpenMarketForm />
    </section>
  );
}
