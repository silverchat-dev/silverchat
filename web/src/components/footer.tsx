import Link from "next/link";

import { ADDR, BOOK_URL, EXPLORER, GITHUB_URL, ZERO, ZINC_LIVE, ZIPCOIN_URL } from "@/lib/config";
import { short } from "@/lib/format";

const link = "text-silver underline-offset-4 hover:text-paper hover:underline";

/** The colophon at the foot of every page: where to check things, the two tokens, and the plain warning. */
export function Footer() {
  return (
    <footer className="mx-5 space-y-5 border-t border-silver/30 py-8 font-mono text-xs leading-relaxed text-silver sm:mx-9">
      <nav aria-label="More" className="flex flex-wrap gap-x-5 gap-y-2">
        <Link className={link} href="/algorithm">
          The rules
        </Link>
        <Link className={link} href="/demo">
          Try it
        </Link>
        <Link className={link} href="/stats">
          Stats
        </Link>
        {ZINC_LIVE && (
          <Link className={link} href="/zinc">
            Zinc
          </Link>
        )}
        {ADDR.riddle !== ZERO && (
          <Link className={link} href="/riddle">
            The riddle
          </Link>
        )}
        <a className={link} href={GITHUB_URL} target="_blank" rel="noreferrer">
          Source
        </a>
      </nav>
      <p className="flex flex-wrap gap-x-5 gap-y-1">
        <span>
          $ZC{" "}
          <a className={link} href={`${EXPLORER}/token/${ADDR.zc}`} target="_blank" rel="noreferrer">
            {short(ADDR.zc)}
          </a>
        </span>
        {ADDR.sc !== ZERO && (
          <span>
            $SC{" "}
            <a className={link} href={`${EXPLORER}/token/${ADDR.sc}`} target="_blank" rel="noreferrer">
              {short(ADDR.sc)}
            </a>
          </span>
        )}
      </p>
      <p className="max-w-xl text-silver/90">
        Open source at{" "}
        <a className={link} href={GITHUB_URL} target="_blank" rel="noreferrer">
          github.com/silverchat-dev/silverchat
        </a>
        . Questions are paid in{" "}
        <a className={link} href={ZIPCOIN_URL} target="_blank" rel="noreferrer">
          $ZC
        </a>
        . Silverchat comes from{" "}
        <a className={link} href={BOOK_URL} target="_blank" rel="noreferrer">
          Snowmoon
        </a>
        , a novel by Vitalik Buterin. We are not affiliated with him. The contracts are not audited and the tokens are volatile.
        Don&apos;t trust this page. Verify it.
      </p>
    </footer>
  );
}
