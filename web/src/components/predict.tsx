"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { BaseError, ContractFunctionRevertedError, erc20Abi, formatUnits, parseEther, parseEventLogs, parseUnits, toHex, UserRejectedRequestError, type Hex } from "viem";
import { useAccount, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from "wagmi";

import { predictAbi } from "@/lib/abi";
import { ADDR, CHAIN_ID } from "@/lib/config";
import { TOPICS, type Topic } from "@/lib/content";
import { pct, tokens, usd } from "@/lib/format";
import { badTitle, commitmentOf, FEED_DECIMALS, FEEDS, loadSeal, NO, questionString, saveSeal, utcStamp, YES, type Seal, type Side } from "@/lib/market";

import { Part, action, label, quiet, second, field as line } from "./journal";

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
const button = `${action} min-h-11`;

/** A group of choices under a small label, with one plain line on what it means. */
function Choice({ legend, hint, children }: { legend: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className={label}>{legend}</legend>
      {hint && <p className="-mt-1 text-[0.95rem] leading-snug text-paper/70">{hint}</p>}
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

/** One choice as a round tag; the chosen one in ink. */
function Pill({ name, checked, onChange, children }: { name: string; checked: boolean; onChange: () => void; children: ReactNode }) {
  return (
    <label className="cursor-pointer">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="peer sr-only" />
      <span className="flex min-h-11 items-center rounded-full border border-paper/30 px-4 sm:min-h-9 font-mono text-[13px] tabular-nums transition-colors duration-200 hover:border-paper peer-checked:border-paper peer-checked:bg-paper peer-checked:text-developer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-paper">
        {children}
      </span>
    </label>
  );
}

/** A large choice: a word set big, and what choosing it means under it. Used for the side and the kind of market. */
function Card({ name, checked, onChange, title, children }: { name: string; checked: boolean; onChange: () => void; title: string; children: ReactNode }) {
  return (
    <label className="block cursor-pointer">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="peer sr-only" />
      <span className="flex h-full flex-col gap-2 rounded-lg border border-paper/25 px-4 py-4 transition-colors duration-200 hover:border-paper/60 peer-checked:border-paper peer-checked:bg-paper peer-checked:text-developer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-paper sm:px-5">
        <span className="text-[2rem] leading-none">{title}</span>
        <span className="font-mono text-[11px] leading-snug opacity-75">{children}</span>
      </span>
    </label>
  );
}

/** A line of a ledger: the name on the left, the figure on the right. */
function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-paper/80">{k}</dt>
      <dd className="text-right font-mono text-[12px] tabular-nums">{children}</dd>
    </div>
  );
}

/** The wallet's connect button, drawn as the page's one action. It opens the same wallet window as everywhere else. */
function Connect({ children }: { children: ReactNode }) {
  return (
    <ConnectButton.Custom>
      {({ openConnectModal, mounted }) => (
        <button type="button" onClick={openConnectModal} disabled={!mounted} className={button}>
          {children}
        </button>
      )}
    </ConnectButton.Custom>
  );
}

/** A market's sides. Before close they are sealed, drawn as a hatched bar; after, YES in ink against NO. */
export function Sides({ yes, no, sealed, small, children }: { yes: string; no: string; sealed: boolean; small?: boolean; children?: ReactNode }) {
  const y = BigInt(yes);
  const n = BigInt(no);
  const shown = y + n;
  const share = pct(Number(y / 10n ** 15n), Number(shown / 10n ** 15n));
  const bar = (
    <span aria-hidden className={`relative block overflow-hidden rounded-full ${small ? "h-1 w-16" : "h-2.5 w-full"} ${sealed || !shown ? "bg-paper/10" : "bg-paper/20"}`}>
      {sealed ? (
        <span className="absolute inset-0 text-paper/45" style={{ backgroundImage: "repeating-linear-gradient(135deg, currentColor 0 1px, transparent 1px 5px)" }} />
      ) : (
        <span className="absolute inset-y-0 left-0 bg-paper" style={{ width: `${share}%` }} />
      )}
    </span>
  );
  if (small)
    return (
      <span className="inline-flex items-center gap-2">
        {bar}
        {sealed ? "sides sealed" : shown ? `YES ${share}% · NO ${100 - share}%` : "no side revealed"}
      </span>
    );
  return (
    <div className="space-y-2.5">
      {bar}
      {sealed ? (
        <p className="flex items-center gap-2 font-mono text-[12px] text-paper/80">
          <Lock /> Sides sealed
        </p>
      ) : (
        <p className="flex justify-between gap-4 font-mono text-[12px] text-paper/85 tabular-nums">
          <span>
            YES {tokens(y, 0)} ZC · {share}%
          </span>
          <span className="text-right">
            NO {tokens(n, 0)} ZC · {100 - share}%
          </span>
        </p>
      )}
      {children && <p className="font-mono text-[11px] leading-relaxed text-silver">{children}</p>}
    </div>
  );
}

function Lock() {
  return (
    <svg aria-hidden viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.2">
      <rect x="2" y="5.5" width="8" height="5.5" rx="1" />
      <path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" />
    </svg>
  );
}

/** The stop's drawing: a strongbox on the bridge, and a letter sealed with wax going in. The seal is green: sealing is what you do here. */
export function SealArt() {
  return (
    <svg viewBox="0 0 120 120" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 60 L36 50 L102 50 L88 60 Z" />
      <path d="M45 55 L45 14 L79 14 L79 55 Z" fill="var(--color-developer)" />
      <path d="M45 14 L62 28 L79 14" />
      <path d="M45 54 L57 40 M79 54 L67 40" strokeWidth="0.8" opacity="0.5" />
      <circle cx="62" cy="30" r="5.5" fill="var(--color-tap)" stroke="var(--color-tap)" />
      <path d="M59.6 29.2 l2.4 2.6 2.4 -2.6" stroke="var(--color-developer)" strokeWidth="1" />
      <path d="M41 55 L83 55" strokeWidth="2.2" />
      <path d="M22 60 L22 98 L88 98 L88 60 M88 98 L102 88 L102 50" />
      <path d="M26 64 L84 64" strokeWidth="0.8" opacity="0.5" />
      <circle cx="55" cy="77" r="3" />
      <path d="M55 80 L55 86" />
      <path d="M2 114 Q 60 98 118 114" strokeWidth="1" opacity="0.6" />
      <path d="M14 110 v-7 M30 106 v-7 M46 104 v-7 M74 104 v-7 M90 106 v-7 M106 110 v-7" strokeWidth="0.8" opacity="0.45" />
      <path d="M2 106 Q 60 90 118 106" strokeWidth="0.8" opacity="0.45" />
    </svg>
  );
}

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
    <Part title="Your stake" id="stake">
      {!address ? (
        <div className="space-y-5">
          <p className="max-w-[30em] text-[1.15rem] leading-snug">Connect a wallet to stake ZC on this market.</p>
          <Connect>Connect a wallet</Connect>
        </div>
      ) : chainId !== CHAIN_ID ? (
        <button type="button" onClick={() => switchChain({ chainId: CHAIN_ID })} className={button}>
          Switch to Ethereum
        </button>
      ) : staked === 0n ? (
        staking ? (
          <div className="space-y-8">
            <fieldset className="space-y-3">
              <legend className={label}>Your side</legend>
              <p className="-mt-1 flex items-center gap-2 text-[0.95rem] text-paper/70">
                <Lock /> Sealed on the chain until the market closes
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Card name="side" checked={side === YES} onChange={() => setSide(YES)} title="YES">
                  wins if it happens
                </Card>
                <Card name="side" checked={side === NO} onChange={() => setSide(NO)} title="NO">
                  wins if it does not
                </Card>
              </div>
            </fieldset>
            <label className="block space-y-1">
              <span className={`${label} block`}>
                ZC to stake {minStake.data !== undefined && <span className="tracking-[0.08em] normal-case">· at least {tokens(minStake.data, 0)}</span>}
              </span>
              <span className="flex items-baseline gap-3 border-b border-paper/30 transition-colors focus-within:border-paper">
                <input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="1000"
                  className="min-w-0 flex-1 border-0 bg-transparent px-0 py-2 text-[2rem] leading-tight tabular-nums text-paper placeholder:text-silver/60 focus:outline-none focus:ring-0"
                />
                <span aria-hidden className="font-mono text-sm text-silver">
                  ZC
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 text-[0.95rem] leading-snug text-paper/80">
              <input type="checkbox" checked={handOver} onChange={(e) => setHandOver(e.target.checked)} className="mt-0.5 size-[18px] shrink-0 accent-paper" />
              <span>
                Let the keeper reveal my side if I do not come back within 48 hours of close. The keeper then knows my side
                before the market closes.
              </span>
            </label>
            <div className="space-y-3">
              <button type="button" onClick={placeStake} disabled={busy || !side || !amount} className={`${button} w-full sm:w-auto`}>
                {busy ? note : `Stake ${amount || "…"} ZC on ${side ? SIDE[side] : "a side"}`}
              </button>
              <p className="font-mono text-[11px] leading-relaxed text-silver">After the market closes, you have 72 hours to reveal your side from this browser.</p>
            </div>
          </div>
        ) : (
          <p className="text-[1.15rem] italic text-paper/85">{settled ? "You did not stake in this market." : "Staking is closed."}</p>
        )
      ) : (
        <div className="space-y-6">
          <dl className="grid grid-cols-2 gap-x-6">
            <div className="space-y-1.5 border-l border-paper/20 pl-4">
              <dt className={label}>You staked</dt>
              <dd className="text-[clamp(1.6rem,3.4vw,2.2rem)] leading-none tabular-nums">
                {tokens(staked, 0)} <span className="font-mono text-sm text-silver">ZC</span>
              </dd>
            </div>
            <div className="space-y-1.5 border-l border-paper/20 pl-4">
              <dt className={label}>Your side</dt>
              <dd className="flex items-center gap-2 text-[clamp(1.6rem,3.4vw,2.2rem)] leading-none">
                {sideLabel ?? <span className="italic">Sealed</span>}
                {!revealed && (
                  <span className="text-silver">
                    <Lock />
                  </span>
                )}
              </dd>
            </div>
          </dl>
          {(revealed || staking) && <p className="text-[1.05rem] leading-snug">{revealed ? "Your side is revealed." : "Your side stays sealed until the market closes."}</p>}

          {revealing && !revealed &&
            (seal ? (
              <div className="space-y-4">
                <p className="text-[1.05rem] leading-snug">Reveal your side now. A side still sealed when the window ends counts as lost.</p>
                <button type="button" disabled={busy} className={button} onClick={() => run("Revealing…", () => write("reveal", [id, [address], [seal.side], [seal.salt]]))}>
                  {busy ? note : "Reveal my side"}
                </button>
              </div>
            ) : (
              <p className="text-[1.05rem] leading-snug">
                This browser does not hold your seal. Reveal from the device you staked on. If you handed the seal to the
                keeper, it reveals it 48 hours after close.
              </p>
            ))}

          {m.status === "open" && now >= m.revealEnds && (
            <p className="text-[1.05rem] leading-snug">{revealed ? "Waiting for the result." : "Your side was not revealed in time, so this stake counts as lost."}</p>
          )}

          {settled &&
            (claimed ? (
              <p className="text-[1.05rem] italic">Claimed.</p>
            ) : m.refund ? (
              <button type="button" disabled={busy} className={button} onClick={() => run("Claiming…", () => write("claim", [id]))}>
                {busy ? note : `Take back ${tokens(staked, 0)} ZC`}
              </button>
            ) : revealed === (m.status === "yes" ? YES : NO) ? (
              <button type="button" disabled={busy} className={button} onClick={() => run("Claiming…", () => write("claim", [id]))}>
                {busy ? note : "Claim your winnings"}
              </button>
            ) : revealed === 0 ? (
              <p className="text-[1.05rem] leading-snug">Your side was never revealed, so it counts as lost.</p>
            ) : (
              <p className="text-[1.05rem] leading-snug">Your side did not win this one.</p>
            ))}

          {seal && !revealed && now < m.revealEnds && m.status === "open" && (
            <button
              type="button"
              disabled={busy}
              className={`${quiet} block min-h-11 text-left font-mono text-[12px] disabled:opacity-50`}
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
          // the claim of a stake is the green one when both show
          className={staked > 0n && !claimed ? `${second} min-h-11` : button}
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
        <p role="alert" className="border-l-2 border-paper pl-3 text-[0.95rem] leading-snug">
          {error}
        </p>
      )}
    </Part>
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
  const field = `${line} font-mono text-base`;

  return (
    <div className="space-y-10">
      <form onSubmit={(e) => e.preventDefault()}>
        <fieldset disabled={busy} className="space-y-10">
          <Part title="1 · What it asks" id="kind">
            <fieldset className="space-y-3">
              <legend className="sr-only">Kind</legend>
              <div className="grid grid-cols-2 gap-3">
                <Card name="kind" checked={kind === "event"} onChange={() => setKind("event")} title="Event">
                  answered on Reality.eth
                </Card>
                <Card name="kind" checked={kind === "price"} onChange={() => setKind("price")} title="Price">
                  read from Chainlink
                </Card>
              </div>
            </fieldset>

            {kind === "event" ? (
              <div className="space-y-8 pt-2">
                <label className="block space-y-2">
                  <span className={`${label} block`}>Question</span>
                  <textarea
                    value={title}
                    rows={3}
                    maxLength={280}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Will the Fed cut rates at its December meeting? Source: federalreserve.gov"
                    className={`${line} resize-none text-[1.45rem] leading-snug`}
                  />
                  <span className="block text-[0.95rem] leading-snug text-paper/70">
                    A yes/no question with the source that will decide it. Answerers on Reality.eth read only this text.
                  </span>
                  {titleProblem && (
                    <span role="status" className="block border-l-2 border-paper pl-3 text-[0.95rem]">
                      {titleProblem[0].toUpperCase() + titleProblem.slice(1)}.
                    </span>
                  )}
                </label>
                <Choice legend="Topic" hint="Where it shows when people filter by topic.">
                  {TOPICS.map((t) => (
                    <Pill key={t} name="topic" checked={topic === t} onChange={() => setTopic(t)}>
                      {t}
                    </Pill>
                  ))}
                </Choice>
              </div>
            ) : (
              <div className="space-y-8 pt-2">
                <Choice legend="Feed" hint="Chainlink, 8 decimals.">
                  {(Object.keys(FEEDS) as (keyof typeof FEEDS)[]).map((f) => (
                    <Pill key={f} name="feed" checked={feed === f} onChange={() => setFeed(f)}>
                      {f}
                    </Pill>
                  ))}
                </Choice>
                <label className="block space-y-1">
                  <span className={`${label} block`}>YES at or above, in $</span>
                  <span className="flex items-baseline gap-2 border-b border-paper/30 transition-colors focus-within:border-paper">
                    <span aria-hidden className="text-[1.6rem] text-silver">
                      $
                    </span>
                    <input
                      inputMode="decimal"
                      value={above}
                      onChange={(e) => setAbove(e.target.value.replace(/[^0-9.]/g, ""))}
                      placeholder="5000"
                      className="min-w-0 flex-1 border-0 bg-transparent px-0 py-2 text-[1.6rem] tabular-nums text-paper placeholder:text-silver/60 focus:outline-none focus:ring-0"
                    />
                  </span>
                </label>
              </div>
            )}
          </Part>

          <Part title="2 · When" id="when">
            <div className="grid gap-x-6 gap-y-7 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className={`${label} block`}>Staking closes</span>
                <input type="datetime-local" value={closes} onChange={(e) => setCloses(e.target.value)} className={field} />
              </label>
              <label className="block space-y-1">
                <span className={`${label} block`}>{kind === "price" ? "Price is read at" : "Question opens at"}</span>
                <input type="datetime-local" value={resolves} onChange={(e) => setResolves(e.target.value)} className={field} />
              </label>
            </div>
            {kind === "event" && (
              <p className="text-[0.95rem] leading-snug text-paper/70">
                The question opens after the outcome is known. An answer given before then is &quot;too soon&quot; and the
                question has to be asked again.
              </p>
            )}
            <p className="font-mono text-[11px] leading-relaxed text-silver">Times are in your own time zone. Staking closes at least an hour from now.</p>
            {kind === "event" && (
              <label className="block space-y-1 pt-2">
                <span className={`${label} block`}>
                  Bounty for answerers, in ETH <span className="tracking-[0.08em] normal-case">· optional</span>
                </span>
                <input inputMode="decimal" value={bounty} onChange={(e) => setBounty(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" className={field} />
              </label>
            )}
          </Part>
        </fieldset>
      </form>

      <Part title="3 · Lock and open" id="receipt">
        <div className="space-y-1.5 border-l border-paper/20 pl-4">
          <p className={label}>SC locked</p>
          <p className="text-[clamp(1.9rem,4vw,2.6rem)] leading-none tabular-nums">{lock.data !== undefined ? tokens(lock.data, 0) : "·"}</p>
          {lockUsd !== null && <p className="font-mono text-[11px] text-silver">≈ {usd(lockUsd)}</p>}
        </div>
        <dl className="[&>div+div]:border-t [&>div+div]:border-dashed [&>div+div]:border-paper/20">
          <Row k="Closes">{toUnix(closes) ? utcStamp(toUnix(closes)) : "·"}</Row>
          <Row k={kind === "price" ? "Price read" : "Opens"}>{toUnix(resolves) ? utcStamp(toUnix(resolves)) : "·"}</Row>
          <Row k="Fee">2% of a pool with a winner</Row>
        </dl>
        <p className="max-w-[34em] text-[0.95rem] leading-snug text-paper/75">
          The SC comes back to you when the market settles YES or NO. If the answer is that the question is invalid, it
          goes to the treasury.
        </p>
        <div className="pt-1">
          {!address ? (
            <Connect>Connect a wallet</Connect>
          ) : chainId !== CHAIN_ID ? (
            <button type="button" onClick={() => switchChain({ chainId: CHAIN_ID })} className={button}>
              Switch to Ethereum
            </button>
          ) : (
            <button type="button" onClick={open} disabled={busy} className={`${button} w-full sm:w-auto`}>
              {busy ? note : "Lock SC and open"}
            </button>
          )}
        </div>
        {error && (
          <p role="alert" className="border-l-2 border-paper pl-3 text-[0.95rem] leading-snug">
            {error}
          </p>
        )}
      </Part>
    </div>
  );
}
