"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { BlockClock } from "@/components/block-clock";
import { Rewards } from "@/components/rewards";
import { GITHUB_URL } from "@/lib/config";

const NAV: { href: string; label: string; external?: boolean }[] = [
  { href: "/ask", label: "Ask" },
  { href: GITHUB_URL, label: "Docs", external: true },
];

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
        <nav className="order-last flex w-full flex-wrap gap-x-7 gap-y-1 text-[13px] uppercase tracking-[0.12em] sm:order-none sm:w-auto sm:flex-1">
          {NAV.map((n) =>
            n.external ? (
              <a key={n.label} href={n.href} target="_blank" rel="noreferrer" className="text-paper/80 hover:text-paper">
                {n.label}
              </a>
            ) : (
              <Link
                key={n.label}
                href={n.href}
                aria-current={path === n.href || path.startsWith(n.href + "/") ? "page" : undefined}
                className="text-paper/80 hover:text-paper aria-[current=page]:text-paper"
              >
                {n.label}
              </Link>
            ),
          )}
        </nav>
        <div className="ml-auto flex items-center gap-5">
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
