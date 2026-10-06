import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Page, PageHead } from "@/components/journal";
import { Launch, RealmBoard } from "@/components/realm-board";
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
    <Page>
      <PageHead stop="realm" art={<SignArt />} aside={<Launch />}>
        Every token launched on SilverRealm is a sign on Hun Min street. A launch burns $5 of $SC. Every trading fee goes
        back to the ecosystem: 80% buys and burns $SC, 20% buys and burns $ZC. SilverRealm keeps nothing.
      </PageHead>
      {/* a new view in the address (the header's link, back and forward) starts the board again from it */}
      <RealmBoard key={`${view.sort}|${view.q}|${view.base}`} first={first} view={view} />
    </Page>
  );
}

/** A shop sign on Hun Min street, in ink: hung from a bracket over a stairway down, one bulb just lit. */
function SignArt() {
  return (
    <svg viewBox="0 0 120 120" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 8 L12 72" />
      <path d="M12 18 L100 18 M12 34 L40 18" />
      <path d="M36 18 L36 30 M88 18 L88 30" strokeWidth="1" />
      <rect x="24" y="30" width="76" height="40" rx="3" />
      <path d="M36 46 h22 M36 54 h34 M36 62 h14" strokeWidth="0.9" opacity="0.6" />
      {[31, 41, 51, 61, 71, 81, 91].map((x, i) => (
        <circle key={x} cx={x} cy="36" r="1.9" fill={i === 5 ? "var(--color-tap)" : "none"} stroke={i === 5 ? "var(--color-tap)" : "currentColor"} strokeWidth="0.9" />
      ))}
      <path d="M78 52 l7 -6 l7 6 l-7 6 z" strokeWidth="1" />
      <path d="M18 112 L18 98 L34 98 L34 88 L50 88 L50 78 L66 78" strokeWidth="1.1" />
      <path d="M66 78 L104 78" strokeWidth="1" opacity="0.6" />
      <path d="M8 112 L112 112" strokeWidth="1" opacity="0.6" />
      <path d="M22 106 h8 M38 96 h8 M54 86 h8" strokeWidth="0.8" opacity="0.5" />
    </svg>
  );
}
