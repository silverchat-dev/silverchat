"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BaseError, ContractFunctionRevertedError, erc20Abi, formatUnits, parseEther, parseEventLogs, parseUnits, toHex, UserRejectedRequestError, type Hex } from "viem";
import { useAccount, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from "wagmi";

import { predictAbi } from "@/lib/abi";
import { ADDR, CHAIN_ID } from "@/lib/config";
import { TOPICS, type Topic } from "@/lib/content";
import { tokens, usd } from "@/lib/format";
import { badTitle, commitmentOf, FEED_DECIMALS, FEEDS, loadSeal, NO, questionString, saveSeal, utcStamp, YES, type Seal, type Side } from "@/lib/market";

import { Choice, Pill, Row } from "./ask-form";

/** What the market page knows from the server; the stake itself is read from the chain. */
export type MarketView = {
  id: string;
  kind: "price" | "event";
  opener: string;
  closesAt: number;
  revealEnds: number;
  resolvesAt: number;
  status: "none" | "open" | "yes" | "no" | "void";
  refund: boolean;
  invalid: boolean;
  lockClaimed: boolean;
};

const SIDE = { [YES]: "YES", [NO]: "NO" } as const;
const button = "bg-developer px-5 py-3 font-mono text-sm text-paper disabled:opacity-50";

function explain(e: unknown) {
  if (e instanceof BaseError) {
    if (e.walk((x) => x instanceof UserRejectedRequestError)) return "You cancelled it in your wallet.";
    const revert = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    if (revert?.data?.errorName) return `The contract refused it: ${revert.data.errorName.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()}.`;
    return `It did not go through: ${e.shortMessage}`;
  }
  return `It did not go through: ${e instanceof Error ? e.message : String(e)}`;
}

/** Your stake in one market: stake with a sealed side, reveal it after close, claim when it is settled. */
export function StakePanel({ market: m, now }: { market: MarketView; now: number }) {
  const { address, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const router = useRouter();
  const id = BigInt(m.id);

  const [side, setSide] = useState<Side | null>(null);
  const [amount, setAmount] = useState("");
  const [handOver, setHandOver] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // the record catches up with a claimed lock a few seconds later; until then this panel knows
  const [lockTaken, setLockTaken] = useState(false);

  const stake = useReadContract({ address: ADDR.predict, abi: predictAbi, functionName: "stakes", args: address ? [id, address] : undefined, query: { enabled: !!address } });
  const minStake = useReadContract({ address: ADDR.predict, abi: predictAbi, functionName: "minStake" });
  const [staked, commitment, revealed, claimed] = stake.data ?? [0n, "0x" as Hex, 0, false];
  // the seal that opens the stake the chain holds, if this browser kept it
  const seal: Seal | null = address && staked > 0n ? loadSeal(m.id, address, commitment) : null;
  const staking = m.status === "open" && now < m.closesAt;
  const revealing = m.status === "open" && now >= m.closesAt && now < m.revealEnds;
  const settled = m.status === "yes" || m.status === "no" || m.status === "void";
  const opener = !!address && address.toLowerCase() === m.opener.toLowerCase();

  async function run(label: string, fn: () => Promise<Hex | void>) {
    if (!client || !address) return;
    setBusy(true);
    setError(null);
    setNote(label);
    try {
      const hash = await fn();
      if (hash && (await client.waitForTransactionReceipt({ hash })).status !== "success") throw new Error("the transaction reverted");
    } catch (e) {
      setError(explain(e));
    } finally {
      // whatever happened, show what the chain holds now
      setNote(null);
      await stake.refetch();
      router.refresh();
      setBusy(false);
    }
  }

  const write = async (functionName: "stake" | "reveal" | "claim" | "claimLock", args: readonly unknown[]) => {
    const { request } = await client!.simulateContract({ account: address!, address: ADDR.predict, abi: predictAbi, functionName, args } as never);
    return writeContractAsync({ ...(request as object), chainId: CHAIN_ID } as never);
  };

  /** Hand the seal to the keeper, a few times: the server may not have seen a stake mined seconds ago. */
  async function handSeal(s: Seal) {
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`/api/markets/${m.id}/seal`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ staker: address, side: s.side, salt: s.salt }),
      }).catch(() => null);
      if (res?.ok) return true;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
    return false;
  }

  async function placeStake() {
    if (!side || !address || !client) return;
    let wei: bigint;
    try {
      wei = parseEther(amount);
    } catch {
      return setError("Write the amount as a number of ZC.");
    }
    if (minStake.data !== undefined && wei < minStake.data) return setError(`The smallest stake is ${tokens(minStake.data, 0)} ZC.`);
    await run("Staking…", async () => {
      // the chain, not the cached read: a stake from another tab or an earlier try may have landed
      const [already] = await client.readContract({ address: ADDR.predict, abi: predictAbi, functionName: "stakes", args: [id, address] });
      if (already > 0n) throw new Error("this wallet already has a stake in this market");
      const salt = toHex(crypto.getRandomValues(new Uint8Array(32))) as Hex;
      const sealed = commitmentOf(id, address, side, salt);
      // kept before anything is sent: without it this browser could not reveal
      const kept = saveSeal(m.id, address, sealed, { side, salt });
      // one sure holder of the seal before any ZC moves: the keeper may not take it right away
      if (!kept) throw new Error("this browser cannot keep your seal, so it could not reveal your side; use a browser that allows site storage");
      const allowance = await client.readContract({ address: ADDR.zc, abi: erc20Abi, functionName: "allowance", args: [address, ADDR.predict] });
      if (allowance < wei) {
        setNote("Approve the ZC in your wallet…");
        const tx = await writeContractAsync({ address: ADDR.zc, abi: erc20Abi, functionName: "approve", args: [ADDR.predict, wei], chainId: CHAIN_ID });
        if ((await client.waitForTransactionReceipt({ hash: tx })).status !== "success") throw new Error("the approval reverted");
      }
      setNote("Confirm the stake in your wallet…");
      const tx = await write("stake", [id, wei, sealed]);
      if ((await client.waitForTransactionReceipt({ hash: tx })).status !== "success") throw new Error("the stake reverted");
      if (handOver && !(await handSeal({ side, salt }))) {
        setError("Your stake is in, but the keeper did not get your seal. Use the link above to hand it over again.");
      }
    });
  }

  const sideLabel = revealed ? SIDE[revealed as Side] : seal ? SIDE[seal.side] : null;

  return (
    <section aria-labelledby="stake" className="space-y-5 bg-paper px-5 py-7 text-developer sm:px-9 sm:py-9">
      <h2 id="stake" className="font-mono text-xs uppercase tracking-[0.14em]">
        Your stake
      </h2>

      {!address ? (
        <div className="space-y-4">
          <p className="text-lg">Connect a wallet to stake ZC on this market.</p>
          <ConnectButton label="Connect a wallet" />
        </div>
      ) : chainId !== CHAIN_ID ? (
        <button type="button" onClick={() => switchChain({ chainId: CHAIN_ID })} className={button}>
          Switch to Ethereum
        </button>
      ) : staked === 0n ? (
        staking ? (
          <div className="space-y-6">
            <Choice legend="Your side" hint="Sealed on the chain until the market closes">
              <Pill name="side" checked={side === YES} onChange={() => setSide(YES)}>
                YES
              </Pill>
              <Pill name="side" checked={side === NO} onChange={() => setSide(NO)}>
                NO
              </Pill>
            </Choice>
            <label className="block space-y-2">
              <span className="block font-mono text-xs uppercase tracking-[0.14em]">
                ZC to stake {minStake.data !== undefined && <span className="normal-case tracking-normal text-developer/60">· at least {tokens(minStake.data, 0)}</span>}
              </span>
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="1000"
                className="w-full border-b border-developer/40 bg-transparent pb-2 text-2xl outline-none placeholder:text-developer/35 focus:border-developer"
              />
            </label>
            <label className="flex items-start gap-3 text-sm leading-snug">
              <input type="checkbox" checked={handOver} onChange={(e) => setHandOver(e.target.checked)} className="mt-1 accent-developer" />
              <span>
                Let the keeper reveal my side if I do not come back within 48 hours of close. The keeper then knows my side
                before the market closes.
              </span>
            </label>
            <button type="button" onClick={placeStake} disabled={busy || !side || !amount} className={button}>
              {busy ? note : `Stake ${amount || "…"} ZC on ${side ? SIDE[side] : "a side"}`}
            </button>
          </div>
        ) : (
          <p className="text-lg">{settled ? "You did not stake in this market." : "Staking is closed."}</p>
        )
      ) : (
        <div className="space-y-4">
          <p className="text-lg">
            You staked {tokens(staked, 0)} ZC{sideLabel ? ` on ${sideLabel}` : ""}.{" "}
            {revealed ? "Your side is revealed." : staking ? "Your side stays sealed until the market closes." : null}
          </p>

          {revealing && !revealed &&
            (seal ? (
              <div className="space-y-3">
                <p>Reveal your side now. A side still sealed when the window ends counts as lost.</p>
                <button type="button" disabled={busy} className={button} onClick={() => run("Revealing…", () => write("reveal", [id, [address], [seal.side], [seal.salt]]))}>
                  {busy ? note : "Reveal my side"}
                </button>
              </div>
            ) : (
              <p>
                This browser does not hold your seal. Reveal from the device you staked on. If you handed the seal to the
                keeper, it reveals it 48 hours after close.
              </p>
            ))}

          {m.status === "open" && now >= m.revealEnds && <p>{revealed ? "Waiting for the result." : "Your side was not revealed in time, so this stake counts as lost."}</p>}

          {settled &&
            (claimed ? (
              <p>Claimed.</p>
            ) : m.refund ? (
              <button type="button" disabled={busy} className={button} onClick={() => run("Claiming…", () => write("claim", [id]))}>
                {busy ? note : `Take back ${tokens(staked, 0)} ZC`}
              </button>
            ) : revealed === (m.status === "yes" ? YES : NO) ? (
              <button type="button" disabled={busy} className={button} onClick={() => run("Claiming…", () => write("claim", [id]))}>
                {busy ? note : "Claim your winnings"}
              </button>
            ) : revealed === 0 ? (
              <p>Your side was never revealed, so it counts as lost.</p>
            ) : (
              <p>Your side did not win this one.</p>
            ))}

          {seal && !revealed && now < m.revealEnds && m.status === "open" && (
            <button
              type="button"
              disabled={busy}
              className="text-left font-mono text-xs underline underline-offset-4 disabled:opacity-50"
              onClick={() =>
                run("Handing it over…", async () => {
                  if (!(await handSeal(seal))) throw new Error("the keeper did not take it; try again in a minute");
                })
              }
            >
              Hand my seal to the keeper, so it reveals my side if I do not come back
            </button>
          )}
        </div>
      )}

      {opener && settled && !m.lockClaimed && !lockTaken && !m.invalid && (
        <button
          type="button"
          disabled={busy}
          className={`${button} block`}
          onClick={() =>
            run("Claiming…", async () => {
              const tx = await write("claimLock", [id]);
              if ((await client!.waitForTransactionReceipt({ hash: tx })).status !== "success") throw new Error("the transaction reverted");
              setLockTaken(true);
            })
          }
        >
          {busy ? note : "Take back your SC lock"}
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
    </section>
  );
}

const toUnix = (local: string) => (local ? Math.floor(new Date(local).getTime() / 1000) : 0);

/** Open a market: lock SC, then the market takes stakes until it closes. */
export function OpenMarketForm() {
  const { address, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const router = useRouter();

  const [kind, setKind] = useState<"event" | "price">("event");
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState<Topic | null>(null);
  const [feed, setFeed] = useState<keyof typeof FEEDS>("ETH/USD");
  const [above, setAbove] = useState("");
  const [closes, setCloses] = useState("");
  const [resolves, setResolves] = useState("");
  const [bounty, setBounty] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lock = useReadContract({ address: ADDR.predict, abi: predictAbi, functionName: "lockAmount" });
  const scUsd = useQuery({
    queryKey: ["scUsd"],
    queryFn: async () => Number((await (await fetch("/api/health")).json()).scUsd) || null,
    refetchInterval: 60_000,
  });
  const titleProblem = kind === "event" && title.trim() ? badTitle(title) : null;

  async function open() {
    if (!client || !address || lock.data === undefined) return;
    setError(null);
    const closesAt = toUnix(closes);
    const resolvesAt = toUnix(resolves);
    const now = Math.floor(Date.now() / 1000);
    if (!closesAt || !resolvesAt) return setError("Set when staking closes and when the market resolves.");
    // the contract's limits, checked here so nobody pays for an approval the market would then refuse
    if (closesAt < now + 3900) return setError("Staking must close at least an hour and five minutes from now.");
    if (resolvesAt < closesAt) return setError("The market must resolve at or after staking closes.");
    if (resolvesAt >= now + 365 * 86_400) return setError("The market must resolve within a year.");
    let value = 0n;
    try {
      value = bounty ? parseEther(bounty) : 0n;
    } catch {
      return setError("Write the bounty as a number of ETH.");
    }
    if (kind === "event" && (badTitle(title) || !topic)) return setError(badTitle(title) ?? "Pick a topic.");
    let threshold = 0n;
    if (kind === "price") {
      try {
        threshold = parseUnits(above, FEED_DECIMALS);
      } catch {
        return setError("Write the price as a number of dollars.");
      }
      if (threshold <= 0n) return setError("Write the price as a number of dollars.");
    }
    setBusy(true);
    try {
      const allowance = await client.readContract({ address: ADDR.sc, abi: erc20Abi, functionName: "allowance", args: [address, ADDR.predict] });
      if (allowance < lock.data) {
        setNote("Approve the SC lock in your wallet…");
        const tx = await writeContractAsync({ address: ADDR.sc, abi: erc20Abi, functionName: "approve", args: [ADDR.predict, lock.data], chainId: CHAIN_ID });
        if ((await client.waitForTransactionReceipt({ hash: tx })).status !== "success") throw new Error("the approval reverted");
      }
      setNote("Confirm the market in your wallet…");
      const question = questionString(title, topic ?? "Other");
      const call =
        kind === "event"
          ? ({ functionName: "openEvent", args: [question, closesAt, resolvesAt], value } as const)
          : ({ functionName: "openPrice", args: [toHex(0, { size: 32 }), FEEDS[feed], threshold, closesAt, resolvesAt] } as const);
      const { request } = await client.simulateContract({ account: address, address: ADDR.predict, abi: predictAbi, ...call } as never);
      const tx = await writeContractAsync({ ...(request as object), chainId: CHAIN_ID } as never);
      const receipt = await client.waitForTransactionReceipt({ hash: tx });
      if (receipt.status !== "success") throw new Error("the transaction reverted");
      const [opened] = parseEventLogs({ abi: predictAbi, logs: receipt.logs, eventName: "Opened" });
      setNote("Opened. Waiting for the record…");
      for (let i = 0; i < 30; i++) {
        if ((await fetch(`/api/markets/${opened.args.id}`).catch(() => null))?.ok) break;
        await new Promise((r) => setTimeout(r, 2000));
      }
      router.push(`/predict/${opened.args.id}`);
    } catch (e) {
      setBusy(false);
      setNote(null);
      setError(explain(e));
    }
  }

  const lockUsd = lock.data !== undefined && scUsd.data ? Number(formatUnits(lock.data, 18)) * scUsd.data : null;
  const field = "w-full border border-developer/50 bg-transparent px-3 py-2 font-mono text-sm";

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <form className="bg-paper px-5 py-7 text-developer sm:px-9 sm:py-9" onSubmit={(e) => e.preventDefault()}>
        <fieldset disabled={busy} className="space-y-9">
          <Choice legend="Kind" hint="An event is answered on Reality.eth; a price is read from Chainlink">
            <Pill name="kind" checked={kind === "event"} onChange={() => setKind("event")}>
              Event
            </Pill>
            <Pill name="kind" checked={kind === "price"} onChange={() => setKind("price")}>
              Price
            </Pill>
          </Choice>

          {kind === "event" ? (
            <>
              <label className="block space-y-3">
                <span className="block font-mono text-xs uppercase tracking-[0.14em]">Question</span>
                <textarea
                  value={title}
                  rows={3}
                  maxLength={280}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Will the Fed cut rates at its December meeting? Source: federalreserve.gov"
                  className="w-full resize-none border-b border-developer/40 bg-transparent pb-2 text-2xl leading-snug outline-none placeholder:text-developer/35 focus:border-developer"
                />
                <span className="block text-sm text-developer/70">
                  A yes/no question with the source that will decide it. Answerers on Reality.eth read only this text.
                </span>
                {titleProblem && <span className="block text-sm">{titleProblem[0].toUpperCase() + titleProblem.slice(1)}.</span>}
              </label>
              <Choice legend="Topic" hint="Where it shows when people filter by topic">
                {TOPICS.map((t) => (
                  <Pill key={t} name="topic" checked={topic === t} onChange={() => setTopic(t)}>
                    {t}
                  </Pill>
                ))}
              </Choice>
            </>
          ) : (
            <div className="grid gap-7 sm:grid-cols-2">
              <Choice legend="Feed" hint="Chainlink, 8 decimals">
                {(Object.keys(FEEDS) as (keyof typeof FEEDS)[]).map((f) => (
                  <Pill key={f} name="feed" checked={feed === f} onChange={() => setFeed(f)}>
                    {f}
                  </Pill>
                ))}
              </Choice>
              <label className="space-y-2">
                <span className="block font-mono text-xs uppercase tracking-[0.14em]">YES at or above, in $</span>
                <input inputMode="decimal" value={above} onChange={(e) => setAbove(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="5000" className={field} />
              </label>
            </div>
          )}

          <div className="grid gap-7 border-t border-developer/25 pt-7 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="block font-mono text-xs uppercase tracking-[0.14em]">Staking closes</span>
              <input type="datetime-local" value={closes} onChange={(e) => setCloses(e.target.value)} className={field} />
            </label>
            <label className="space-y-2">
              <span className="block font-mono text-xs uppercase tracking-[0.14em]">{kind === "price" ? "Price is read at" : "Question opens at"}</span>
              <input type="datetime-local" value={resolves} onChange={(e) => setResolves(e.target.value)} className={field} />
              {kind === "event" && (
                <span className="block text-xs text-developer/70">After the outcome is known. An answer given before then is &quot;too soon&quot; and the question has to be asked again.</span>
              )}
            </label>
            {kind === "event" && (
              <label className="space-y-2 sm:col-span-2">
                <span className="block font-mono text-xs uppercase tracking-[0.14em]">
                  Bounty for answerers, in ETH <span className="normal-case tracking-normal text-developer/60">· optional</span>
                </span>
                <input inputMode="decimal" value={bounty} onChange={(e) => setBounty(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" className={field} />
              </label>
            )}
          </div>
          <p className="text-sm text-developer/70">Times are in your own time zone. Staking closes at least an hour from now.</p>
        </fieldset>
      </form>

      <aside className="space-y-6 self-start bg-tray px-5 py-7 font-mono text-sm sm:px-7 lg:sticky lg:top-6">
        <p className="text-xs uppercase tracking-[0.14em] text-silver">Receipt</p>
        <dl className="space-y-2">
          <Row k="SC locked">{lock.data !== undefined ? `${tokens(lock.data, 0)}${lockUsd !== null ? ` ≈ ${usd(lockUsd)}` : ""}` : "·"}</Row>
          <Row k="Closes">{toUnix(closes) ? utcStamp(toUnix(closes)) : "·"}</Row>
          <Row k={kind === "price" ? "Price read" : "Opens"}>{toUnix(resolves) ? utcStamp(toUnix(resolves)) : "·"}</Row>
          <Row k="Fee">2% of a pool with a winner</Row>
        </dl>
        <p className="text-xs leading-relaxed text-silver">
          The SC comes back to you when the market settles YES or NO. If the answer is that the question is invalid, it
          goes to the treasury.
        </p>
        {!address ? (
          <ConnectButton label="Connect a wallet" />
        ) : chainId !== CHAIN_ID ? (
          <button type="button" onClick={() => switchChain({ chainId: CHAIN_ID })} className="bg-paper px-5 py-2.5 text-developer">
            Switch to Ethereum
          </button>
        ) : (
          <button type="button" onClick={open} disabled={busy} className="w-full bg-paper px-5 py-3 text-developer hover:bg-paper/90 disabled:opacity-50">
            {busy ? note : "Lock SC and open"}
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
