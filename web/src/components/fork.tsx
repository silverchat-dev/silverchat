/**
 * The parts the two pages at the tunnel's fork share: Cash on the left way, Zinc on the right. Both pages are built
 * the same way (the head, the numbered steps, what stays private, the notes in full, the other way at the fork), so a
 * visitor who has walked one knows the other.
 */
import Link from "next/link";
import type { ReactNode } from "react";

import { Part, label, quiet } from "@/components/journal";
import { STOPS, stopIndex } from "@/world/stops";

export type Side = "cash" | "zinc";

const WAYS: Record<Side, { way: string; name: string; title: string; href: string; line: string }> = {
  cash: {
    way: "Left",
    name: "SilverCash",
    title: "Hold coins privately",
    href: "/cash",
    line: "Holding $SC, $ZC or ETH? SilverCash keeps them in a private balance on Railgun: deposit, swap inside it, withdraw to a fresh wallet.",
  },
  zinc: {
    way: "Right",
    name: "Zinc",
    title: "Pay for AI privately",
    href: "/zinc",
    line: "Holding ZEC? Zinc turns shielded ZEC into a private zkAPI balance for AI models, and back.",
  },
};
const other = (s: Side): Side => (s === "cash" ? "zinc" : "cash");

/** A choice of a few: pills, the chosen one in ink. Buttons with aria-pressed, tall enough for a thumb. */
export const pill =
  "inline-flex min-h-11 items-center rounded-full border border-paper/25 px-3.5 font-mono text-xs text-paper transition-colors hover:border-paper aria-pressed:border-paper aria-pressed:bg-paper aria-pressed:text-developer disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-paper/25 sm:min-h-9";
/** A small text button beside an action (cancel, show, lock). */
export const small =
  "inline-flex min-h-11 items-center font-mono text-xs text-silver underline decoration-silver/40 underline-offset-4 transition-colors hover:text-paper hover:decoration-paper disabled:opacity-40 sm:min-h-0";
/** A line the page says back: a status, a result, an error. */
export const said = "border-l-2 border-paper/40 pl-3 font-mono text-xs leading-relaxed text-paper break-words";
/** The warnings that cost money if missed: set apart with a heavy rule. */
export const warn = "border-l-[3px] border-paper pl-4 text-[0.95rem] leading-relaxed text-paper";

/** The head of a page at the fork: the stop, which way this is, the title, and the way back to the other side. */
export function ForkHead({ side, otherLive, children }: { side: Side; otherLive: boolean; children: ReactNode }) {
  const n = stopIndex("fork");
  const w = WAYS[side];
  const o = WAYS[other(side)];
  return (
    <header className="relative space-y-5">
      <div aria-hidden className="pointer-events-none absolute -top-1 right-0 w-20 text-paper/70 sm:w-28">
        <ForkArt side={side} />
      </div>
      <p className={`${label} pr-24 sm:pr-32`}>
        No. {String(n + 1).padStart(2, "0")} · {STOPS[n].label} · {w.way}, {w.name}
      </p>
      <h1 className="max-w-[14em] pr-20 text-[clamp(2.3rem,5.2vw,3.5rem)] leading-[1.03] tracking-[-0.012em] text-balance sm:pr-32">{w.title}</h1>
      <div className="max-w-[34em] space-y-3 text-[1.075rem] leading-relaxed text-paper/80 text-pretty">{children}</div>
      {otherLive && (
        <p className="font-mono text-xs text-silver">
          {side === "zinc" && "← "}
          <Link href={o.href} className={`${quiet} hover:text-paper`}>
            The other way at the fork: {o.title}
          </Link>
          {side === "cash" && " →"}
        </p>
      )}
    </header>
  );
}

/** The fork in the tunnel, in ink: two mouths, the poster taped between them, the way taken in green. */
function ForkArt({ side }: { side: Side }) {
  const left = side === "cash";
  const tap = { stroke: "var(--color-tap)" };
  return (
    <svg viewBox="0 0 120 120" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 114 V58 C8 28 30 8 60 8 C90 8 112 28 112 58 V114" />
      <path d="M22 84 V60 C22 48 29 41 37 41 C45 41 52 48 52 60 V84" />
      <path d="M68 84 V60 C68 48 75 41 83 41 C91 41 98 48 98 60 V84" />
      <path d="M8 114 L22 84 M112 114 L98 84 M52 84 L68 84" strokeWidth="0.9" opacity="0.6" />
      <rect x="55.5" y="50" width="9" height="12" strokeWidth="0.9" />
      <path d="M54 49 l3 2 M66 49 l-3 2" strokeWidth="0.8" opacity="0.7" />
      <path d="M58 54 h4 M58 57 h3" strokeWidth="0.6" opacity="0.6" />
      <path d="M60 112 V100" strokeWidth="1.1" opacity="0.7" />
      <path d="M60 100 C60 92 46 92 38 86" {...(left ? tap : { opacity: 0.45 })} strokeWidth={left ? 1.6 : 1.1} />
      <path d="M60 100 C60 92 74 92 82 86" {...(!left ? tap : { opacity: 0.45 })} strokeWidth={!left ? 1.6 : 1.1} />
      {left ? <path d="M38 86 l6 0.5 M38 86 l2.5 -5" {...tap} strokeWidth="1.6" /> : <path d="M82 86 l-6 0.5 M82 86 l-2.5 -5" {...tap} strokeWidth="1.6" />}
    </svg>
  );
}

