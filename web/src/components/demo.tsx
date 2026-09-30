"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { rewards, tally } from "@/lib/algorithm";
import { AGES, REGIONS } from "@/lib/answer";
import { LIMITS, parseContent, type Content } from "@/lib/content";
import { EXAMPLE } from "@/lib/example";
import { people, usd } from "@/lib/format";
import { BREADTHS, SPLIT } from "@/lib/pricing";

import { Choice, Pill, Row } from "./ask-form";
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
  // ponytail: whole ZC, fine while a poll costs thousands of them; count in wei with decimals if ZC nears $1
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

  return (
    <div className="space-y-6">
      <p className="border border-silver/40 px-4 py-3 font-mono text-xs leading-relaxed text-silver">
        Demo. Nothing here is signed, sent or saved, and the other wallets are made up. The numbers use the real rules and
        today&apos;s price.
      </p>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-8">
          {stage === "ask" ? (
            <form
              className="space-y-9 bg-paper px-5 py-7 text-developer sm:px-9 sm:py-9"
              onSubmit={(e) => {
                e.preventDefault();
                ask();
              }}
            >
              <div className="space-y-3 border-b border-developer/25 pb-7">
                <label htmlFor="demo-q" className="font-mono text-xs uppercase tracking-[0.14em]">
                  Your question
                </label>
                <textarea
                  ref={field}
                  id="demo-q"
                  value={q}
                  maxLength={LIMITS.question}
                  rows={2}
                  onChange={(e) => setQ(e.target.value)}
                  className="w-full resize-none border-b border-developer/40 bg-transparent pb-2 text-2xl leading-snug outline-none focus:border-developer"
                />
                <ol className="space-y-2">
                  {options.map((o, k) => (
                    <li key={k} className="flex items-center gap-3">
                      <span aria-hidden className="grid size-7 shrink-0 place-items-center border border-developer/50 font-mono text-xs">
                        {"ABCD"[k]}
                      </span>
                      <input
                        aria-label={`Option ${"ABCD"[k]}`}
                        value={o}
                        maxLength={LIMITS.option}
                        onChange={(e) => setOptions((os) => os.map((x, j) => (j === k ? e.target.value : x)))}
                        className="min-w-0 flex-1 border-b border-developer/25 bg-transparent py-1 text-lg outline-none focus:border-developer"
                      />
                      {options.length > 2 && (
                        <button
                          type="button"
                          aria-label="Remove this option"
                          onClick={() => setOptions((os) => os.filter((_, j) => j !== k))}
                          className="grid size-7 place-items-center font-mono text-sm"
                        >
                          ×
                        </button>
                      )}
                    </li>
                  ))}
                </ol>
                {options.length < 4 && (
                  <button type="button" onClick={() => setOptions((os) => [...os, ""])} className="font-mono text-xs underline underline-offset-4">
                    Add an option
                  </button>
                )}
              </div>

              <Choice legend="Breadth" hint="How many people it asks">
                {BREADTHS.map((b) => (
                  <Pill key={b} name="breadth" checked={breadth === b} onChange={() => setBreadth(b)}>
                    {people(b)}
                  </Pill>
                ))}
              </Choice>

              <div className="space-y-3">
                <button type="submit" className="w-full bg-developer py-3 font-mono text-sm text-paper">
                  Ask {people(breadth)} people
                </button>
                {error && (
                  <p role="alert" className="font-mono text-xs leading-relaxed">
                    {error}
                  </p>
                )}
              </div>
            </form>
          ) : (
            content && (
              <header ref={head} tabIndex={-1} className="space-y-4 outline-none">
                <p className="font-mono text-xs uppercase tracking-[0.14em] text-silver">
                  Demo poll · {people(breadth)} people · {usd(Number(cost) / M)}
                </p>
                <h2 className="text-4xl leading-tight text-balance sm:text-5xl">{content.questions[0].q}</h2>
                <p className="font-mono text-sm text-paper/80">
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
              className="space-y-6 bg-paper px-5 py-7 text-developer sm:px-9 sm:py-9"
              onSubmit={(e) => {
                e.preventDefault();
                answer();
              }}
            >
              <fieldset className="space-y-3">
                <legend className="font-mono text-xs uppercase tracking-[0.14em]">Your answer</legend>
                {content.questions[0].options.map((o, k) => (
                  <label key={k} className="flex cursor-pointer items-center gap-3 border-b border-developer/15 py-2 text-lg">
                    <input type="radio" name="mine" checked={mine === k} onChange={() => setMine(k)} className="peer sr-only" />
                    <span
                      aria-hidden
                      className="grid size-7 shrink-0 place-items-center border border-developer/50 font-mono text-xs peer-checked:bg-developer peer-checked:text-paper peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:outline-offset-2"
                    >
                      {"ABCD"[k]}
                    </span>
                    {o}
                  </label>
                ))}
              </fieldset>
              <button type="submit" disabled={mine === null} className="w-full bg-developer py-3 font-mono text-sm text-paper disabled:cursor-not-allowed disabled:opacity-40">
                {mine === null ? "Pick an answer" : "Answer"}
              </button>
              <p className="font-mono text-xs leading-relaxed text-developer/70">
                For real, you sign your answer in your wallet. Signing is free and sends no transaction.
              </p>
            </form>
          )}

          {stage === "developing" && (
            <div className="space-y-4">
              <div className="h-2.5 bg-paper/10" aria-hidden>
                <div className="h-full bg-paper" style={{ width: `${(100 * shown) / breadth}%` }} />
              </div>
              <p className="max-w-xl text-lg leading-relaxed text-paper/85">
                {shown < answers.length
                  ? "Answers are coming in. Nobody sees the totals until the result is fixed, not even you, so nobody can follow the crowd."
                  : "The poll is closed. The result is being fixed."}
              </p>
              <p className="max-w-xl font-mono text-xs leading-relaxed text-silver">
                For real, your browser now keeps a receipt for your answer. Once the result is fixed, it lets you find your own
                answer in the public record, and nobody reading the record can tell which one is yours.
              </p>
            </div>
          )}

          {result && content && (
            <>
              <div className="develop" style={{ "--tau": "0.4s", animationDelay: "0s" } as CSSProperties}>
                <Print content={content} tally={result} note="Demo, not a record" />
              </div>
              <button type="button" onClick={() => setStage("ask")} className="font-mono text-sm text-paper underline underline-offset-4">
                Ask another
              </button>
            </>
          )}
        </div>

        <aside className="space-y-6 self-start bg-tray px-5 py-7 font-mono text-sm sm:px-7 lg:sticky lg:top-6">
          {stage === "fixed" ? (
            <>
              <p className="text-xs uppercase tracking-[0.14em] text-silver">Paid out</p>
              <dl className="space-y-2">
                <Row k="Each answer">{money("each")}</Row>
                <Row k="Answered">
                  {answers.length.toLocaleString("en-US")} of {people(breadth)}
                </Row>
              </dl>
              <dl className="space-y-2 border-t border-paper/15 pt-5 text-xs">
                <Row k="To answerers">{money("paid")}</Row>
                <Row k="Back to the asker">{money("back")}</Row>
                <Row k={`Treasury ${Number(SPLIT[1][1]) / 100}%`}>{money("treasury")}</Row>
                <Row k={`Burned ${Number(SPLIT[2][1]) / 100}%`}>{money("burned")}</Row>
              </dl>
              <p className="border-t border-paper/15 pt-5 leading-relaxed text-paper">You earned {money("each")} for one answer.</p>
              <p className="text-xs leading-relaxed text-silver">
                For real, you would claim it from the contract on Ethereum within 90 days.
              </p>
            </>
          ) : stage === "developing" ? (
            <>
              <p className="text-xs uppercase tracking-[0.14em] text-silver">Answers</p>
              <p className="text-4xl text-paper tabular-nums">{shown.toLocaleString("en-US")}</p>
              <ol className="space-y-1 text-xs text-silver" aria-hidden>
                {[0, 1, 2, 3].map((i) => shown - i).filter((n) => n > 1).map((n) => (
                  <li key={n}>Made-up wallet no. {n - 1} answered</li>
                ))}
                {shown - 4 <= 1 && <li>You answered</li>}
              </ol>
            </>
          ) : (
            <>
              <p className="text-xs uppercase tracking-[0.14em] text-silver">Receipt</p>
              <dl className="space-y-2">
                <Row k="Reach">{people(breadth)} people</Row>
                <Row k="Price">{usd(perPerson)} a person</Row>
                <Row k="Cost">{money("cost")}</Row>
              </dl>
              <dl className="space-y-2 border-t border-paper/15 pt-5 text-xs">
                <Row k={`Answerers ${Number(SPLIT[0][1]) / 100}%`}>{money("pool")}</Row>
                <Row k={`Treasury ${Number(SPLIT[1][1]) / 100}%`}>{money("treasury")}</Row>
                <Row k={`Burned ${Number(SPLIT[2][1]) / 100}%`}>{money("burned")}</Row>
              </dl>
              <p className="text-xs leading-relaxed text-silver">
                Each paid answer gets an equal share of the {Number(SPLIT[0][1]) / 100}%, up to as many answers as the poll paid
                for. What nobody earns goes back to the asker.
              </p>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
