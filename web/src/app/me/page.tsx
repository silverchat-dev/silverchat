import type { Metadata } from "next";

import { YouPage } from "@/components/you";

export const metadata: Metadata = { title: "You · silverchat", robots: { index: false } };

export default function MePage() {
  return (
    <section className="mx-auto max-w-6xl space-y-10 px-5 py-10 sm:px-8 md:py-14">
      <header className="space-y-4">
        <h1 className="text-5xl leading-tight">You</h1>
        <p className="max-w-2xl text-lg leading-relaxed text-paper/80">
          The polls you asked, the ones you answered from this device, and the ones you saved. Your browser reads the open
          record and picks out your polls itself, so no request names the polls you answered.
        </p>
      </header>
      <YouPage />
    </section>
  );
}
