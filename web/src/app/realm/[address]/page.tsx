import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isAddress } from "viem";

import { Page, PageHead, Part, quiet } from "@/components/journal";
import { LaunchForm } from "@/components/realm";
import { TokenGrid } from "@/components/realm-list";
import { OwnerOnly } from "@/components/realm-you";
import { ADDR, EXPLORER, ZERO } from "@/lib/config";
import { short } from "@/lib/format";
import { db } from "@/lib/server/db";

import { serializeTokens } from "@/lib/server/realm";

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
  const list = await serializeTokens(await db.realmTokens({ realm }, 60));
  return (
    <Page>
      <PageHead
        stop="realm"
        title={`Realm ${short(realm)}`}
        aside={
          <>
            <a href={`${EXPLORER}/address/${realm}`} target="_blank" rel="noreferrer" className={`${quiet} font-mono text-xs break-all text-silver`}>
              {realm}
            </a>
            <Link href={`/u/${realm}`} className={`${quiet} font-mono text-xs`}>
              profile
            </Link>
          </>
        }
      >
        One wallet&apos;s shop front on Hun Min street: every token it launched hangs here as a sign. Only the wallet itself can
        launch from it.
      </PageHead>
      <OwnerOnly realm={realm}>
        <Part title="Launch a token" id="launch">
          <LaunchForm />
        </Part>
      </OwnerOnly>
      <Part title="Launched from this Realm" id="launched" more={<span className="text-silver tabular-nums">{list.length || ""}</span>}>
        <TokenGrid list={list} />
      </Part>
    </Page>
  );
}
