import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Not found · silverchat" };

export default function NotFound() {
  return (
    <section className="mx-auto flex min-h-[60vh] max-w-6xl flex-col justify-center gap-6 px-5 py-20 sm:px-8">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-silver">404</p>
      <h1 className="max-w-2xl text-[clamp(2.5rem,6vw,5rem)] leading-[1.02]">Nothing developed here.</h1>
      <p className="max-w-md text-lg leading-relaxed text-paper/75">This page doesn&apos;t exist, or the poll you followed was never asked.</p>
      <p className="flex flex-wrap gap-x-8 gap-y-3 font-mono text-sm">
        <Link href="/pulse" className="text-paper underline-offset-4 hover:underline">
          Open polls →
        </Link>
        <Link href="/records" className="text-paper underline-offset-4 hover:underline">
          Records →
        </Link>
        <Link href="/" className="text-silver underline-offset-4 hover:text-paper hover:underline">
          Home
        </Link>
      </p>
    </section>
  );
}
