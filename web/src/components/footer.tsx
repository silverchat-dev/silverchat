import Link from "next/link";

import { ADDR, BOOK_URL, EXPLORER, GITHUB_URL, ZERO, ZIPCOIN_URL } from "@/lib/config";
import { short } from "@/lib/format";

const link = "text-silver underline-offset-4 hover:text-paper hover:underline";

export function Footer() {
  return (
    <footer className="border-t border-silver/25">
      <div className="flex flex-col gap-6 px-5 py-8 font-mono text-xs leading-relaxed text-silver/80 sm:px-8 md:flex-row md:justify-between">
        <p className="max-w-xl">
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
        <p className="flex shrink-0 flex-col gap-2 md:items-end">
          <Link className={link} href="/algorithm">
            The rules
          </Link>
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
      </div>
    </footer>
  );
}
