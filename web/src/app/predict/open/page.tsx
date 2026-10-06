import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Page, PageHead, label } from "@/components/journal";
import { OpenMarketForm } from "@/components/predict";
import { ADDR, ZERO } from "@/lib/config";

export const metadata: Metadata = { title: "Open a market · silverchat" };

export default function OpenMarketPage() {
  if (ADDR.predict === ZERO) notFound();
  return (
    <Page>
      <div className="space-y-3">
        <Link href="/predict" className={`${label} inline-flex min-h-11 items-center gap-2 transition-colors hover:text-paper`}>
          <span aria-hidden>←</span> All markets
        </Link>
        <PageHead stop="predict" title="Open a market">
          Lock $SC to open a market. People stake $ZC on YES or NO until it closes. A price market reads Chainlink at the
          time you set. An event market asks Reality.eth, where anyone can answer with an ETH bond and Kleros settles a
          dispute.
        </PageHead>
      </div>
      <OpenMarketForm />
    </Page>
  );
}
