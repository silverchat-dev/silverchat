import type { Metadata } from "next";

import { AskForm } from "@/components/ask-form";

export const metadata: Metadata = { title: "Ask the network · silverchat" };

export default function AskPage() {
  return (
    <section className="mx-auto max-w-6xl space-y-10 px-5 py-10 sm:px-8 md:py-14">
      <header className="max-w-2xl space-y-4">
        <h1 className="text-5xl leading-tight">Ask the network</h1>
        <p className="text-lg leading-relaxed text-paper/80">
          Write a question, choose how many people it asks, and pay in $ZC. In Snowmoon, the more zipcoins you pay, the more
          people Silverchat polls. It works the same way here.
        </p>
      </header>
      <AskForm />
    </section>
  );
}
