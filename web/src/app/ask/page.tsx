import type { Metadata } from "next";
import Link from "next/link";

import { AskForm } from "@/components/ask-form";
import { Page, PageHead, quiet } from "@/components/journal";

export const metadata: Metadata = { title: "Ask the network · silverchat" };

export default async function AskPage({ searchParams }: PageProps<"/ask">) {
  const breadth = Number((await searchParams).breadth);
  return (
    <Page>
      <PageHead
        stop="ask"
        art={<BrazierArt />}
        aside={
          <p className="font-mono text-xs text-silver">
            <Link href="/algorithm" className={quiet}>
              The published rules
            </Link>
            <span aria-hidden className="mx-3">
              ·
            </span>
            <Link href="/stats" className={quiet}>
              Every number since launch
            </Link>
          </p>
        }
      >
        Write a question, choose how many people it asks, and pay in $ZC. In Snowmoon, the more zipcoins you pay, the more
        people Silverchat polls. It works the same way here.
      </PageHead>
      <AskForm initialBreadth={breadth} />
    </Page>
  );
}

/** The burn at the doorstep, in ink: a coin falls into a brazier on three legs, and the flame is the act. */
function BrazierArt() {
  return (
    <svg viewBox="0 0 120 120" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="36" cy="20" r="7" />
      <rect x="33.5" y="17.5" width="5" height="5" strokeWidth="0.9" />
      <path d="M27 9 l-2.5 -4 M33 7 l-1 -4.5" strokeWidth="0.8" opacity="0.55" />
      <path d="M60 58 C 50 50 54 42 58 33 C 59 39 62 41 63 35 C 69 43 70 51 61 58" stroke="var(--color-tap)" />
      <path d="M60 56 C 57 52 58 48 60 44 C 62 48 63 52 60.5 56" stroke="var(--color-tap)" strokeWidth="0.9" />
      <path d="M22 60 L98 60" />
      <path d="M26 60 Q 60 92 94 60" />
      <ellipse cx="46" cy="64" rx="7" ry="2" strokeWidth="0.9" opacity="0.7" />
      <ellipse cx="73" cy="64" rx="6" ry="1.8" strokeWidth="0.9" opacity="0.7" />
      <path d="M42 71.5 L33 109 M60 76 L60 111 M78 71.5 L87 109" />
      <path d="M24 111 Q 60 104 96 111" strokeWidth="1" opacity="0.6" />
    </svg>
  );
}
