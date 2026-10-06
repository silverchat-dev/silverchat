"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BaseError, ContractFunctionRevertedError, encodeFunctionData, erc20Abi, formatEther, formatUnits, parseEventLogs, UserRejectedRequestError, type Address, type Hex, type Log } from "viem";
import { useAccount, useCapabilities, useConfig, usePublicClient, useReadContract, useSendCalls, useSwitchChain, useWriteContract } from "wagmi";
import { waitForCallsStatus } from "wagmi/actions";

import { askAbi, routerAbi } from "@/lib/abi";
import { ADDR, CHAIN_ID } from "@/lib/config";
import { canonical, contentHash, LIMITS, parseContent, TOPICS, type Topic } from "@/lib/content";
import { people, tokens, usd } from "@/lib/format";
import { refused } from "@/lib/moderation";
import { BREADTHS, costOf as priceOf, PRIORITIES, SPLIT } from "@/lib/pricing";
import { burstBowl } from "@/world/live";

import { buy, ethFor, POOL_KEY, STOCKEREUM_ZC, useEthFor, withBuffer } from "./buy";
import { action, field, Figures, label, Part, quiet, second } from "./journal";

const DURATIONS = [
  { label: "1 hour", s: 3600 },
  { label: "6 hours", s: 6 * 3600 },
  { label: "1 day", s: 86_400 },
  { label: "3 days", s: 3 * 86_400 },
  { label: "7 days", s: 7 * 86_400 },
  { label: "30 days", s: 30 * 86_400 },
];

type Step = "idle" | "publishing" | "buy" | "batch" | "sent" | "approve" | "ask" | "developing";

const blank = () => ({ q: "", options: ["", ""] });

