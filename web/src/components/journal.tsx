/**
 * The parts every page in Meldan is made of. A stop's page is a page of a field journal laid over the world: a head
 * with the stop's number and plain label, figures set like a ledger, ruled lists, underlined tabs, and one green
 * action (the colour of the circle on the ground). Pages use these and the class names below, never their own
 * versions, so the whole site reads as one book.
 */
import Link from "next/link";
import type { ReactNode } from "react";

import { STOPS, stopIndex } from "@/world/stops";

/** The one thing to do on a view: filled with the circle's green. One per view, never two. */
export const action =
  "inline-flex items-center justify-center gap-2 rounded-full bg-tap px-5 py-2.5 font-mono text-[13px] tracking-[0.04em] text-on-tap transition-[filter,transform] duration-200 hover:brightness-110 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45";
/** A second way on: ink outline. */
export const second =
  "inline-flex items-center justify-center gap-2 rounded-full border border-paper/35 px-5 py-2.5 font-mono text-[13px] tracking-[0.04em] text-paper transition-colors duration-200 hover:border-paper disabled:cursor-not-allowed disabled:opacity-45";
/** A link in running text or under a figure. */
export const quiet = "underline decoration-paper/30 underline-offset-4 transition-colors hover:decoration-paper";
/** The small mono label over a figure, a field or a section. */
export const label = "font-mono text-[11px] uppercase tracking-[0.16em] text-silver";
/** A field the visitor types into: a line on the page, not a box. */
export const field =
  "w-full border-0 border-b border-paper/30 bg-transparent px-0 py-2 text-lg text-paper placeholder:text-silver/70 focus:border-paper focus:outline-none focus:ring-0";
/** A note pinned in the page: a card for one thing (a poll, a market, a token). */
export const note = "rounded-lg border border-paper/15 bg-[#fbf6ea]/70 p-5 transition-colors duration-200 hover:border-paper/40";

/** The head of a stop's page: its number on the walk, its name, the plain label as the title, and what it is. */
export function PageHead({ stop, title, children, art, aside }: { stop: string; title?: string; children?: ReactNode; art?: ReactNode; aside?: ReactNode }) {
  const s = STOPS[stopIndex(stop)];
  return (
    <header className="relative space-y-5">
      {art && (
        <div aria-hidden className="pointer-events-none absolute -top-1 right-0 w-20 text-paper/70 sm:w-32">
          {art}
        </div>
      )}
      <p className={label}>
        No. {String(stopIndex(stop) + 1).padStart(2, "0")} · {s.name}
      </p>
      <h1 className={`max-w-[14em] ${art ? "pr-20 sm:pr-36" : ""} text-[clamp(2.3rem,5.2vw,3.5rem)] leading-[1.03] tracking-[-0.012em] text-balance wrap-anywhere`}>{title ?? s.label}</h1>
      <div className="max-w-[34em] text-[1.075rem] leading-relaxed text-paper/80 text-pretty">{children ?? s.line}</div>
      {aside && <div className="flex flex-wrap items-center gap-3 pt-1">{aside}</div>}
    </header>
  );
}

/** A part of a page under a small ruled heading. */
export function Part({ title, more, children, id }: { title: string; more?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id} className="space-y-5 border-t border-paper/20 pt-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id={id} className={label}>
          {title}
        </h2>
        {more && <div className="font-mono text-xs">{more}</div>}
      </div>
      {children}
    </section>
  );
}

/** Figures set like a ledger: a label, the number large, and a short note under it. */
export function Figures({ items, columns = 3 }: { items: { label: string; value: ReactNode; note?: ReactNode }[]; columns?: 2 | 3 | 4 }) {
  // up to `columns` across, as many as fit: a long number takes a row of its own rather than running into the next one
  const cols = { 2: "minmax(12rem,1fr)", 3: "minmax(9rem,1fr)", 4: "minmax(7.5rem,1fr)" }[columns];
  return (
    <dl className="grid gap-x-6 gap-y-6" style={{ gridTemplateColumns: `repeat(auto-fit, ${cols})` }}>
      {items.map((f) => (
        <div key={f.label} className="space-y-1.5 border-l border-paper/20 pl-4">
          <dt className={label}>{f.label}</dt>
          <dd className="text-[clamp(1.6rem,3.4vw,2.2rem)] leading-none tabular-nums wrap-anywhere">{f.value}</dd>
          {f.note && <dd className="font-mono text-[11px] text-silver">{f.note}</dd>}
        </div>
      ))}
    </dl>
  );
}

/** Tabs and filters: words underlined, the chosen one in ink. Links, so each view has its own address. */
export function Tabs({ items, label: name }: { items: { href: string; label: string; active: boolean }[]; label: string }) {
  return (
    <nav aria-label={name} className="-mx-1 flex flex-wrap gap-x-1 gap-y-1">
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          scroll={false}
          aria-current={t.active ? "page" : undefined}
          className="inline-flex min-h-11 items-center rounded-full px-3 py-1.5 font-mono text-[12px] tracking-[0.04em] text-silver transition-colors hover:text-paper aria-[current=page]:bg-paper aria-[current=page]:text-developer sm:min-h-0"
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/** Nothing here yet: one line in the book's voice and the way to change that. */
export function Empty({ children, then }: { children: ReactNode; then?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-5 rounded-lg border border-dashed border-paper/30 px-6 py-10">
      <p className="max-w-[26em] text-xl leading-snug italic text-paper/85">{children}</p>
      {then}
    </div>
  );
}

/** The width and rhythm of a page inside the panel. */
export function Page({ children }: { children: ReactNode }) {
  return <div className="space-y-10 px-5 pt-8 pb-14 sm:px-9 sm:pt-10">{children}</div>;
}
