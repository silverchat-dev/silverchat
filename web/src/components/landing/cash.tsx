import Link from "next/link";

// a private balance, frame by frame, like the strip in the SilverRealm section
const FRAMES = [
  ["Deposit", "your coins", "$SC, $ZC or ETH from your wallet into Railgun. The deposit is public; what follows is not tied to it."],
  ["Shield", "your browser", "A private balance under its own 12 words. The keys never leave your browser, never reach us."],
  ["Swap", "inside", "SC, ZC and ETH trade inside the private pool, through the same pools as the rest of Silverchat."],
  ["Withdraw", "a fresh wallet", "Out to any address, gas paid from your private balance by a Railgun broadcaster."],
];

/** SilverCash on the landing: private money for the ecosystem, on Railgun. */
export function Cash() {
  return (
    <section aria-labelledby="cash-title" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 md:py-28">
      <div className="space-y-4">
        <h2 id="cash-title" className="max-w-3xl text-[clamp(2rem,4.2vw,3.5rem)] leading-[1.05]">
          Deposit. Shield. Swap. Withdraw.
        </h2>
        <p className="max-w-2xl text-lg leading-relaxed text-paper/75">
          SilverCash is private money for the Silverchat ecosystem. If you withdraw $SC and swap it in public, anyone can follow
          the trail; here the swap happens inside the private pool, before anything comes out.
        </p>
      </div>
      <ol className="mt-12 grid gap-px bg-film p-px sm:grid-cols-2 lg:grid-cols-4">
        {FRAMES.map(([k, big, v], i) => (
          <li key={k} className="develop on-view flex min-h-40 flex-col justify-between gap-6 bg-developer p-5 sm:min-h-56" style={{ "--tau": "1.4s", "--from": `${4 + i * 6}%`, "--to": `${24 + i * 6}%` } as React.CSSProperties}>
            <span className="flex justify-between font-mono text-[11px] uppercase tracking-[0.2em] text-silver">
              <span>{k}</span>
              <span aria-hidden>{i + 1}B</span>
            </span>
            <span className="space-y-3">
              <span className="block text-[clamp(1.5rem,2.6vw,2.25rem)] leading-none">{big}</span>
              <span className="block text-sm leading-snug text-paper/75">{v}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-6 max-w-3xl text-sm leading-relaxed text-paper/70">
        It runs on Railgun, a privacy protocol on Ethereum that we do not run, which screens deposits against lists of stolen and
        sanctioned funds. SilverCash takes no fee; Railgun keeps 0.25% going in and 0.25% coming out. A swap shows its coins
        and amounts, not who made it.
      </p>
      <div className="mt-10">
        <Link href="/cash" className="bg-paper px-6 py-3 font-mono text-sm text-developer hover:brightness-105">
          Open SilverCash
        </Link>
      </div>
    </section>
  );
}
