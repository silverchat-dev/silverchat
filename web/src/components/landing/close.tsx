import Link from "next/link";

/** The last word: ask, or answer. */
export function Close() {
  return (
    <section aria-labelledby="close-title" className="relative overflow-hidden border-t border-silver/15">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 md:py-36">
        <h2 id="close-title" className="text-[clamp(3rem,10vw,9rem)] leading-[0.92]">
          Ask the network.
        </h2>
        <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
          <Link href="/ask" className="bg-safelight px-6 py-3 font-mono text-sm text-developer hover:brightness-110">
            Launch app
          </Link>
          <Link href="/pulse" className="font-mono text-sm text-paper underline-offset-4 hover:underline">
            Or answer a poll and earn →
          </Link>
        </div>
      </div>
    </section>
  );
}
