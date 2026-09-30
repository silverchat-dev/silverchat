"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BaseError, ContractFunctionRevertedError, erc20Abi, formatUnits, parseEventLogs, UserRejectedRequestError } from "viem";
import { useAccount, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from "wagmi";

import { askAbi } from "@/lib/abi";
import { ADDR, CHAIN_ID } from "@/lib/config";
import { canonical, contentHash, LIMITS, parseContent } from "@/lib/content";
import { people, tokens, usd } from "@/lib/format";
import { refused } from "@/lib/moderation";
import { BREADTHS, costOf as priceOf, PRIORITIES, SPLIT } from "@/lib/pricing";

const DURATIONS = [
  { label: "1 hour", s: 3600 },
  { label: "6 hours", s: 6 * 3600 },
  { label: "1 day", s: 86_400 },
  { label: "3 days", s: 3 * 86_400 },
  { label: "7 days", s: 7 * 86_400 },
  { label: "30 days", s: 30 * 86_400 },
];

type Step = "idle" | "publishing" | "approve" | "ask" | "developing";

const blank = () => ({ q: "", options: ["", ""] });

export function AskForm({ initialBreadth = 100 }: { initialBreadth?: number }) {
  const router = useRouter();
  // the connector's own chain: wagmi's useChainId stays on the configured chain even when the wallet is elsewhere
  const { address, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [questions, setQuestions] = useState([blank()]);
  const [breadth, setBreadth] = useState(BREADTHS.includes(initialBreadth) ? initialBreadth : 100);
  const [priority, setPriority] = useState(0);
  const [duration, setDuration] = useState(86_400);
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);

  const price = useReadContract({ address: ADDR.ask, abi: askAbi, functionName: "pricePerPerson", query: { refetchInterval: 30_000 } });
  const balance = useReadContract({
    address: ADDR.zc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  const zcUsd = useQuery({
    queryKey: ["zcUsd"],
    queryFn: async () => Number((await (await fetch("/api/health")).json()).zcUsd) || null,
    refetchInterval: 60_000,
  });

  const costOf = (p: bigint) => priceOf(p, breadth, priority);
  // say it while they type, not after they connect a wallet
  const word = refused({ v: 1, questions });
  const cost = price.data ? costOf(price.data) : null;
  const costUsd = cost !== null && zcUsd.data ? Number(formatUnits(cost, 18)) * zcUsd.data : null;

  const edit = (i: number, fn: (q: { q: string; options: string[] }) => void) =>
    setQuestions((qs) =>
      qs.map((q, j) => {
        if (j !== i) return q;
        const copy = { q: q.q, options: [...q.options] };
        fn(copy);
        return copy;
      }),
    );

  async function submit() {
    setError(null);
    const content = parseContent({ v: 1, questions });
    if (typeof content === "string") return setError(content[0].toUpperCase() + content.slice(1) + ".");
    if (!client || !address) return;
    const text = canonical(content);
    const hash = contentHash(text);

    try {
      setStep("publishing");
      const res = await fetch("/api/polls", { method: "POST", headers: { "content-type": "application/json" }, body: text });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.contentHash !== hash) throw new Error(body.error ?? "the server did not keep the question");

      const now = await client.readContract({ address: ADDR.ask, abi: askAbi, functionName: "pricePerPerson" });
      const exact = costOf(now);
      const allowance = await client.readContract({ address: ADDR.zc, abi: erc20Abi, functionName: "allowance", args: [address, ADDR.ask] });
      if (allowance < exact) {
        setStep("approve");
        const tx = await writeContractAsync({ address: ADDR.zc, abi: erc20Abi, functionName: "approve", args: [ADDR.ask, exact], chainId: CHAIN_ID });
        if ((await client.waitForTransactionReceipt({ hash: tx })).status !== "success") throw new Error("the approval reverted");
      }

      // simulate first, so a price change or a bad input shows here instead of as a failed transaction
      const { request } = await client.simulateContract({
        account: address,
        address: ADDR.ask,
        abi: askAbi,
        functionName: "ask",
        args: [hash, breadth, priority, duration, exact],
      });
      setStep("ask");
      const tx = await writeContractAsync({ ...request, chainId: CHAIN_ID });
      const receipt = await client.waitForTransactionReceipt({ hash: tx });
      if (receipt.status !== "success") throw new Error("the transaction reverted");
      const [asked] = parseEventLogs({ abi: askAbi, logs: receipt.logs, eventName: "Asked" });
      if (!asked) throw new Error("the transaction was replaced before it asked");
      settle(String(asked.args.id));
    } catch (e) {
      setStep("idle");
      price.refetch();
      balance.refetch();
      setError(explain(e));
    }
  }

  /** The ZC is paid from here on: nothing may report a failure or let the form send again. */
  async function settle(id: string) {
    setStep("developing");
    // the indexer trails the chain by a few seconds
    for (let i = 0; i < 30; i++) {
      if ((await fetch(`/api/polls/${id}`).catch(() => null))?.ok) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    router.push(`/poll/${id}`);
  }

  const busy = step !== "idle";
  const short = cost !== null && balance.data !== undefined && balance.data < cost;

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <form
        className="bg-paper px-5 py-7 text-developer sm:px-9 sm:py-9"
        onSubmit={(e) => e.preventDefault()}
      >
        <fieldset disabled={busy} className="space-y-9">
          {questions.map((q, i) => (
            <div key={i} className="space-y-3">
              <div className="flex items-baseline justify-between">
                <label htmlFor={`q${i}`} className="font-mono text-xs uppercase tracking-[0.14em]">
                  Question {i + 1}
                </label>
                {questions.length > 1 && (
                  <button type="button" onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))} className="font-mono text-xs underline underline-offset-4">
                    Remove
                  </button>
                )}
              </div>
              <textarea
                id={`q${i}`}
                value={q.q}
                maxLength={LIMITS.question}
                rows={2}
                placeholder="Will ETH be above $5,000 before January?"
                onChange={(e) => edit(i, (x) => (x.q = e.target.value))}
                className="w-full resize-none border-b border-developer/40 bg-transparent pb-2 text-2xl leading-snug outline-none placeholder:text-developer/35 focus:border-developer"
              />
              <ol className="space-y-2">
                {q.options.map((o, k) => (
                  <li key={k} className="flex items-center gap-3">
                    <span aria-hidden className="grid size-7 shrink-0 place-items-center border border-developer/50 font-mono text-xs">
                      {"ABCDEF"[k]}
                    </span>
                    <input
                      aria-label={`Question ${i + 1}, option ${"ABCDEF"[k]}`}
                      value={o}
                      maxLength={LIMITS.option}
                      placeholder={k === 0 ? "Yes" : k === 1 ? "No" : "Another answer"}
                      onChange={(e) => edit(i, (x) => (x.options[k] = e.target.value))}
                      className="min-w-0 flex-1 border-b border-developer/25 bg-transparent py-1 text-lg outline-none placeholder:text-developer/35 focus:border-developer"
                    />
                    {q.options.length > 2 && (
                      <button type="button" aria-label="Remove this option" onClick={() => edit(i, (x) => x.options.splice(k, 1))} className="grid size-7 place-items-center font-mono text-sm">
                        ×
                      </button>
                    )}
                  </li>
                ))}
              </ol>
              {q.options.length < LIMITS.options && (
                <button type="button" onClick={() => edit(i, (x) => x.options.push(""))} className="font-mono text-xs underline underline-offset-4">
                  Add an option
                </button>
              )}
            </div>
          ))}
          {questions.length < LIMITS.questions && (
            <button type="button" onClick={() => setQuestions((qs) => [...qs, blank()])} className="border border-dashed border-developer/50 px-4 py-2 font-mono text-xs">
              Add another question
            </button>
          )}

          <div className="grid gap-7 border-t border-developer/25 pt-7 sm:grid-cols-2">
            <Choice legend="Breadth" hint="How many people it asks" className="sm:col-span-2">
              {BREADTHS.map((b) => (
                <Pill key={b} name="breadth" checked={breadth === b} onChange={() => setBreadth(b)}>
                  {people(b)}
                </Pill>
              ))}
            </Choice>
            <Choice legend="Priority" hint="How high it shows in the feed">
              {PRIORITIES.map((p, i) => (
                <Pill key={p.label} name="priority" checked={priority === i} onChange={() => setPriority(i)}>
                  {p.label}
                </Pill>
              ))}
            </Choice>
            <label className="space-y-2">
              <span className="block font-mono text-xs uppercase tracking-[0.14em]">Open for</span>
              <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-full border border-developer/50 bg-transparent px-3 py-2 font-mono text-sm">
                {DURATIONS.map((d) => (
                  <option key={d.s} value={d.s}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>
      </form>

      <aside className="space-y-6 self-start bg-tray px-5 py-7 font-mono text-sm sm:px-7 lg:sticky lg:top-6">
        <p className="text-xs uppercase tracking-[0.14em] text-silver">Receipt</p>
        <dl className="space-y-2">
          <Row k="Reach">{people(breadth)} people</Row>
          <Row k="Priority">{PRIORITIES[priority].label}</Row>
          <Row k="Price">{price.data === undefined ? "·" : price.data === 0n ? "not open yet" : `${tokens(price.data)} ZC a person`}</Row>
        </dl>
        <div className="border-t border-silver/25 pt-4">
          <p className="flex items-baseline justify-between">
            <span className="text-silver">Cost</span>
            <span className="text-2xl tabular-nums">{cost !== null ? `${tokens(cost)} ZC` : "·"}</span>
          </p>
          {costUsd !== null && <p className="text-right text-xs text-silver">≈ {usd(costUsd)}</p>}
        </div>
        {cost !== null && (
          <dl className="space-y-1 text-xs">
            {SPLIT.map(([k, bps]) => (
              <Row key={k} k={`${k} ${Number(bps) / 100}%`}>
                {tokens((cost * bps) / 10_000n)} ZC
              </Row>
            ))}
          </dl>
        )}
        <p className="text-xs leading-relaxed text-silver">
          The contract holds your ZC until the result is fixed. Answerers get at most {Number(SPLIT[0][1]) / 100}%; what they don&apos;t
          earn comes back to you. If the result is never fixed, you take all of it back 7 days after the poll closes.
        </p>

        {word && (
          <p role="status" className="text-xs leading-relaxed text-paper">
            Silverchat does not publish questions with &quot;{word}&quot; in them.{" "}
            <Link href="/docs#questions" className="underline underline-offset-4">
              The rules for questions
            </Link>
          </p>
        )}
        {!address ? (
          <ConnectButton label="Connect a wallet" />
        ) : chainId !== CHAIN_ID ? (
          <button type="button" onClick={() => switchChain({ chainId: CHAIN_ID })} className="w-full bg-paper py-3 text-developer">
            Switch to Ethereum
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={busy || !price.data || short || !!word}
            className="w-full bg-paper py-3 text-developer hover:bg-paper/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {price.data === undefined
              ? price.isError
                ? "Cannot read the price, try again"
                : "Reading the price…"
              : price.data === 0n
                ? "Asking opens soon"
                : short
                  ? "Not enough ZC"
                  : { idle: "Ask the network", publishing: "Saving the question…", approve: "Approve ZC in your wallet…", ask: "Confirm the ask in your wallet…", developing: "Developing…" }[step]}
          </button>
        )}
        {error && (
          <p role="alert" className="text-xs leading-relaxed text-paper">
            {error}
          </p>
        )}
      </aside>
    </div>
  );
}

export function Choice({ legend, hint, className = "", children }: { legend: string; hint: string; className?: string; children: React.ReactNode }) {
  return (
    <fieldset className={`space-y-2 ${className}`}>
      <legend className="font-mono text-xs uppercase tracking-[0.14em]">
        {legend} <span className="normal-case tracking-normal text-developer/60">· {hint}</span>
      </legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

export function Pill({ name, checked, onChange, children }: { name: string; checked: boolean; onChange: () => void; children: React.ReactNode }) {
  return (
    <label className="cursor-pointer">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="peer sr-only" />
      <span className="block border border-developer/50 px-3 py-1.5 font-mono text-sm tabular-nums peer-checked:border-developer peer-checked:bg-developer peer-checked:text-paper peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:outline-offset-2">
        {children}
      </span>
    </label>
  );
}

export function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-silver">{k}</dt>
      <dd className="tabular-nums">{children}</dd>
    </div>
  );
}

function explain(e: unknown) {
  if (e instanceof BaseError) {
    if (e.walk((x) => x instanceof UserRejectedRequestError)) return "You cancelled it in your wallet. Nothing was paid.";
    const revert = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    if (revert?.data?.errorName === "PriceMoved") return "The price changed while you signed. The new cost is shown. Try again.";
    if (revert?.data?.errorName === "PriceUnset") return "Asking is not open yet.";
    return `It did not go through: ${e.shortMessage}`;
  }
  return `It did not go through: ${e instanceof Error ? e.message : String(e)}`;
}
