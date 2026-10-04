"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { BlockClock } from "@/components/block-clock";
import { Rewards } from "@/components/rewards";
import { YouLink } from "@/components/you";
import { ADDR, CASH_LIVE, ZERO, ZINC_LIVE } from "@/lib/config";

const NAV = [
  { href: "/pulse", label: "Pulse" },
  { href: "/ask", label: "Ask" },
  ...(ADDR.predict !== ZERO ? [{ href: "/predict", label: "Predict" }] : []),
  ...(ADDR.realmFactory !== ZERO ? [{ href: "/realm", label: "Realm" }] : []),
  // Cash takes Try it's place once it is live; on a phone the links wrap to a second row
  ...(CASH_LIVE ? [{ href: "/cash", label: "Cash" }] : [{ href: "/demo", label: "Try it" }]),
  ...(ZINC_LIVE ? [{ href: "/zinc", label: "Zinc" }] : []),
  { href: "/records", label: "Records" },
  { href: "/docs", label: "Docs" },
];

const NAV_LINK = "text-paper/80 hover:text-paper aria-[current=page]:text-paper";

export function Header() {
  const path = usePathname();
  const home = path === "/";

  return (
    <header className="relative z-10">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4 sm:px-8">
        {!home && (
          <Link href="/" aria-label="silverchat home" className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/wordmark.png" alt="silverchat" width={720} height={139} className="h-5 w-auto" />
          </Link>
        )}
        <nav className="order-last flex w-full flex-wrap gap-x-4 gap-y-1 text-[11px] uppercase tracking-[0.06em] sm:gap-x-7 sm:text-[13px] sm:tracking-[0.12em] 2xl:order-none 2xl:w-auto 2xl:flex-1">
          {NAV.map((n) => (
            <Link
              key={n.label}
              href={n.href}
              aria-current={path === n.href || path.startsWith(n.href + "/") ? "page" : undefined}
              className={NAV_LINK}
            >
              {n.label}
            </Link>
          ))}
          {!home && <YouLink className={NAV_LINK} />}
          {/* the riddle stands apart from the app: its own item, once SilverRiddle is live */}
          {ADDR.riddle !== ZERO && (
            <>
              <span aria-hidden className="hidden w-px self-stretch bg-silver/30 sm:block" />
              <Link
                href="/riddle"
                aria-current={path === "/riddle" ? "page" : undefined}
                className="border border-paper/40 px-2 text-paper/80 hover:border-paper hover:text-paper aria-[current=page]:border-paper aria-[current=page]:text-paper"
              >
                The riddle
              </Link>
            </>
          )}
        </nav>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-x-5 gap-y-2">
          <BlockClock />
          {home ? (
            <Link href="/ask" className="bg-safelight px-5 py-2.5 font-mono text-sm text-developer hover:brightness-110">
              Launch app
            </Link>
          ) : (
            <>
              <Rewards />
              <ConnectButton chainStatus="none" showBalance={false} accountStatus={{ smallScreen: "avatar", largeScreen: "full" }} />
            </>
          )}
        </div>
      </div>
    </header>
  );
}
