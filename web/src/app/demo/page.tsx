import type { Metadata } from "next";

import { Demo } from "@/components/demo";

export const metadata: Metadata = { title: "Try it · silverchat" };

export default function DemoPage() {
  return (
    <section className="mx-auto max-w-6xl space-y-10 px-5 py-10 sm:px-8 md:py-14">
      <header className="max-w-2xl space-y-4">
        <h1 className="text-5xl leading-tight">Try it</h1>
        <p className="text-lg leading-relaxed text-paper/80">
          Ask a question, answer it, and watch the result get fixed and paid out. It all runs in your browser, so you don&apos;t
          need a wallet or any ZC.
        </p>
      </header>
      <Demo />
    </section>
  );
}