export function AskForm({ initialBreadth = 100 }: { initialBreadth?: number }) {
  const router = useRouter();
  // the connector's own chain: wagmi's useChainId stays on the configured chain even when the wallet is elsewhere
  const { address, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { sendCallsAsync } = useSendCalls();
  const config = useConfig();
  // one confirmation for buy, approve and ask, only where the wallet already batches atomically (no upgrade prompts)
  const caps = useCapabilities({ query: { enabled: !!address } });
  const atomic = caps.data?.[CHAIN_ID]?.atomic?.status === "supported";

  const [questions, setQuestions] = useState([blank()]);
  const [topic, setTopic] = useState<Topic | null>(null);
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
  const shortBy = cost !== null && balance.data !== undefined && balance.data < cost ? cost - balance.data : null;
  const eth = useEthFor(shortBy);
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
    if (!topic) return setError("Pick a topic for the question.");
    const content = parseContent({ v: 2, topic, questions });
    if (typeof content === "string") return setError(content[0].toUpperCase() + content.slice(1) + ".");
    if (!client || !address) return;
    const text = canonical(content);
    const hash = contentHash(text);
    let bought = false;

    try {
      setStep("publishing");
      const res = await fetch("/api/polls", { method: "POST", headers: { "content-type": "application/json" }, body: text });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.contentHash !== hash) throw new Error(body.error ?? "the server did not keep the question");

      const now = await client.readContract({ address: ADDR.ask, abi: askAbi, functionName: "pricePerPerson" });
      const exact = costOf(now);
      const [have, allowance] = await Promise.all([
        client.readContract({ address: ADDR.zc, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
        client.readContract({ address: ADDR.zc, abi: erc20Abi, functionName: "allowance", args: [address, ADDR.ask] }),
      ]);
      // short of ZC: buy the rest through Stockereum. minOut is exactly what's missing, so the buy reverts rather than fall short
      const need = have < exact ? exact - have : 0n;
      if (need > 0n) {
        const value = await ethFor(client, withBuffer(need));
        const buyCall = encodeFunctionData({ abi: routerAbi, functionName: "buyWethPairWithEth", args: [POOL_KEY, need, "0x"] });
        if (atomic) {
          setStep("batch");
          const calls: { to: Address; data: Hex; value?: bigint }[] = [{ to: ADDR.stockereumRouter, value, data: buyCall }];
          if (allowance < exact) calls.push({ to: ADDR.zc, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [ADDR.ask, exact] }) });
          calls.push({ to: ADDR.ask, data: encodeFunctionData({ abi: askAbi, functionName: "ask", args: [hash, breadth, priority, duration, exact] }) });
          const fromBlock = await client.getBlockNumber();
          const { id } = await sendCallsAsync({ chainId: CHAIN_ID, forceAtomic: true, calls });
          const done = await waitForCallsStatus(config, { id, timeout: 900_000 }).catch(() => null);
          if (done?.status === "failure") throw new Error("the wallet's batch did not go through, so nothing was bought");
          // the wallet's own receipts first; wallets report in different shapes, so then the chain: this wallet's ask of this question since the batch
          const receiptLogs = (done?.receipts ?? []).flatMap((r) => r.logs) as unknown as Log[];
          let asked: { args: { id?: bigint } } | undefined = parseEventLogs({ abi: askAbi, logs: receiptLogs, eventName: "Asked" })[0];
          const find = () =>
            client
              .getContractEvents({ address: ADDR.ask, abi: askAbi, eventName: "Asked", args: { asker: address, contentHash: hash }, fromBlock })
              .then((l) => l[0], () => undefined);
          for (let i = 0; !asked && i < 40; i++) {
            asked = await find();
            if (!asked) await new Promise((r) => setTimeout(r, 3000));
          }
          // all or nothing: once the ask is on chain the ZC is paid
          if (asked) return settle(String(asked.args.id));
          // the batch may still land: never offer to pay again from here
          setStep("sent");
          setError("Your wallet sent it, but the ask hasn't shown up yet. Look for it in Records before you try again.");
          return;
        }
        setStep("buy");
        await buy(client, address, need, value, writeContractAsync);
        bought = true;
        balance.refetch();
      }
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
      setError(bought ? `${explain(e).replace(" Nothing was paid.", "")} The ZC you bought is in your wallet; the ask was not paid.` : explain(e));
    }
  }

  /** The ZC is paid from here on: nothing may report a failure or let the form send again. */
  async function settle(id: string) {
    // the ask is on chain: the bowl behind the panel flares
    burstBowl();
    setStep("developing");
    // the indexer trails the chain by a few seconds
    for (let i = 0; i < 30; i++) {
      if ((await fetch(`/api/polls/${id}`).catch(() => null))?.ok) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    router.push(`/poll/${id}`);
  }

  const busy = step !== "idle";
  const short = shortBy !== null;
  const [, burnBps] = SPLIT[2];
  const burned = cost !== null ? (cost * burnBps) / 10_000n : null;
  const zc = (wei: bigint, digits?: number) => (
    <>
      {tokens(wei, digits)} <span className="text-[0.55em] tracking-[0.04em]">ZC</span>
    </>
  );

  return (
    <div className="space-y-10">
      <form onSubmit={(e) => e.preventDefault()}>
        <fieldset disabled={busy} className="space-y-10 transition-opacity motion-reduce:transition-none disabled:opacity-60">
          <Part title="1 · The question">
            <ol className="ruled">
              {questions.map((q, i) => (
                <li key={i} className="space-y-4 py-7 first:pt-0">
                  <div className="flex items-baseline justify-between gap-4">
                    <label htmlFor={`q${i}`} className={questions.length > 1 ? label : "sr-only"}>
                      Question {i + 1}
                    </label>
                    {questions.length > 1 && (
                      <button type="button" onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))} className={`font-mono text-xs ${quiet}`}>
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
                    className="w-full resize-none border-0 border-b field-sizing-content border-paper/30 bg-transparent px-0 pb-3 text-[clamp(1.4rem,3.6vw,1.75rem)] leading-snug text-paper placeholder:text-silver/70 focus:border-paper focus:outline-none focus:ring-0"
                  />
                  <ol className="space-y-1">
                    {q.options.map((o, k) => (
                      <li key={k} className="flex items-center gap-3">
                        <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full border border-paper/30 font-mono text-[11px] text-silver">
                          {"ABCDEF"[k]}
                        </span>
                        <input
                          aria-label={`Question ${i + 1}, option ${"ABCDEF"[k]}`}
                          value={o}
                          maxLength={LIMITS.option}
                          placeholder={k === 0 ? "Yes" : k === 1 ? "No" : "Another answer"}
                          onChange={(e) => edit(i, (x) => (x.options[k] = e.target.value))}
                          className={`${field} min-w-0 flex-1`}
                        />
                        {q.options.length > 2 && (
                          <button
                            type="button"
                            aria-label="Remove this option"
                            onClick={() => edit(i, (x) => x.options.splice(k, 1))}
                            className="grid size-11 shrink-0 place-items-center rounded-full font-mono text-base text-silver transition-colors hover:text-paper sm:size-9"
                          >
                            ×
                          </button>
                        )}
                      </li>
                    ))}
                  </ol>
                  {q.options.length < LIMITS.options && (
                    <button type="button" onClick={() => edit(i, (x) => x.options.push(""))} className={`ml-10 py-2 font-mono text-xs ${quiet}`}>
                      Add an option
                    </button>
                  )}
                </li>
              ))}
            </ol>
            {questions.length < LIMITS.questions && (
              <button type="button" onClick={() => setQuestions((qs) => [...qs, blank()])} className={second}>
                Add another question
              </button>
            )}
            <div className="pt-4">
              <Group legend="Topic" hint="Where it shows when people filter by topic">
                {TOPICS.map((t) => (
                  <Chip key={t} name="topic" checked={topic === t} onChange={() => setTopic(t)}>
                    {t}
                  </Chip>
                ))}
              </Group>
            </div>
          </Part>

          <Part title="2 · Who it asks">
            <fieldset className="space-y-3">
              <legend className="space-y-1">
                <span className={`block ${label}`}>Breadth</span>
                <span className="block text-[0.95rem] text-paper/75">How many people it asks. Each place costs the price per person.</span>
              </legend>
              <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-4">
                {BREADTHS.map((b) => (
                  <label key={b} className="cursor-pointer">
                    <input type="radio" name="breadth" checked={breadth === b} onChange={() => setBreadth(b)} className="peer sr-only" />
                    <span className="flex h-full flex-col gap-1.5 rounded-lg border border-paper/20 px-4 py-3.5 transition-colors duration-200 hover:border-paper/50 motion-reduce:transition-none peer-checked:border-paper peer-checked:bg-paper peer-checked:text-developer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-paper peer-focus-visible:outline-solid">
                      <span className="text-[2rem] leading-none tabular-nums">{people(b)}</span>
                      <span className="font-mono text-[11px] tracking-[0.04em] opacity-75">people</span>
                      <span className="pt-1.5 font-mono text-[11px] tabular-nums opacity-75">{price.data ? `${tokens(priceOf(price.data, b, priority), 0)} ZC` : "·"}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-7 pt-2 sm:grid-cols-[minmax(0,1fr)_11rem]">
              <Group legend="Priority" hint="How high it shows in the feed. High costs 1.2x, Top 1.5x">
                {PRIORITIES.map((p, i) => (
                  <Chip key={p.label} name="priority" checked={priority === i} onChange={() => setPriority(i)}>
                    {p.label}
                  </Chip>
                ))}
              </Group>
              <label className="block space-y-2">
                <span className={`block ${label}`}>Open for</span>
                <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={`${field} cursor-pointer font-mono`}>
                  {DURATIONS.map((d) => (
                    <option key={d.s} value={d.s}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </Part>
        </fieldset>
      </form>

      <Part title="3 · What it costs">
        <Figures
          columns={2}
          items={[
            { label: "You pay", value: cost !== null ? zc(cost) : "·", note: costUsd !== null ? `≈ ${usd(costUsd)}` : "held by the contract until the result is fixed" },
            { label: "Burned for good", value: burned !== null ? zc(burned) : "·", note: `${Number(burnBps) / 100}% of it, when the result is fixed` },
          ]}
        />

        <div className="grid gap-x-8 gap-y-6 pt-2 sm:grid-cols-2">
          <div className="space-y-3">
            <p className={label}>The receipt</p>
            <dl className="divide-y divide-dashed divide-paper/20 font-mono text-[13px]">
              <Line k="Topic">{topic ?? <span className="text-silver">not chosen yet</span>}</Line>
              <Line k="Reach">{people(breadth)} people</Line>
              <Line k="Priority">{PRIORITIES[priority].label}</Line>
              <Line k="Open for">{DURATIONS.find((d) => d.s === duration)?.label}</Line>
              <Line k="Price">{price.data === undefined ? "·" : price.data === 0n ? "not set" : `${tokens(price.data)} ZC a person`}</Line>
            </dl>
          </div>
          <div className="space-y-3">
            <p className={label}>Where it goes</p>
            <div aria-hidden className="flex h-2 overflow-hidden rounded-full bg-paper/10">
              {SPLIT.map(([k, bps], i) => (
                <span key={k} className={["bg-paper/30", "bg-paper/55", "bg-paper"][i]} style={{ width: `${Number(bps) / 100}%` }} />
              ))}
            </div>
            <dl className="divide-y divide-dashed divide-paper/20 font-mono text-[13px]">
              {SPLIT.map(([k, bps], i) => (
                <Line key={k} k={`${k} ${Number(bps) / 100}%`} strong={i === 2}>
                  {cost !== null ? `${tokens((cost * bps) / 10_000n)} ZC` : "·"}
                </Line>
              ))}
            </dl>
          </div>
        </div>

        <p className="max-w-[34em] text-[0.975rem] leading-relaxed text-paper/75 text-pretty">
          The contract holds your ZC until the result is fixed. Answerers get at most {Number(SPLIT[0][1]) / 100}%; what they don&apos;t
          earn comes back to you. If the result is never fixed, you take all of it back 7 days after the poll closes.
        </p>

        <div className="space-y-4 pt-2">
          {word && (
            <p role="status" className="border-l-2 border-paper pl-3 text-[0.975rem] leading-relaxed">
              Silverchat does not publish questions with &quot;{word}&quot; in them.{" "}
              <Link href="/docs#questions" className={quiet}>
                The rules for questions
              </Link>
            </p>
          )}
          {!address ? (
            <ConnectButton.Custom>
              {({ openConnectModal, mounted }) => (
                <button type="button" onClick={openConnectModal} disabled={!mounted} className={`${action} min-h-12 w-full`}>
                  Connect a wallet
                </button>
              )}
            </ConnectButton.Custom>
          ) : chainId !== CHAIN_ID ? (
            <button type="button" onClick={() => switchChain({ chainId: CHAIN_ID })} className={`${action} min-h-12 w-full`}>
              Switch to Ethereum
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={busy || !price.data || !!word || (short && !(eth.eth && eth.enough))}
              className={`${action} min-h-12 w-full`}
            >
              {busy
                ? {
                    idle: "",
                    publishing: "Saving the question…",
                    buy: "Confirm the ZC buy in your wallet…",
                    batch: "Confirm in your wallet…",
                    sent: "Sent. Check Records",
                    approve: "Approve ZC in your wallet…",
                    ask: "Confirm the ask in your wallet…",
                    developing: "Developing…",
                  }[step]
                : price.data === undefined
                  ? price.isError
                    ? "Cannot read the price, try again"
                    : "Reading the price…"
                  : price.data === 0n
                    ? "Asking is paused"
                    : short
                      ? eth.eth
                        ? `Buy ${tokens(shortBy, 0)} ZC and ask`
                        : eth.error
                          ? "Not enough ZC"
                          : "Getting a price…"
                      : "Ask the network"}
            </button>
          )}
          {short && !busy && (
            <p className="font-mono text-xs leading-relaxed text-silver">
              {eth.error ? (
                <>
                  Can&apos;t get a price right now.{" "}
                  <a href={STOCKEREUM_ZC} target="_blank" rel="noreferrer" className={`text-paper ${quiet}`}>
                    Buy ZC on Stockereum
                  </a>
                </>
              ) : eth.eth && eth.have !== undefined && !eth.enough ? (
                `You need about ${Number(formatEther(eth.eth)).toPrecision(2)} ETH plus gas; this wallet has ${Number(formatEther(eth.have)).toPrecision(2)} ETH.`
              ) : eth.eth ? (
                `About ${Number(formatEther(eth.eth)).toPrecision(2)} ETH, bought through Stockereum with its 1% fee and a 3% buffer; extra ZC stays with you. ${atomic ? "One confirmation." : "Three confirmations: buy, approve, ask."}`
              ) : null}
            </p>
          )}
          {error && (
            <p role="alert" className="border-l-2 border-paper pl-3 text-[0.975rem] leading-relaxed">
              {error}
            </p>
          )}
        </div>
      </Part>
    </div>
  );
}

/** A set of choices on the journal page: a small label, a plain-words hint, and the chips. */
function Group({ legend, hint, children }: { legend: string; hint: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="space-y-1">
        <span className={`block ${label}`}>{legend}</span>
        <span className="block text-[0.95rem] text-paper/75">{hint}</span>
      </legend>
      <div className="flex flex-wrap gap-2 pt-1">{children}</div>
    </fieldset>
  );
}

/** One choice: a word in a rounded outline, filled with ink when chosen, like the tabs. */
function Chip({ name, checked, onChange, children }: { name: string; checked: boolean; onChange: () => void; children: React.ReactNode }) {
  return (
    <label className="cursor-pointer">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="peer sr-only" />
      <span className="inline-flex min-h-11 items-center rounded-full border border-paper/25 px-4 font-mono text-[12px] tracking-[0.04em] text-paper/85 transition-colors duration-200 hover:border-paper motion-reduce:transition-none peer-checked:border-paper peer-checked:bg-paper peer-checked:text-developer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-paper peer-focus-visible:outline-solid sm:min-h-9">
        {children}
      </span>
    </label>
  );
}

/** A row of the bill: what, then how much. */
function Line({ k, strong = false, children }: { k: string; strong?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <dt className={strong ? "text-paper" : "text-silver"}>{k}</dt>
      <dd className={`tabular-nums ${strong ? "text-paper" : "text-paper/85"}`}>{children}</dd>
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
    if (revert?.data?.errorName === "PriceUnset") return "Asking is paused right now. Try again later.";
    return `It did not go through: ${e.shortMessage}`;
  }
  return `It did not go through: ${e instanceof Error ? e.message : String(e)}`;
}
