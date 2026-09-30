import { WORDMARK } from "@/lib/wordmark";

export default function Home() {
  return (
    <section className="flex flex-col gap-10 px-5 py-12 sm:px-8">
      <h1 className="sr-only">silverchat</h1>
      <div className="@container">
        <pre aria-hidden className="font-mono text-[calc(100cqw/56)] leading-[1.05] text-paper">
          {WORDMARK}
        </pre>
      </div>
      <div className="max-w-xl space-y-5">
        <p className="text-4xl leading-tight">
          Ask the network.
          <br />
          Watch the answer develop.
        </p>
        <p className="text-lg text-paper/80">The polling network from Snowmoon, ch. 27. Now on Ethereum.</p>
      </div>
    </section>
  );
}
