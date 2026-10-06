import type { Metadata } from "next";

import { Demo } from "@/components/demo";
import { Page, PageHead } from "@/components/journal";

export const metadata: Metadata = { title: "Try it · silverchat" };

export default function DemoPage() {
  return (
    <Page>
      <PageHead stop="gate" art={<GateArt />}>
        Try it here first. Ask a question, answer it, and watch the result get fixed and paid out. It all runs in your
        browser, so you don&apos;t need a wallet or any ZC.
      </PageHead>
      <Demo />
    </Page>
  );
}

/** The gate into Meldan, in ink: an arch in a wall, and the green circle on the ground that lets you in. */
function GateArt() {
  return (
    <svg viewBox="0 0 120 120" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 96 L8 44 L38 44 M82 44 L112 44 L112 96" />
      <path d="M38 96 L38 52 Q 60 22 82 52 L82 96" />
      <path d="M44 96 L44 55 Q 60 33 76 55 L76 96" strokeWidth="0.9" opacity="0.6" />
      <path d="M8 58 L38 58 M82 58 L112 58 M8 72 L38 72 M82 72 L112 72 M8 86 L38 86 M82 86 L112 86" strokeWidth="0.8" opacity="0.5" />
      <path d="M20 44 L20 58 M28 58 L28 72 M18 72 L18 86 M96 44 L96 58 M100 58 L100 72 M92 72 L92 86" strokeWidth="0.8" opacity="0.5" />
      <path d="M2 96 L118 96" />
      <ellipse cx="60" cy="104" rx="15" ry="4.2" stroke="var(--color-tap)" fill="var(--color-tap)" fillOpacity="0.18" />
      <ellipse cx="60" cy="104" rx="21" ry="6" stroke="var(--color-tap)" strokeWidth="0.8" opacity="0.5" />
    </svg>
  );
}
