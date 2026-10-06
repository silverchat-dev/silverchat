"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { rewards, tally } from "@/lib/algorithm";
import { AGES, REGIONS } from "@/lib/answer";
import { LIMITS, parseContent, type Content } from "@/lib/content";
import { EXAMPLE } from "@/lib/example";
import { people, usd } from "@/lib/format";
import { BREADTHS, SPLIT } from "@/lib/pricing";

import { OptionRow } from "./answer-panel";
import { Part, action, field as line, label, quiet, second } from "./journal";
import { useReducedMotion } from "./motion";
import { Print } from "./print";

type Stage = "ask" | "answer" | "developing" | "fixed";
type Made = { choices: number[]; region: string; age: string };

// money in the demo is counted in millionths of a dollar, with the contract's own integer math
const M = 1_000_000;
const RUN = 5000;
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

/** Made-up answers after yours: some polls fill up, some don't, and each option gets its own pull. */
function makeUp(content: Content, breadth: number, mine: number): Made[] {
  const n = Math.max(1, Math.round(breadth * (0.86 + Math.random() * 0.12)));
  const weights = content.questions[0].options.map(() => 0.3 + Math.random());
  const sum = weights.reduce((a, b) => a + b, 0);
  const choose = () => {
    let r = Math.random() * sum;
    return weights.findIndex((w) => (r -= w) < 0);
  };
  const said = (xs: string[]) => (Math.random() < 0.3 ? "" : pick(xs));
  return [
    { choices: [mine], region: "", age: "" },
    ...Array.from({ length: n - 1 }, () => ({ choices: [choose()], region: said(REGIONS), age: said(AGES) })),
  ];
}

