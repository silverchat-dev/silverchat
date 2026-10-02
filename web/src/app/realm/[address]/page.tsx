import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isAddress } from "viem";

import { LaunchForm } from "@/components/realm";
import { TokenGrid } from "@/components/realm-list";
import { OwnerOnly } from "@/components/realm-you";
import { ADDR, EXPLORER, ZERO } from "@/lib/config";
import { short } from "@/lib/format";
import { db } from "@/lib/server/db";

import { serializeToken } from "../../api/realm/route";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/realm/[address]">): Promise<Metadata> {
  const { address } = await params;
  return { title: isAddress(address) ? `Realm ${short(address)} · silverchat` : "Realm · silverchat" };
}

export default async function RealmOf({ params }: PageProps<"/realm/[address]">) {
  if (ADDR.realmFactory === ZERO) notFound();
  const { address } = await params;
  if (!isAddress(address)) notFound();
  const realm = address.toLowerCase();
  const list = await Promise.all((await db.realmTokens({ realm }, 60)).map(serializeToken));
  return (
    <section className="mx-auto max-w-6xl space-y-12 px-5 py-10 sm:px-8 md:py-14">
      <header className="space-y-3">
        <h1 className="text-5xl leading-tight">Realm</h1>
        <p className="font-mono text-sm break-all text-paper/80">
          <a href={`${EXPLORER}/address/${realm}`} target="_blank" rel="noreferrer" className="underline underline-offset-4">
            {realm}
          </a>
          {" · "}
          <Link href={`/u/${realm}`} className="underline underline-offset-4">
            profile
          </Link>
        </p>
      </header>
      <OwnerOnly realm={realm}>
        <section className="space-y-4">
          <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-silver">Launch a token</h2>
          <LaunchForm />
        </section>
      </OwnerOnly>
      <section className="space-y-4">
        <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-silver">Launched from this Realm</h2>
        <TokenGrid list={list} />
      </section>
    </section>
  );
}