/** What this way hides and what it does not, said plainly, before the long notes. */
export function Seen({ hidden, shown }: { hidden: ReactNode[]; shown: ReactNode[] }) {
  const col = (title: string, items: ReactNode[], mark: string) => (
    <div className="space-y-3">
      <h3 className={label}>{title}</h3>
      <ul className="ruled">
        {items.map((t, i) => (
          <li key={i} className="grid grid-cols-[1.1rem_minmax(0,1fr)] gap-x-2 py-2.5 leading-snug">
            <span aria-hidden className="font-mono text-sm text-silver">
              {mark}
            </span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <Part title="What stays private, and what does not">
      <div className="grid gap-8 sm:grid-cols-2 sm:gap-6">
        {col("Stays private", hidden, "○")}
        {col("Can be seen", shown, "●")}
      </div>
    </Part>
  );
}

/** The notes in full, numbered so a visitor can say which one they mean. */
export function Notes({ title, notes }: { title: string; notes: string[] }) {
  return (
    <Part title={title}>
      <ol className="ruled">
        {notes.map((t, i) => (
          <li key={t} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 py-3.5 text-[0.98rem] leading-relaxed text-paper/85">
            <span className="pt-0.5 font-mono text-xs text-silver tabular-nums">{String(i + 1).padStart(2, "0")}</span>
            <span>{t}</span>
          </li>
        ))}
      </ol>
    </Part>
  );
}

/** The contracts and services behind a way, as a ledger of links to check them. */
export function Checks({ rows }: { rows: { name: string; href: string; text: string }[] }) {
  return (
    <Part title="Check it yourself">
      <dl className="ruled grid">
        {rows.map((r) => (
          <div key={r.name} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
            <dt className="text-paper/85">{r.name}</dt>
            <dd className="font-mono text-xs">
              <a href={r.href} target="_blank" rel="noreferrer" className={quiet}>
                {r.text}
              </a>
            </dd>
          </div>
        ))}
      </dl>
    </Part>
  );
}

/** The other way at the fork, when it is open. */
export function OtherWay({ side, live }: { side: Side; live: boolean }) {
  if (!live) return null;
  const o = WAYS[other(side)];
  return (
    <Part title="The other way at the fork">
      <Link href={o.href} className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 rounded-lg py-1 transition-colors">
        <span className="space-y-1.5">
          <span className={`${label} block`}>
            {o.way}, {o.name}
          </span>
          <span className="block text-[1.5rem] leading-tight">{o.title}</span>
          <span className="block max-w-[32em] leading-relaxed text-paper/75">{o.line}</span>
        </span>
        <span aria-hidden className="font-mono text-xl text-silver transition-transform group-hover:translate-x-1 group-hover:text-paper motion-reduce:transition-none">
          {side === "cash" ? "→" : "←"}
        </span>
      </Link>
    </Part>
  );
}

export type Step = { name: string };

/**
 * The way through, as numbered steps: the ones done, the one you are at (in green), the ones after. A step is a
 * button when the visitor may pick it, a link when it is further down the page, plain text otherwise.
 */
export function Rail({ steps, at, done, next, pick, anchor }: { steps: Step[]; at: number; done: number; next?: ReactNode; pick?: (i: number) => void; anchor?: string }) {
  return (
    <div className="space-y-4">
      <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((s, i) => {
          const now = i === at;
          const past = i < done && !now;
          const body = (
            <>
              <span
                aria-hidden
                className={`flex size-8 items-center justify-center rounded-full border font-mono text-xs tabular-nums transition-colors ${
                  now ? "border-tap bg-tap text-developer" : past ? "border-paper bg-paper text-developer" : "border-paper/35 text-silver"
                }`}
              >
                {past ? "✓" : i + 1}
              </span>
              <span className={`block font-mono text-[11px] leading-tight tracking-[0.04em] ${now ? "text-paper" : "text-silver"}`}>{s.name}</span>
              <span className="sr-only">{now ? ", you are here" : past ? ", done" : ""}</span>
            </>
          );
          const box = "flex min-h-11 w-full flex-col items-start gap-1.5 text-left";
          return (
            <li key={s.name} className="relative">
              {i < steps.length - 1 && <span aria-hidden className={`absolute top-4 left-9 -right-1 h-px ${i < done ? "bg-paper/60" : "bg-paper/20"}`} />}
              {pick && i >= done ? (
                <button type="button" aria-current={now ? "step" : undefined} onClick={() => pick(i)} className={`${box} group`}>
                  {body}
                </button>
              ) : anchor ? (
                <a href={`#${anchor}-${i + 1}`} aria-current={now ? "step" : undefined} className={box}>
                  {body}
                </a>
              ) : (
                <span aria-current={now ? "step" : undefined} className={box}>
                  {body}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="text-[0.95rem] leading-snug text-paper/80">
        <span className={`${label} mr-2`}>Now</span>
        {steps[at].name}.{next && <> {next}</>}
      </p>
    </div>
  );
}

/** One numbered step: its number (green while it is the one to do), its name, and what to do in it. */
export function StepPart({ n, of, title, state, id, children }: { n: number; of: number; title: string; state: "done" | "now" | "later"; id?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={id && `${id}-h`} className="scroll-mt-6 space-y-5 border-t border-paper/20 pt-6">
      <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-x-3">
        <span
          aria-hidden
          className={`flex size-11 items-center justify-center rounded-full border text-xl tabular-nums ${
            state === "now" ? "border-tap bg-tap text-developer" : state === "done" ? "border-paper bg-paper text-developer" : "border-paper/35 text-silver"
          }`}
        >
          {state === "done" ? "✓" : n}
        </span>
        <div>
          <p className={label}>
            Step {n} of {of}
            {state === "now" ? " · you are here" : state === "done" ? " · done" : ""}
          </p>
          <h2 id={id && `${id}-h`} className="text-[1.6rem] leading-tight">
            {title}
          </h2>
        </div>
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}
