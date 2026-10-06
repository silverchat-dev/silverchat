import type { Metadata } from "next";

import { Page, PageHead } from "@/components/journal";
import { YouPage } from "@/components/you";

export const metadata: Metadata = { title: "You · silverchat", robots: { index: false } };

export default function MePage() {
  return (
    <Page>
      <PageHead stop="pulse" title="Your polls" art={<SatchelArt />}>
        The polls you asked, the ones you answered from this device, and the ones you saved. Your browser reads the open
        record and picks out your polls itself, so no request names the polls you answered.
      </PageHead>
      <YouPage />
    </Page>
  );
}

/** A field journal shut with its band, a ribbon marking the page you kept. */
function SatchelArt() {
  return (
    <svg viewBox="0 0 120 120" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <g transform="rotate(-6 60 60)">
        <rect x="28" y="18" width="62" height="82" rx="3" />
        <path d="M33 18 L33 100" strokeWidth="0.9" opacity="0.6" />
        <path d="M90 22 L93 22 L93 103 L32 103" strokeWidth="0.9" opacity="0.55" />
        <path d="M78 16 L78 102" strokeWidth="2.2" />
        <path d="M46 36 L68 36 M46 42 L64 42" strokeWidth="0.8" opacity="0.55" />
        <path d="M54 100 L52 114 L56 110 L59 114 L58 100" strokeWidth="1" />
      </g>
    </svg>
  );
}