/** Silverchat end to end in the browser: ask, answer, watch the count, see the result fixed and paid. */
export function Demo() {
  const still = useReducedMotion();
  const health = useQuery({
    queryKey: ["health"],
    queryFn: async () => (await (await fetch("/api/health")).json()) as { zcUsd: string | null; usdPerPerson?: number },
    staleTime: 60_000,
  });
  const perPerson = health.data?.usdPerPerson ?? 1;
  const zcUsd = Number(health.data?.zcUsd) || null;

  const [q, setQ] = useState(EXAMPLE.question);
  const [options, setOptions] = useState(EXAMPLE.options.map((o) => o.label));
  const [breadth, setBreadth] = useState(100);
  const [stage, setStage] = useState<Stage>("ask");
  const [content, setContent] = useState<Content | null>(null);
  const [mine, setMine] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Made[]>([]);
  const [shown, setShown] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const cost = BigInt(Math.round(perPerson * M)) * BigInt(breadth);
  // the cost goes into ZC once and both columns split it the way SilverAsk.finalize does, so each adds up.
  // whole ZC, fine while a poll costs thousands of them; count in wei with decimals if ZC nears $1
  const zcCost = zcUsd ? BigInt(Math.round(Number(cost) / M / zcUsd)) : null;
  const split = (c: bigint) => {
    const pool = (c * SPLIT[0][1]) / 10_000n;
    const treasury = (c * SPLIT[1][1]) / 10_000n;
    const paid = rewards(c, breadth, answers.length);
    return { cost: c, pool, treasury, burned: c - pool - treasury, each: paid.each, paid: paid.total, back: pool - paid.total };
  };
  const usdSplit = split(cost);
  const zcSplit = zcCost === null ? null : split(zcCost);
  const money = (k: keyof typeof usdSplit) => {
    const d = Number(usdSplit[k]) / M;
    const dollars = `$${d.toLocaleString("en-US", { minimumFractionDigits: d % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
    return zcSplit ? `${dollars} · ${zcSplit[k].toLocaleString("en-US")} ZC` : dollars;
  };

  // each step replaces what had focus: move it to the poll, or back to the question for another go
  const head = useRef<HTMLElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (stage !== "ask") head.current?.focus();
    else if (content) field.current?.focus();
  }, [stage, content]);

  // answers come in over a few seconds; the count is all anyone sees until the result is fixed
  useEffect(() => {
    if (stage !== "developing") return;
    const start = performance.now();
    let timer = 0;
    let raf = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - start) / RUN);
      setShown(Math.max(1, Math.round(answers.length * (1 - (1 - t) ** 2))));
      if (t < 1) raf = requestAnimationFrame(step);
      else timer = window.setTimeout(() => setStage("fixed"), 900);
    });
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [stage, answers.length]);

  function ask() {
    const c = parseContent({ v: 1, questions: [{ q, options }] });
    if (typeof c === "string") return setError(c[0].toUpperCase() + c.slice(1) + ".");
    setError(null);
    setContent(c);
    setMine(null);
    setStage("answer");
  }

  function answer() {
    if (!content || mine === null) return;
    const made = makeUp(content, breadth, mine);
    setAnswers(made);
    setShown(still ? made.length : 1);
    setStage(still ? "fixed" : "developing");
  }

  const result = stage === "fixed" && content ? tally(content.questions, answers) : null;

  const step = ["ask", "answer", "developing", "fixed"].indexOf(stage);

  return (
    <div className="space-y-10">
      <div className="space-y-4">
        <ol aria-label="The steps" className="grid grid-cols-4 gap-2">
          {["Ask", "Answer", "Count", "Paid"].map((name, i) => (
            <li key={name} aria-current={i === step ? "step" : undefined} className="space-y-2">
              <span aria-hidden className={`block h-0.5 rounded-full transition-colors duration-500 ${i <= step ? "bg-paper" : "bg-paper/15"}`} />
              <span className={`block font-mono text-[11px] tracking-[0.06em] ${i === step ? "text-paper" : "text-silver"}`}>
                <span className="tabular-nums">{i + 1}</span> · {name}
              </span>
            </li>
          ))}
        </ol>
        <p className="font-mono text-[11px] leading-relaxed text-silver">
          <span className="mr-2 rounded-full border border-silver/60 px-2 py-0.5 uppercase tracking-[0.12em]">Demo</span>
          Nothing here is signed, sent or saved, and the other wallets are made up. The numbers use the real rules and today&apos;s
          price.
        </p>
      </div>

      {stage === "ask" ? (
        <form
          className="space-y-9"
          onSubmit={(e) => {
            e.preventDefault();
            ask();
          }}
        >
          <div className="space-y-5">
            <label htmlFor="demo-q" className={`block ${label}`}>
              Your question
            </label>
            <textarea
              ref={field}
              id="demo-q"
              value={q}
              maxLength={LIMITS.question}
              rows={2}
              onChange={(e) => setQ(e.target.value)}
              className={`${line} resize-none field-sizing-content text-[1.6rem] leading-snug sm:text-[1.85rem]`}
            />
            <ol className="space-y-1">
              {options.map((o, k) => (
                <li key={k} className="flex items-center gap-3">
                  <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full border border-paper/45 font-mono text-[11px]">
                    {"ABCD"[k]}
                  </span>
                  <input
                    aria-label={`Option ${"ABCD"[k]}`}
                    value={o}
                    maxLength={LIMITS.option}
                    onChange={(e) => setOptions((os) => os.map((x, j) => (j === k ? e.target.value : x)))}
                    className={`${line} min-w-0 flex-1 border-paper/20`}
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      aria-label="Remove this option"
                      onClick={() => setOptions((os) => os.filter((_, j) => j !== k))}
                      className="grid size-11 shrink-0 place-items-center rounded-full font-mono text-base text-silver transition-colors hover:bg-paper/[0.05] hover:text-paper"
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ol>
            {options.length < 4 && (
              <button type="button" onClick={() => setOptions((os) => [...os, ""])} className={`${quiet} min-h-11 font-mono text-xs`}>
                + Add an option
              </button>
            )}
          </div>

          <fieldset className="space-y-3">
            <legend className={label}>
              Breadth <span className="normal-case tracking-normal">· how many people it asks</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {BREADTHS.map((b) => (
                <Pill key={b} name="breadth" checked={breadth === b} onChange={() => setBreadth(b)}>
                  {people(b)}
                </Pill>
              ))}
            </div>
          </fieldset>

          <div className="space-y-3">
            <button type="submit" className={`${action} w-full py-3.5 sm:w-auto sm:min-w-[16rem]`}>
              Ask {people(breadth)} people
            </button>
            {error && (
              <p role="alert" className="font-mono text-xs leading-relaxed text-paper">
                × {error}
              </p>
            )}
          </div>
        </form>
      ) : (
        content && (
          <header ref={head} tabIndex={-1} className="scroll-mt-36 space-y-4 outline-none">
            <p className={label}>
              Demo poll · {people(breadth)} people · {usd(Number(cost) / M)}
            </p>
            <h2 className="text-[clamp(1.95rem,4.4vw,2.85rem)] leading-[1.08] tracking-[-0.01em] text-balance">{content.questions[0].q}</h2>
            <p className="flex items-center gap-3 font-mono text-[12px] text-paper/85">
              <span aria-hidden className={`size-2 rounded-full ${stage === "answer" ? "bg-tap" : stage === "fixed" ? "bg-paper" : "border border-silver"}`} />
              {stage === "answer"
                ? "Open · you are the first to answer"
                : stage === "developing"
                  ? `${shown.toLocaleString("en-US")} of ${people(breadth)} answered`
                  : `Fixed · ${answers.length.toLocaleString("en-US")} answers`}
            </p>
          </header>
        )
      )}

      {stage === "answer" && content && (
        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            answer();
          }}
        >
          <fieldset className="space-y-3">
            <legend className={label}>Your answer</legend>
            <ul className="ruled">
              {content.questions[0].options.map((o, k) => (
                <li key={k}>
                  <OptionRow name="mine" k={k} checked={mine === k} onChange={() => setMine(k)}>
                    {o}
                  </OptionRow>
                </li>
              ))}
            </ul>
          </fieldset>
          <div className="space-y-3">
            <button type="submit" disabled={mine === null} className={`${action} w-full py-3.5 sm:w-auto sm:min-w-[16rem]`}>
              {mine === null ? "Pick an answer" : "Answer"}
            </button>
            <p className="font-mono text-[11px] leading-relaxed text-silver">
              For real, you sign your answer in your wallet. Signing is free and sends no transaction.
            </p>
          </div>
        </form>
      )}

      {stage === "developing" && (
        <div className="space-y-5">
          <div className="h-1.5 overflow-hidden rounded-full bg-paper/10" aria-hidden>
            <div className="h-full rounded-full bg-paper" style={{ width: `${(100 * shown) / breadth}%` }} />
          </div>
          <p className="max-w-[30em] text-xl leading-snug text-paper/85 italic">
            {shown < answers.length
              ? "Answers are coming in. Nobody sees the totals until the result is fixed, not even you, so nobody can follow the crowd."
              : "The poll is closed. The result is being fixed."}
          </p>
          <p className="max-w-[40em] font-mono text-[11px] leading-relaxed text-silver">
            For real, your browser now keeps a receipt for your answer. Once the result is fixed, it lets you find your own answer
            in the public record, and nobody reading the record can tell which one is yours.
          </p>
        </div>
      )}

      {result && content && (
        <div className="space-y-7">
          <div className="develop" style={{ "--tau": "0.4s", animationDelay: "0s" } as CSSProperties}>
            <Print content={content} tally={result} note="Demo, not a record" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/pulse" className={action}>
              Answer real questions →
            </Link>
            <button type="button" onClick={() => setStage("ask")} className={second}>
              Ask another
            </button>
          </div>
        </div>
      )}

      {stage === "fixed" ? (
        <Part title="Paid out">
          <dl className="grid grid-cols-2 gap-x-6">
            <Big k="Each answer">{money("each")}</Big>
            <Big k="Answered">
              {answers.length.toLocaleString("en-US")} of {people(breadth)}
            </Big>
          </dl>
          <dl className="font-mono text-[12px]">
            <Row k="To answerers">{money("paid")}</Row>
            <Row k="Back to the asker">{money("back")}</Row>
            <Row k={`Treasury ${Number(SPLIT[1][1]) / 100}%`}>{money("treasury")}</Row>
            <Row k={`Burned ${Number(SPLIT[2][1]) / 100}%`}>{money("burned")}</Row>
          </dl>
          <p className="text-xl leading-snug">You earned {money("each")} for one answer.</p>
          <p className="font-mono text-[11px] leading-relaxed text-silver">For real, you would claim it from the contract on Ethereum within 90 days.</p>
        </Part>
      ) : stage === "developing" ? (
        <Part title="Answers">
          <p className="text-[clamp(2.4rem,6vw,3.4rem)] leading-none tabular-nums">{shown.toLocaleString("en-US")}</p>
          <ol className="space-y-1 font-mono text-[11px] text-silver" aria-hidden>
            {[0, 1, 2, 3].map((i) => shown - i).filter((n) => n > 1).map((n) => (
              <li key={n}>Made-up wallet no. {n - 1} answered</li>
            ))}
            {shown - 4 <= 1 && <li>You answered</li>}
          </ol>
        </Part>
      ) : (
        <Part title="What it costs">
          <dl className="grid grid-cols-3 gap-x-4">
            <Big k="Reach" note="people">
              {people(breadth)}
            </Big>
            <Big k="Price" note="a person">
              {usd(perPerson)}
            </Big>
            <Big k="Cost" note={zcSplit ? `${zcSplit.cost.toLocaleString("en-US")} ZC` : undefined}>
              {usd(Number(cost) / M)}
            </Big>
          </dl>
          <dl className="font-mono text-[12px]">
            <Row k={`Answerers ${Number(SPLIT[0][1]) / 100}%`}>{money("pool")}</Row>
            <Row k={`Treasury ${Number(SPLIT[1][1]) / 100}%`}>{money("treasury")}</Row>
            <Row k={`Burned ${Number(SPLIT[2][1]) / 100}%`}>{money("burned")}</Row>
          </dl>
          <p className="font-mono text-[11px] leading-relaxed text-silver">
            Each paid answer gets an equal share of the {Number(SPLIT[0][1]) / 100}%,
            up to as many answers as the poll paid for. What nobody earns goes back to the asker.
          </p>
        </Part>
      )}
    </div>
  );
}

/** One line of a ledger: what, a dotted leader, how much. */
function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-dashed border-paper/15 py-2.5 last:border-0">
      <dt className="text-silver">{k}</dt>
      <dd className="ml-auto text-right text-paper tabular-nums">{children}</dd>
    </div>
  );
}

/** A figure in the ledger: a small label over the number. */
function Big({ k, note, children }: { k: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5 border-l border-paper/20 pl-3 sm:pl-4">
      <dt className={label}>{k}</dt>
      <dd className="text-[clamp(1.35rem,3.4vw,2rem)] leading-tight tabular-nums">{children}</dd>
      {note && <dd className="font-mono text-[11px] text-silver">{note}</dd>}
    </div>
  );
}

/** A choice among a few: a word in a ring, filled with ink when chosen. */
function Pill({ name, checked, onChange, children }: { name: string; checked: boolean; onChange: () => void; children: React.ReactNode }) {
  return (
    <label className="cursor-pointer">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="peer sr-only" />
      <span className="flex min-h-11 min-w-14 items-center justify-center rounded-full border border-paper/35 px-4 font-mono text-[13px] tabular-nums transition-colors hover:border-paper peer-checked:border-paper peer-checked:bg-paper peer-checked:text-developer peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2">
        {children}
      </span>
    </label>
  );
}
