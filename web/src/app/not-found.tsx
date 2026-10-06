import type { Metadata } from "next";
import Link from "next/link";

import { Page, action, label, quiet } from "@/components/journal";

export const metadata: Metadata = { title: "Not found · silverchat" };

export default function NotFound() {
  return (
    <Page>
      <header className="space-y-5">
        <p className={label}>404</p>
        <h1 className="max-w-[14em] text-[clamp(2.3rem,5.2vw,3.5rem)] leading-[1.03] text-balance">This path leads nowhere.</h1>
        <p className="max-w-[34em] text-[1.075rem] leading-relaxed text-paper/80">The page does not exist, or the poll you followed was never asked.</p>
      </header>
      <p className="flex flex-wrap items-center gap-x-6 gap-y-4 font-mono text-sm">
        <Link href="/pulse" className={action}>
          Open questions
        </Link>
        <Link href="/records" className={quiet}>
          Records
        </Link>
        <Link href="/" className={quiet}>
          Back to the walk
        </Link>
      </p>
    </Page>
  );
}
