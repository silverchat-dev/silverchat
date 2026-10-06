"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { english, generateMnemonic } from "viem/accounts";
import { formatUnits, isAddress, parseUnits, type Address, type Hex } from "viem";
import { useAccount, useSendTransaction, useSignMessage, useSwitchChain } from "wagmi";

import { Rail, StepPart, pill, said, small, warn } from "@/components/fork";
import { Part, action, field, label } from "@/components/journal";
import { short } from "@/lib/format";
import type { Buckets, Prepared, Sender, Via } from "@/lib/cash/actions";
import type { Opened } from "@/lib/cash/engine";
import type { Coin } from "@/lib/cash/routes";

const COINS: [Coin, string][] = [
  ["sc", "$SC"],
  ["zc", "$ZC"],
  ["eth", "ETH"],
];
const name = (c: Coin) => COINS.find(([k]) => k === c)![1];
const fmt = (wei: bigint | undefined) => (wei ? Number(formatUnits(wei, 18)).toLocaleString("en-US", { maximumFractionDigits: wei < 10n ** 18n ? 6 : 2 }) : "0");
const input = `${field} font-mono !text-base`;
const button = action;
const quiet = small;

// the way through, in four steps; the last three are the open wallet's tabs
const STEPS = [{ name: "Wallet" }, { name: "Deposit" }, { name: "Swap" }, { name: "Withdraw" }];
const TABS = ["deposit", "swap", "withdraw"] as const;
const TITLES = { deposit: "Deposit into it", swap: "Swap inside it", withdraw: "Withdraw to a fresh wallet" };
const NEXT = {
  deposit: "Next: after about an hour of checks, swap inside or withdraw.",
  swap: "Next: once the result has waited its hour, withdraw to a fresh wallet.",
  withdraw: "The last step. A fresh wallet keeps the two ends apart.",
};

/** Step 1 of the way through, before the wallet is open. */
function First({ title = "Make your private wallet", children }: { title?: string; children: ReactNode }) {
  return (
    <>
      <Part title="The way through">
        <Rail steps={STEPS} at={0} done={0} next="Next: deposit coins into it." />
      </Part>
      <StepPart n={1} of={STEPS.length} title={title} state="now" id="cash-step-1">
        {children}
      </StepPart>
    </>
  );
}

type Stage = "loading" | "busy-tab" | "none" | "locked" | "open" | "failed";
// whether this tab holds SilverCash's lock; module-wide, so it outlives one visit to the page
let lockHeld = false;

/** SilverCash: a private Railgun wallet in this browser. Deposit, swap privately, withdraw to a fresh wallet. */
export function Cash() {
  const [stage, setStage] = useState<Stage>("loading");
  const [opened, setOpened] = useState<Opened | null>(null);
  const [error, setError] = useState<string | null>(null);

  // one tab at a time: two engines on one IndexedDB would trip over each other. The engine lives as long as the tab,
  // so the lock does too, and coming back to this page in the same tab finds it already held here
  useEffect(() => {
    let cancelled = false;
    const open = async () => {
      const { engine, saved } = await import("@/lib/cash/engine");
      try {
        await engine();
        if (!cancelled) setStage(saved() ? "locked" : "none");
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setStage("failed");
        }
      }
    };
    // a page that just closed (or a reload) lets go of the lock a moment later, so ask a few times; a retry may find
    // that this tab got it meanwhile (a page mounted twice in a row)
    const ask = (tries: number): Promise<unknown> => {
      if (lockHeld) return open();
      return navigator.locks.request("silvercash", { ifAvailable: true }, async (lock) => {
        if (!lock) {
          if (tries > 0) setTimeout(() => void ask(tries - 1).catch(() => setStage("failed")), 600);
          else if (!cancelled) setStage("busy-tab");
          return;
        }
        lockHeld = true;
        await open();
        await new Promise<never>(() => {});
      });
    };
    ask(2).catch(() => setStage("failed"));
    return () => {
      cancelled = true;
    };
  }, []);

  if (stage === "loading")
    return (
      <First>
        <p role="status" className="font-mono text-sm text-silver motion-safe:animate-pulse">Starting the private engine in this browser…</p>
      </First>
    );
  if (stage === "busy-tab")
    return (
      <First>
        <p className="text-lg text-paper/80">SilverCash is open in another tab. Use that one, or close it and reload this page.</p>
      </First>
    );
  if (stage === "failed")
    return (
      <First>
        <p className="text-lg text-paper/80">The private engine could not start here: {error}. Try a desktop browser.</p>
      </First>
    );
  if (stage === "none")
    return (
      <First>
        <NewWallet onOpen={(o) => (setOpened(o), setStage("open"))} />
      </First>
    );
  if (stage === "locked" || !opened)
    return (
      <First title="Open your private wallet">
        <Unlock onOpen={(o) => (setOpened(o), setStage("open"))} onForget={() => setStage("none")} />
      </First>
    );
  return <Wallet o={opened} onLock={() => (setOpened(null), setStage("locked"))} onForget={() => (setOpened(null), setStage("none"))} />;
}

