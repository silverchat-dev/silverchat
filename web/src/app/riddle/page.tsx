import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Figures, Page, PageHead, Part, label, quiet } from "@/components/journal";
import { SolvePanel } from "@/components/riddle";
import { ADDR, EXPLORER, GITHUB_URL, ZERO } from "@/lib/config";
import { short, tokens } from "@/lib/format";
import { SOLVED, live, read, type Riddle } from "@/lib/server/riddle";

export const dynamic = "force-dynamic";
// static metadata would ship even with the 404, so it is built only once the riddle is live
export const generateMetadata = (): Metadata =>
  ADDR.riddle === ZERO ? {} : { title: "The riddle · silverchat", description: "One riddle on Silverchat, with a prize in $SC for the first who solves it." };

// "13 Oct", the large part of a date in the figures; the year and time go under it
const dayOf = (ts: number) => new Date(ts * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const utc = (ts: number) => `${new Date(ts * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`;

export default async function RiddlePage() {
  // nothing shows until SilverRiddle is deployed: the seven days start then, not when this page ships
  if (ADDR.riddle === ZERO) notFound();
  // the live riddle's own text; a contract with no text set is one of the solved ones
  const solvedHere = SOLVED.find((e) => e.address.toLowerCase() === ADDR.riddle.toLowerCase());
  const RIDDLE: Riddle = live() ?? solvedHere ?? { title: "The riddle", text: [] };
  const before = SOLVED.filter((e) => e !== solvedHere);
  const r = await read().catch(() => "unread" as const);
  const ready = r && r !== "unread" ? r : null;
  // open for answers only once funded; a solved or closed riddle reads as such whatever its balance
  const opens = !ready || (!ready.solved && !ready.closed && ready.prize === 0n);

  // when it is open the prize is set large under the title, so the heading only says it is open
  const status = !ready ? "The riddle" : ready.solved ? "Solved · the prize is paid" : ready.closed ? "Closed" : opens ? "Opens soon" : "Open now · the prize";

  return (
    <Page>
      <PageHead stop="riddle" art={<DoorArt />}>
        A riddle with a prize in $SC. Find the answer, seal it on Ethereum, and reveal it ten blocks later. The first right
        reveal takes the whole prize.
      </PageHead>

      <Part title={status} id="riddle-now">
        <article className="space-y-6">
          <h3 className="text-[clamp(1.9rem,4.4vw,2.6rem)] leading-[1.08] tracking-[-0.01em] text-balance">{RIDDLE.title}</h3>
          {ready && !opens && !ready.solved && !ready.closed && (
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-[clamp(1.7rem,4vw,2.2rem)] leading-none tabular-nums">{tokens(ready.prize, 0)} $SC</span>
              <span className="font-mono text-[11px] text-silver">to the first right reveal</span>
            </p>
          )}
          {RIDDLE.text.length > 0 && (
            <div className="max-w-[34em] space-y-4 text-[1.25rem] leading-[1.55] text-pretty first-letter:float-left first-letter:mr-2 first-letter:text-[3.4rem] first-letter:leading-[0.9]">
              {RIDDLE.text.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          )}
          {RIDDLE.lock && <Lock lock={RIDDLE.lock} />}
          <p className="font-mono text-[13px] leading-relaxed text-paper/80">
            The source remembers.{" "}
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className={`break-words ${quiet}`}>
              github.com/silverchat-dev/silverchat
            </a>
          </p>
        </article>

        {r === "unread" ? (
          <p className="text-xl leading-snug italic text-paper/85">Ethereum did not answer. Reload the page.</p>
        ) : !ready || opens ? (
          <p className="text-xl leading-snug italic text-paper/85">The riddle opens soon.</p>
        ) : ready.solved ? (
          <p className="text-2xl leading-snug">
            Solved by{" "}
            <a href={`${EXPLORER}/address/${ready.winner}`} target="_blank" rel="noreferrer" className={`font-mono text-xl ${quiet}`}>
              {short(ready.winner)}
            </a>
            .
          </p>
        ) : ready.closed ? (
          <p className="text-2xl leading-snug">Closed. Nobody solved it in time.</p>
        ) : null}
      </Part>

      {ready && !ready.solved && !ready.closed && !opens && <SolvePanel answerHashOnChain={ready.answerHash} />}

      <Part title="How it works">
        <ol className="space-y-5">
          {[
            ["Find the answer", "Try it as often as you like; the check runs in your browser."],
            ["Seal it", "One transaction that hides your answer and ties it to your wallet."],
            ["Reveal it", "Ten blocks later. The first right reveal takes the whole prize."],
          ].map(([k, v], i) => (
            <li key={k} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3">
              <span className="pt-1 font-mono text-xs text-silver tabular-nums">{String(i + 1).padStart(2, "0")}</span>
              <span className="space-y-0.5">
                <span className="block text-[1.2rem] leading-snug">{k}</span>
                <span className="block leading-relaxed text-paper/75">{v}</span>
              </span>
            </li>
          ))}
        </ol>
        {ready && (
          <div className="space-y-5 pt-2">
            <Figures
              columns={2}
              items={[
                { label: "Reclaim from", value: dayOf(ready.deadline), note: `${utc(ready.deadline).slice(0, 4)} · ${utc(ready.deadline).slice(11)}` },
                { label: "Answer hash", value: <span className="font-mono text-[1.1rem]">{short(ready.answerHash)}</span>, note: "keccak256 of the answer" },
              ]}
            />
            <p className="font-mono text-xs text-silver">
              Contract{" "}
              <a href={`${EXPLORER}/address/${ADDR.riddle}`} target="_blank" rel="noreferrer" className={`text-paper/85 ${quiet}`}>
                {short(ADDR.riddle)}
              </a>
            </p>
          </div>
        )}
        <p className="max-w-[34em] text-sm leading-relaxed text-paper/75">After day seven the Safe may take the prize back. Until it does, a right reveal still wins.</p>
      </Part>

      {before.length > 0 && (
        <Part title="On the wall by the door" id="solved-before">
          <ol className="space-y-6">
            {before.map((e) => (
              <Inscription key={e.address} e={e} n={SOLVED.length - SOLVED.indexOf(e)} />
            ))}
          </ol>
        </Part>
      )}
    </Page>
  );
}

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

/** A solved riddle cut into the wall: its number, its name, its text, and who took the prize with which reveal. */
function Inscription({ e, n }: { e: (typeof SOLVED)[number]; n: number }) {
  return (
    <li className="rounded-sm border border-paper/25 bg-tray/55 p-1.5">
      <article className="space-y-5 border border-paper/15 px-5 py-7 sm:px-8 sm:py-9">
        <header className="space-y-2 text-center">
          <p className={label}>Riddle {ROMAN[n] ?? n} · solved</p>
          <h3 className="text-[1.6rem] leading-tight uppercase tracking-[0.12em] sm:text-[1.8rem]">{e.title}</h3>
          <Rule />
        </header>
        <div className="space-y-3 text-[1.05rem] leading-[1.6] text-paper/80 italic text-pretty">
          {e.text.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
        <Rule />
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
          <div className="space-y-1">
            <dt className={label}>Prize</dt>
            <dd className="text-[1.35rem] leading-none tabular-nums">{e.prize} $SC</dd>
          </div>
          <div className="space-y-1">
            <dt className={label}>Taken by</dt>
            <dd>
              <a href={`${EXPLORER}/address/${e.winner}`} target="_blank" rel="noreferrer" className={`font-mono text-sm ${quiet}`}>
                {short(e.winner)}
              </a>
            </dd>
          </div>
          <div className="col-span-2 space-y-1">
            <dt className={label}>Solved</dt>
            <dd className="tabular-nums">{e.solved}</dd>
          </div>
        </dl>
        <p className="flex flex-wrap gap-x-5 gap-y-2 font-mono text-xs">
          <a href={`${EXPLORER}/tx/${e.reveal}`} target="_blank" rel="noreferrer" className={quiet}>
            The winning reveal
          </a>
          <a href={`${EXPLORER}/address/${e.address}`} target="_blank" rel="noreferrer" className={quiet}>
            Contract {short(e.address)}
          </a>
        </p>
      </article>
    </li>
  );
}

/** A short cut line with a diamond in it, as on a carved plaque. */
function Rule() {
  return (
    <svg aria-hidden viewBox="0 0 120 8" className="mx-auto block h-2 w-28 text-paper/40" fill="none" stroke="currentColor" strokeWidth="1">
      <path d="M4 4 H52 M68 4 H116" />
      <path d="M60 0.8 L63.2 4 L60 7.2 L56.8 4 Z" />
    </svg>
  );
}

/** The sealed door in the side of the pyramid, in ink: stone courses, an arched door, and the green seal that opens it. */
function DoorArt() {
  return (
    <svg viewBox="0 0 120 120" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 112 L60 10 L114 112 Z" />
      <g strokeWidth="0.8" opacity="0.55">
        <path d="M33 62 H87 M24 79 H96 M15 96 H105 M43 44 H77" />
        <path d="M50 44 V62 M70 44 V62 M38 62 V79 M82 62 V79 M28 79 V96 M92 79 V96 M20 96 V112 M100 96 V112" />
      </g>
      <path d="M46 112 V88 A14 14 0 0 1 74 88 V112" fill="var(--color-developer)" />
      <path d="M50 112 V89 A10 10 0 0 1 70 89 V112" strokeWidth="0.8" opacity="0.7" />
      <path d="M60 79 V112" strokeWidth="0.8" opacity="0.7" />
      <circle cx="60" cy="97" r="4.2" fill="var(--color-tap)" stroke="var(--color-tap)" />
      <path d="M38 116 H82" strokeWidth="0.9" opacity="0.6" />
    </svg>
  );
}

/** Numbers a riddle hands over whole, with the rule for working them, each row as it was set. */
function Lock({ lock }: { lock: NonNullable<Riddle["lock"]> }) {
  return (
    <div className="space-y-4 border-y border-paper/20 py-5 font-mono text-xs leading-relaxed text-paper/85">
      <dl className="space-y-3">
        {lock.rows.map(([k, v]) => (
          <div key={k} className="grid gap-1 sm:grid-cols-[5rem_minmax(0,1fr)]">
            <dt className="text-silver">{k}</dt>
            <dd className="break-all">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-paper/75">{lock.rule}</p>
    </div>
  );
}
