import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { YourRealmLink } from "@/components/realm-you";
import { TokenGrid } from "@/components/realm-list";
import { ADDR, ZERO } from "@/lib/config";
import { tokens } from "@/lib/format";
import { db } from "@/lib/server/db";

import { serializeToken } from "@/lib/server/realm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "SilverRealm · silverchat",
  description: "Launch a token from your Realm. Every launch burns $SC, every trade feeds the ecosystem, and SilverRealm keeps nothing.",
};

export default async function RealmPage() {
  if (ADDR.realmFactory === ZERO) notFound();
  const [rows, burned] = await Promise.all([db.realmTokens({}, 60), db.realmBurned()]);
  const list = await Promise.all(rows.map(serializeToken));
  return (
    <section className="mx-auto max-w-6xl space-y-12 px-5 py-10 sm:px-8 md:py-14">
      <header className="max-w-2xl space-y-4">
        <h1 className="text-5xl leading-tight">SilverRealm</h1>
        <p className="text-lg leading-relaxed text-paper/80">
          Your Realm is your wallet&apos;s page on Silverchat, free to open. From it you can launch what you believe in.
          Each launch buys $5 of $SC and burns it. Every trade pays a fee, and all of it goes back to the ecosystem: 80%
          buys and burns $SC, 20% buys and burns $ZC. SilverRealm keeps nothing.
        </p>
        <YourRealmLink />
      </header>
      <dl className="grid gap-6 font-mono text-sm sm:grid-cols-3">
        <div>
          <dt className="text-silver uppercase tracking-[0.14em]">Launches</dt>
          <dd className="text-3xl">{burned.launches}</dd>
        </div>
        <div>
          <dt className="text-silver uppercase tracking-[0.14em]">$SC burned</dt>
          <dd className="text-3xl">{tokens(burned.sc, 0)}</dd>
        </div>
        <div>
          <dt className="text-silver uppercase tracking-[0.14em]">$ZC burned</dt>
          <dd className="text-3xl">{tokens(burned.zc, 0)}</dd>
        </div>
      </dl>
      <section className="space-y-4">
        <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-silver">Newest launches</h2>
        <TokenGrid list={list} />
      </section>
    </section>
  );
}