// ---- making, restoring and opening the private wallet

function NewWallet({ onOpen }: { onOpen: (o: Opened) => void }) {
  const [mode, setMode] = useState<"new" | "restore">("new");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [words, setWords] = useState("");
  const [block, setBlock] = useState("");
  const [fresh, setFresh] = useState<{ words: string; o: Opened; block: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function make() {
    setError(null);
    if (pw.length < 10) return setError("Use a password of at least 10 characters. It encrypts the wallet in this browser.");
    if (pw !== pw2) return setError("The two passwords are not the same.");
    setBusy(true);
    try {
      const { createWallet } = await import("@/lib/cash/engine");
      const { chainClient } = await import("@/lib/cash/actions");
      if (mode === "new") {
        const phrase = generateMnemonic(english);
        // a new wallet has nothing before today, so scanning starts at the current block
        const now = Number(await chainClient.getBlockNumber());
        setFresh({ words: phrase, o: await createWallet(pw, phrase, now), block: now });
      } else {
        const phrase = words.trim().toLowerCase().split(/\s+/).join(" ");
        if (phrase.split(" ").length !== 12 && phrase.split(" ").length !== 24) throw new Error("the words: 12 or 24, separated by spaces");
        onOpen(await createWallet(pw, phrase, block ? Number(block) : undefined));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (fresh) return <Backup words={fresh.words} block={fresh.block} onDone={() => onOpen(fresh.o)} />;

  return (
    <div className="max-w-xl space-y-6">
      <div role="group" aria-label="Wallet" className="flex flex-wrap gap-2">
        {(["new", "restore"] as const).map((m) => (
          <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={pill}>
            {m === "new" ? "New private wallet" : "Restore from words"}
          </button>
        ))}
      </div>
      <p className={mode === "new" ? warn : "leading-relaxed text-paper/80"}>
        {mode === "new"
          ? "SilverCash makes a private Railgun wallet with its own 12 words. They are the only way back to what it holds: write them down. The password only locks it in this browser."
          : "The 12 or 24 words of a Railgun wallet: one made here, in Railway or in any Railgun wallet."}
      </p>
      {mode === "restore" && (
        <>
          <label className="block space-y-1">
            <span className={label}>Your words</span>
            <textarea aria-label="Your words" value={words} onChange={(e) => setWords(e.target.value)} rows={3} placeholder="the words, in order" className={`${input} resize-none`} autoComplete="off" spellCheck={false} />
          </label>
          <label className="block space-y-1">
            <span className={label}>Block it was made at · optional, faster</span>
            <input aria-label="Block it was made at" value={block} onChange={(e) => setBlock(e.target.value.replace(/\D/g, ""))} placeholder="the block it was made at (optional, faster)" className={input} inputMode="numeric" />
          </label>
        </>
      )}
      <label className="block space-y-1">
        <span className={label}>Password for this browser</span>
        <input aria-label="Password for this browser" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="at least 10 characters" className={input} autoComplete="new-password" />
      </label>
      <label className="block space-y-1">
        <span className={label}>The same password again</span>
        <input aria-label="The same password again" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="the same password again" className={input} autoComplete="new-password" />
      </label>
      <button type="button" onClick={make} disabled={busy} className={button}>
        {busy ? "Working…" : mode === "new" ? "Make my private wallet" : "Restore"}
      </button>
      {error && <p role="alert" className={said}>{error}</p>}
    </div>
  );
}

/** The words, once, then three of them typed back, so nobody skips writing them down. */
function Backup({ words, block, onDone }: { words: string; block: number; onDone: () => void }) {
  const list = words.split(" ");
  const [asked] = useState(() => {
    const picks = new Set<number>();
    const r = crypto.getRandomValues(new Uint32Array(8));
    for (const x of r) if (picks.size < 3) picks.add(x % list.length);
    return [...picks].sort((a, b) => a - b);
  });
  const [shown, setShown] = useState(true);
  const [typed, setTyped] = useState<string[]>(["", "", ""]);
  const right = asked.every((i, k) => typed[k].trim().toLowerCase() === list[i]);

  return (
    <div className="max-w-xl space-y-6">
      {shown ? (
        <>
          <h3 className="text-[1.3rem] leading-tight">Your 12 words</h3>
          <ol className="grid grid-cols-2 gap-x-6 gap-y-2.5 rounded-lg bg-tray/70 px-5 py-5 font-mono text-[15px] sm:grid-cols-3">
            {list.map((w, i) => (
              <li key={i} className="grid grid-cols-[1.6rem_minmax(0,1fr)] items-baseline border-b border-dashed border-paper/20 pb-1.5">
                <span className="text-[11px] text-silver tabular-nums">{i + 1}.</span> {w}
              </li>
            ))}
          </ol>
          <p className="font-mono text-xs text-silver">Made at block {block.toLocaleString("en-US")}. Note it with the words: restoring is faster with it.</p>
          <p className={warn}>Write them on paper, in order. Anyone with them can take what this wallet holds; without them, a cleared browser loses it.</p>
          <button type="button" onClick={() => setShown(false)} className={button}>
            I wrote them down
          </button>
        </>
      ) : (
        <>
          <h3 className="text-[1.3rem] leading-tight">Check three of them</h3>
          {asked.map((i, k) => (
            <label key={i} className="block space-y-1">
              <span className={label}>Word {i + 1}</span>
              <input value={typed[k]} onChange={(e) => setTyped((t) => t.map((x, j) => (j === k ? e.target.value : x)))} className={input} autoComplete="off" spellCheck={false} />
            </label>
          ))}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <button type="button" onClick={onDone} disabled={!right} className={button}>
              Open SilverCash
            </button>
            <button type="button" onClick={() => setShown(true)} className={quiet}>
              Show the words again
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Unlock({ onOpen, onForget }: { onOpen: (o: Opened) => void; onForget: () => void }) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setError(null);
    try {
      const { unlock } = await import("@/lib/cash/engine");
      onOpen(await unlock(pw));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={(e) => (e.preventDefault(), go())} className="max-w-md space-y-6">
      <p className="leading-relaxed text-paper/80">Your private wallet is in this browser, locked.</p>
      {/* for password managers: they file a password under a username */}
      <input type="text" name="username" autoComplete="username" value="silvercash" readOnly hidden />
      <label className="block space-y-1">
        <span className={label}>Password</span>
        <input aria-label="Password" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="password" className={input} autoComplete="current-password" autoFocus />
      </label>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <button type="submit" disabled={busy || !pw} className={button}>
          {busy ? "Opening…" : "Unlock"}
        </button>
        <button
          type="button"
          onClick={async () => {
            if (!confirm("Remove the wallet in this browser? Without its 12 words, what it holds is gone.")) return;
            await (await import("@/lib/cash/engine")).forgetSaved();
            onForget();
          }}
          className={quiet}
        >
          Use other words instead
        </button>
      </div>
      {error && <p role="alert" className={said}>{error}</p>}
    </form>
  );
}

// ---- the open wallet

function useSender(): Sender | null {
  const { address, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { sendTransactionAsync } = useSendTransaction();
  const { switchChainAsync } = useSwitchChain();
  return useMemo(
    () =>
      address
        ? {
            address,
            sign: (message: string) => signMessageAsync({ message }),
            send: async (tx) => {
              // SilverCash is mainnet only, whatever chain the rest of the site runs on
              if (chainId !== 1) await switchChainAsync({ chainId: 1 });
              return sendTransactionAsync({ ...tx, chainId: 1 });
            },
          }
        : null,
    [address, chainId, signMessageAsync, sendTransactionAsync, switchChainAsync],
  );
}

function Wallet({ o, onLock, onForget }: { o: Opened; onLock: () => void; onForget: () => void }) {
  const [b, setB] = useState<Buckets>({ spendable: {}, waiting: {}, blocked: {} });
  const [scan, setScan] = useState(0);
  const [synced, setSynced] = useState(false);
  const [minutes, setMinutes] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  const [peers, setPeers] = useState("starting");
  const [tab, setTab] = useState<"deposit" | "swap" | "withdraw">("deposit");
  const [words, setWords] = useState<string | null>(null);

  useEffect(() => {
    const t0 = Date.now();
    const tick = setInterval(() => setMinutes(Math.floor((Date.now() - t0) / 60_000)), 15_000);
    import("@/lib/cash/actions")
      .then(({ watch }) => watch(o, setB, setScan))
      .then(() => setSynced(true))
      .catch((e) => setFailed(e instanceof Error ? e.message.split("\n")[0] : String(e)))
      .finally(() => clearInterval(tick));
    // join the broadcasters' network now: their fee offers take a while to arrive
    import("@/lib/cash/broadcast")
      .then(({ broadcasters }) => broadcasters(setPeers))
      .catch(() => setPeers("unavailable"));
    return () => clearInterval(tick);
  }, [o]);

  // the opened wallet starts at the top of the way through, not where the setup left the page
  useEffect(() => {
    document.getElementById("cash-way")?.scrollIntoView({ block: "start" });
  }, []);

  return (
    <>
      <Part title="The way through" id="cash-way">
        <Rail steps={STEPS} at={TABS.indexOf(tab) + 1} done={1} pick={(i) => setTab(TABS[i - 1])} next={NEXT[tab]} />
      </Part>

      <StepPart n={TABS.indexOf(tab) + 2} of={STEPS.length} title={TITLES[tab]} state="now" id={`cash-step-${TABS.indexOf(tab) + 2}`}>
        {tab === "deposit" && <Deposit o={o} />}
        {tab !== "deposit" && !synced && <p className="leading-relaxed text-paper/80">Swapping and withdrawing open once the records are read.</p>}
        {tab === "swap" && synced && <Swap o={o} spendable={b.spendable} />}
        {tab === "withdraw" && synced && <Withdraw o={o} spendable={b.spendable} />}
      </StepPart>

      <Part title="Your private balance" more={!synced && !failed ? <span className="text-silver tabular-nums">{Math.round(scan * 100)}%</span> : null}>
        {failed && <p role="alert" className={said}>Reading Railgun&apos;s records stopped: {failed}. Reload the page to try again.</p>}
        {!synced && !failed && (
          <div className="space-y-2.5">
            <span aria-hidden className="block h-1 overflow-hidden rounded-full bg-paper/12">
              <span className="block h-full rounded-full bg-paper/60 transition-[width] duration-700 motion-reduce:transition-none" style={{ width: `${Math.round(scan * 100)}%` }} />
            </span>
            <p role="status" className="max-w-xl font-mono text-xs leading-relaxed text-silver">
              Reading Railgun&apos;s records… {Math.round(scan * 100)}%{minutes > 0 && ` · ${minutes} min`}. The first time in a browser
              this takes about 10 minutes; keep the tab open. After that it takes seconds. You can deposit now.
            </p>
          </div>
        )}
        <div>
          <div className={`${label} flex justify-between pb-2`}>
            <span>Coin</span>
            <span>Spendable</span>
          </div>
          <ul className="ruled border-y border-paper/20">
            {COINS.map(([c, label]) => (
              <li key={c} className="flex items-baseline justify-between gap-4 py-3.5">
                <span className="font-mono text-sm">{c === "eth" ? <>ETH<span className="text-silver"> (as WETH)</span></> : label}</span>
                <span className="text-right">
                  <span className="block text-[1.75rem] leading-none tabular-nums">{fmt(b.spendable[c])}</span>
                  <span className="mt-1.5 block font-mono text-[11px] text-silver tabular-nums">
                    waiting {fmt(b.waiting[c])} · blocked {fmt(b.blocked[c])}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="max-w-[36em] text-[0.95rem] leading-relaxed text-paper/75">
          <span className="font-mono text-xs uppercase tracking-[0.12em] text-silver">Waiting</span>: every deposit, and every swap&apos;s
          result, waits about an hour while Railgun checks it against lists of stolen and sanctioned funds.{" "}
          <span className="font-mono text-xs uppercase tracking-[0.12em] text-silver">Blocked</span>: funds those lists caught; they can
          only go back to where they came from.
        </p>
      </Part>

      <Part title="Your private wallet">
        <div className="space-y-2">
          <p className={label}>Your private address</p>
          <p className="font-mono text-sm leading-relaxed break-all">{o.address}</p>
          <p className="font-mono text-xs text-silver">Broadcasters: {peers.toLowerCase()}</p>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <button type="button" onClick={async () => setWords(words ? null : await (await import("@/lib/cash/engine")).wordsOf(o))} className={quiet}>
            {words ? "Hide my words" : "Show my words"}
          </button>
          <button type="button" onClick={onLock} className={quiet}>
            Lock
          </button>
          <button
            type="button"
            onClick={async () => {
              if (!confirm("Remove this wallet from this browser? Without its 12 words, what it holds is gone.")) return;
              await (await import("@/lib/cash/engine")).forget(o);
              onForget();
            }}
            className={quiet}
          >
            Remove from this browser
          </button>
        </div>
        {words && <p className="rounded-lg bg-tray/70 p-4 font-mono text-sm leading-relaxed">{words}</p>}
      </Part>
    </>
  );
}

function CoinPicker({ value, onChange, label: title }: { value: Coin; onChange: (c: Coin) => void; label: string }) {
  return (
    <div className="space-y-2">
      <p aria-hidden className={label}>
        {title}
      </p>
      <div role="group" aria-label={title} className="flex flex-wrap gap-2">
        {COINS.map(([c, n]) => (
          <button key={c} type="button" aria-pressed={value === c} onClick={() => onChange(c)} className={pill}>
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

/** An amount field with its label over it. */
function Amount({ caption, ...props }: { caption: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block space-y-1">
      <span className={label}>{caption}</span>
      <input {...props} className={input} />
    </label>
  );
}

const amountOf = (s: string) => {
  try {
    return s.trim() ? parseUnits(s.trim(), 18) : 0n;
  } catch {
    return -1n;
  }
};

function Deposit({ o }: { o: Opened }) {
  const sender = useSender();
  const [coin, setCoin] = useState<Coin>("sc");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const wei = amountOf(amount);

  async function go() {
    if (!sender || wei <= 0n) return;
    setBusy(true);
    try {
      const { deposit } = await import("@/lib/cash/actions");
      const hash: Hex = await deposit(o, sender, coin, wei, setNote);
      setNote(`Sent: ${short(hash)}. It shows here as waiting once mined, and spendable about an hour later.`);
    } catch (e) {
      setNote(e instanceof Error ? e.message.split("\n")[0] : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <p className="leading-relaxed text-paper/80">
        From your public wallet into your private one. The deposit itself is public on Ethereum; what you do after it is not.
        Railgun keeps 0.25% of it.
      </p>
      {!sender ? (
        <ConnectButton label="Connect the wallet to deposit from" />
      ) : (
        <>
          <CoinPicker value={coin} onChange={setCoin} label="Coin" />
          <Amount caption="Amount" aria-label="Amount to deposit" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`amount of ${name(coin)}`} inputMode="decimal" />
          <p className="text-[0.95rem] leading-relaxed text-paper/70">
            <span className={`${label} mr-2`}>Tip</span>
            Also deposit about 0.03 ETH. Broadcasters take the gas of private swaps and withdrawals from it, so you never have to
            send them from a public wallet.
          </p>
          <button type="button" onClick={go} disabled={busy || wei <= 0n} className={button}>
            {busy ? "Depositing…" : `Deposit ${name(coin)}`}
          </button>
        </>
      )}
      {note && <p role="status" className={said}>{note}</p>}
    </div>
  );
}

/**
 * How a private transaction goes out, and the two steps every one takes: review (estimate the gas and, for a
 * broadcaster, its fee, and check the fee fits the private WETH) then confirm (prove in this browser and send).
 */
function usePrivateSend(relayAdapt: boolean, spendable: Partial<Record<Coin, bigint>>, inputs: string, done: (hash: string) => string) {
  const sender = useSender();
  const [mode, setMode] = useState<"broadcaster" | "self">("broadcaster");
  // a review holds for the inputs it was made for; change any and it is gone
  const [reviewed, setReviewed] = useState<{ p: Prepared; inputs: string } | null>(null);
  const ready = reviewed?.inputs === inputs ? reviewed.p : null;
  const setReady = (p: Prepared | null) => setReviewed(p ? { p, inputs } : null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** `ethUsed` is how much private WETH the transaction itself spends, to add to the broadcaster's fee. */
  async function review(make: (via: Via) => Promise<Prepared>, ethUsed: bigint) {
    setBusy(true);
    setReady(null);
    setNote("Estimating…");
    try {
      let via: Via;
      if (mode === "self") {
        if (!sender) throw new Error("connect a wallet to send it yourself");
        via = { kind: "self", sender };
      } else {
        const { viaBroadcaster } = await import("@/lib/cash/broadcast");
        const found = await viaBroadcaster(relayAdapt);
        if (!found) throw new Error("no broadcaster online takes WETH right now; try again in a minute, or send it yourself");
        via = found;
      }
      const p = await make(via);
      if (p.fee !== null && p.fee + ethUsed > (spendable.eth ?? 0n)) {
        throw new Error(`the broadcaster takes ${fmt(p.fee)} WETH and you have ${fmt(spendable.eth)} spendable${ethUsed ? " beside this amount" : ""}; deposit more ETH or lower the amount`);
      }
      setReady(p);
      setNote(null);
    } catch (e) {
      setNote(e instanceof Error ? e.message.split("\n")[0] : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!ready) return;
    setBusy(true);
    try {
      const hash = await ready.go((p) => setNote(`Proving in this browser… ${Math.round(p)}%`));
      setNote(done(hash));
      setReady(null);
    } catch (e) {
      setNote(e instanceof Error ? e.message.split("\n")[0] : String(e));
    } finally {
      setBusy(false);
    }
  }

  const panel = (
    <>
      <fieldset className="space-y-1">
        <legend className={`${label} mb-2`}>Send it</legend>
        <label className="grid min-h-11 cursor-pointer grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-x-2 py-1.5 leading-snug">
          <input type="radio" className="mt-1 size-4 accent-tap" checked={mode === "broadcaster"} onChange={() => (setMode("broadcaster"), setReady(null))} />
          <span>By a Railgun broadcaster, paid from your private WETH. Private.</span>
        </label>
        <label className="grid min-h-11 cursor-pointer grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-x-2 py-1.5 leading-snug">
          <input type="radio" className="mt-1 size-4 accent-tap" checked={mode === "self"} onChange={() => (setMode("self"), setReady(null))} />
          <span>From my connected wallet. It pays the gas, and the transaction is linked to it.</span>
        </label>
        {mode === "self" && !sender && <ConnectButton label="Connect a wallet" />}
      </fieldset>
      {ready && (
        <div className="space-y-4 border-l-[3px] border-tap pl-4">
          <p className={label}>Review</p>
          <p className="leading-relaxed">
            {ready.fee === null
              ? "Your connected wallet pays the gas for this one."
              : `The broadcaster takes ${fmt(ready.fee)} WETH from your private balance for the gas.`}{" "}
            Proving takes up to a minute; keep the tab open.
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <button type="button" className={button} disabled={busy} onClick={confirm}>
              Confirm
            </button>
            <button type="button" className={quiet} onClick={() => setReady(null)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {note && <p role="status" className={said}>{note}</p>}
    </>
  );
  return { review, panel, ready, busy };
}

function Swap({ o, spendable }: { o: Opened; spendable: Partial<Record<Coin, bigint>> }) {
  const [from, setFrom] = useState<Coin>("sc");
  const [to, setTo] = useState<Coin>("eth");
  const [amount, setAmount] = useState("");
  const [slip, setSlip] = useState(2);
  const wei = amountOf(amount);
  const send = usePrivateSend(true, spendable, `${from}>${to}:${wei}:${slip}`, (h) => `Sent: ${short(h)}. Your ${name(to)} shows as waiting, then spendable about an hour after it is mined.`);

  // what comes back: Railgun's withdrawal fee off the amount in, the pools' price, Railgun's deposit fee off the result
  const quoted = useQuery({
    queryKey: ["cashQuote", from, to, wei.toString()],
    enabled: wei > 0n && from !== to,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { quote, railgunFees } = await import("@/lib/cash/actions");
      const { afterFee } = await import("@/lib/cash/routes");
      const fees = await railgunFees();
      return afterFee(await quote(from, to, afterFee(wei, fees.unshield)), fees.shield);
    },
  });
  const out = quoted.data ?? null;

  async function review() {
    if (out === null || wei <= 0n) return;
    const { prepareSwap, railgunFees } = await import("@/lib/cash/actions");
    // the minimum is checked by the router before Railgun's deposit fee, so it is set on the amount before that fee
    const before = (out * 10_000n) / (10_000n - (await railgunFees()).shield);
    const min = (before * BigInt(100 - slip)) / 100n;
    await send.review((via) => prepareSwap(o, via, from, to, wei, min), from === "eth" ? wei : 0n);
  }

  return (
    <div className="max-w-xl space-y-6">
      <p className="leading-relaxed text-paper/80">
        Inside Railgun, through the same $SC and $ZC pools as the rest of Silverchat. Railgun keeps 0.25% going out of your
        balance and 0.25% coming back in. The swap&apos;s coins and amounts are public; who made it is not. If the price
        moves past your slippage, the coins come back to your balance instead.
      </p>
      <CoinPicker value={from} onChange={(c) => (setFrom(c), c === to && setTo(from))} label="From" />
      <Amount caption="Amount" aria-label="Amount to swap" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`amount of ${name(from)}, ${fmt(spendable[from])} spendable`} inputMode="decimal" />
      <CoinPicker value={to} onChange={(c) => (setTo(c), c === from && setFrom(to))} label="To" />
      <div className="space-y-1.5 border-l border-paper/20 pl-4">
        <p className={label}>You get back</p>
        <p aria-live="polite" className="text-[1.6rem] leading-tight tabular-nums">
          {out === null ? <span className="text-silver">·</span> : `about ${fmt(out)} ${name(to)} back, after Railgun's fees`}
        </p>
      </div>
      <div role="group" aria-label="Slippage" className="flex flex-wrap items-center gap-2">
        <span className={`${label} mr-1`}>Slippage</span>
        {[1, 2, 5].map((x) => (
          <button key={x} type="button" aria-pressed={slip === x} onClick={() => setSlip(x)} className={pill}>
            {x}%
          </button>
        ))}
      </div>
      {send.panel}
      {!send.ready && (
        <button type="button" onClick={review} disabled={send.busy || out === null || wei <= 0n || wei > (spendable[from] ?? 0n)} className={button}>
          {send.busy ? "Working…" : "Review the swap"}
        </button>
      )}
    </div>
  );
}

function Withdraw({ o, spendable }: { o: Opened; spendable: Partial<Record<Coin, bigint>> }) {
  const { address } = useAccount();
  const [coin, setCoin] = useState<Coin>("eth");
  const [amount, setAmount] = useState("");
  const [to, setTo] = useState("");
  const wei = amountOf(amount);
  const send = usePrivateSend(coin === "eth", spendable, `${coin}:${wei}:${to}`, (h) => `Sent: ${short(h)}.`);
  const own = !!address && to.toLowerCase() === address.toLowerCase();

  async function review() {
    if (!isAddress(to) || wei <= 0n) return;
    const { prepareWithdraw } = await import("@/lib/cash/actions");
    await send.review((via) => prepareWithdraw(o, via, coin, wei, to as Address), coin === "eth" ? wei : 0n);
  }

  return (
    <div className="max-w-xl space-y-6">
      <p className="leading-relaxed text-paper/80">To any address, best a fresh one. Railgun keeps 0.25%. ETH comes out as ETH.</p>
      <CoinPicker value={coin} onChange={setCoin} label="Coin" />
      <Amount caption="Amount" aria-label="Amount to withdraw" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`amount of ${name(coin)}, ${fmt(spendable[coin])} spendable`} inputMode="decimal" />
      <Amount caption="Send to" aria-label="Address to send to" value={to} onChange={(e) => setTo(e.target.value.trim())} placeholder="0x… the address to send to" spellCheck={false} />
      {own && <p role="alert" className={warn}>That is your connected wallet: withdrawing there links it to this balance.</p>}
      {send.panel}
      {!send.ready && (
        <button type="button" onClick={review} disabled={send.busy || !isAddress(to) || wei <= 0n || wei > (spendable[coin] ?? 0n)} className={button}>
          {send.busy ? "Working…" : `Review the withdrawal`}
        </button>
      )}
    </div>
  );
}
