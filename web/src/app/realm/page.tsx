import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RealmBoard } from "@/components/realm-board";
import { ADDR, ZERO } from "@/lib/config";
import { board } from "@/lib/server/realm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "SilverRealm · silverchat",
  description: "Launch a token from your Realm. Every launch burns $SC, every trade feeds the ecosystem, and SilverRealm keeps nothing.",
};

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function RealmPage({ searchParams }: PageProps<"/realm">) {
  if (ADDR.realmFactory === ZERO) notFound();
  const sp = await searchParams;
  const first = await board({ sort: one(sp.sort), q: one(sp.q), base: one(sp.base) });
  // the view as the server read it, so the browser asks for the same thing
  const view = { sort: first.sort, q: one(sp.q).trim().slice(0, 64), base: first.base };
  return (
    <section className="mx-auto max-w-7xl px-5 py-10 sm:px-8 md:py-14">
      {/* a new view in the address (the header's link, back and forward) starts the board again from it */}
      <RealmBoard key={`${view.sort}|${view.q}|${view.base}`} first={first} view={view} />
    </section>
  );
}
