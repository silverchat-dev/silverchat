"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { english, generateMnemonic } from "viem/accounts";
import { formatUnits, isAddress, parseUnits, type Address, type Hex } from "viem";
import { useAccount, useSendTransaction, useSignMessage, useSwitchChain } from "wagmi";

import { short } from "@/lib/format";
import type { Buckets, Sender, Via } from "@/lib/cash/actions";
import type { Opened } from "@/lib/cash/engine";
import type { Coin } from "@/lib/cash/routes";

const COINS: [Coin, string][] = [
  ["sc", "$SC"],
  ["zc", "$ZC"],
  ["eth", "ETH"],
];
const name = (c: Coin) => COINS.find(([k]) => k === c)![1];
const fmt = (wei: bigint | undefined) => (wei ? Number(formatUnits(wei, 18)).toLocaleString("en-US", { maximumFractionDigits: wei < 10n ** 18n ? 6 : 2 }) : "0");
const input = "w-full border border-paper/25 bg-transparent px-3 py-2 font-mono text-sm text-paper placeholder:text-silver/60 focus:border-paper focus:outline-none";
const button = "bg-paper px-5 py-2.5 font-mono text-sm text-developer hover:brightness-105 disabled:opacity-40";
const quiet = "font-mono text-xs text-silver underline-offset-4 hover:text-paper hover:underline";

type Stage = "loading" | "busy-tab" | "none" | "locked" | "open" | "failed";

/** SilverCash: a private Railgun wallet in this browser. Deposit, swap privately, withdraw to a fresh wallet. */
export function Cash() {
  const [stage, setStage] = useState<Stage>("loading");
  const [opened, setOpened] = useState<Opened | null>(null);
  const [error, setError] = useState<string | null>(null);

  // one tab at a time: two engines on one IndexedDB would trip over each other
  useEffect(() => {
    let release: (() => void) | null = null;
    let cancelled = false;
    const held = new Promise<void>((r) => (release = r));
    // a page that just closed (or a reload) lets go of the lock a moment later, so ask twice before calling it busy
    const ask = (tries: number): Promise<unknown> =>
      navigator.locks.request("silvercash", { ifAvailable: true }, async (lock) => {
        if (cancelled) return;
        if (!lock) return tries > 0 ? void setTimeout(() => void ask(tries - 1), 600) : setStage("busy-tab");
        const { engine, saved } = await import("@/lib/cash/engine");
        try {
          await engine();
          setStage(saved() ? "locked" : "none");
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
          setStage("failed");
        }
        await held;
      });
    ask(2).catch(() => setStage("failed"));
    return () => {
      cancelled = true;
      release?.();
    };
  }, []);

  if (stage === "loading") return <p className="font-mono text-sm text-silver">Starting the private engine in this browser…</p>;
  if (stage === "busy-tab") return <p className="text-lg text-paper/80">SilverCash is open in another tab. Use that one, or close it and reload this page.</p>;
  if (stage === "failed") return <p className="text-lg text-paper/80">The private engine could not start here: {error}. Try a desktop browser.</p>;
  if (stage === "none") return <NewWallet onOpen={(o) => (setOpened(o), setStage("open"))} />;
  if (stage === "locked" || !opened) return <Unlock onOpen={(o) => (setOpened(o), setStage("open"))} onForget={() => setStage("none")} />;
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
    <section className="max-w-xl space-y-5">
      <div role="group" aria-label="Wallet" className="flex gap-1 font-mono text-xs">
        {(["new", "restore"] as const).map((m) => (
          <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className="border border-paper/20 px-3 py-1.5 aria-pressed:border-paper aria-pressed:bg-paper aria-pressed:text-developer">
            {m === "new" ? "New private wallet" : "Restore from words"}
          </button>
        ))}
      </div>
      <p className="text-paper/80">
        {mode === "new"
          ? "SilverCash makes a private Railgun wallet with its own 12 words. They are the only way back to what it holds: write them down. The password only locks it in this browser."
          : "The 12 or 24 words of a Railgun wallet: one made here, in Railway or in any Railgun wallet."}
      </p>
      {mode === "restore" && (
        <>
          <textarea value={words} onChange={(e) => setWords(e.target.value)} rows={3} placeholder="the words, in order" className={input} autoComplete="off" spellCheck={false} />
          <input value={block} onChange={(e) => setBlock(e.target.value.replace(/\D/g, ""))} placeholder="the block it was made at (optional, faster)" className={input} inputMode="numeric" />
        </>
      )}
      <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="password for this browser" className={input} autoComplete="new-password" />
      <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="the same password again" className={input} autoComplete="new-password" />
      <button type="button" onClick={make} disabled={busy} className={button}>
        {busy ? "Working…" : mode === "new" ? "Make my private wallet" : "Restore"}
      </button>
      {error && <p className="font-mono text-xs text-paper">{error}</p>}
    </section>
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
    <section className="max-w-xl space-y-5">
      {shown ? (
        <>
          <h2 className="text-2xl">Your 12 words</h2>
          <ol className="grid grid-cols-2 gap-2 bg-paper p-5 font-mono text-sm text-developer sm:grid-cols-3">
            {list.map((w, i) => (
              <li key={i}>
                <span className="text-developer/50">{i + 1}.</span> {w}
              </li>
            ))}
          </ol>
          <p className="font-mono text-xs text-silver">Made at block {block.toLocaleString("en-US")}. Note it with the words: restoring is faster with it.</p>
          <p className="text-paper/80">Write them on paper, in order. Anyone with them can take what this wallet holds; without them, a cleared browser loses it.</p>
          <button type="button" onClick={() => setShown(false)} className={button}>
            I wrote them down
          </button>
        </>
      ) : (
        <>
          <h2 className="text-2xl">Check three of them</h2>
          {asked.map((i, k) => (
            <label key={i} className="block space-y-1">
              <span className="font-mono text-xs text-silver">Word {i + 1}</span>
              <input value={typed[k]} onChange={(e) => setTyped((t) => t.map((x, j) => (j === k ? e.target.value : x)))} className={input} autoComplete="off" spellCheck={false} />
            </label>
          ))}
          <div className="flex gap-4">
            <button type="button" onClick={onDone} disabled={!right} className={button}>
              Open SilverCash
            </button>
            <button type="button" onClick={() => setShown(true)} className={quiet}>
              Show the words again
            </button>
          </div>
        </>
      )}
    </section>
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
    <form onSubmit={(e) => (e.preventDefault(), go())} className="max-w-md space-y-4">
      <p className="text-paper/80">Your private wallet is in this browser, locked.</p>
      {/* for password managers: they file a password under a username */}
      <input type="text" name="username" autoComplete="username" value="silvercash" readOnly hidden />
      <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="password" className={input} autoComplete="current-password" autoFocus />
      <div className="flex items-center gap-5">
        <button type="submit" disabled={busy || !pw} className={button}>
          {busy ? "Opening…" : "Unlock"}
        </button>
        <button type="button" onClick={() => (localStorage.removeItem("silvercash:wallet"), onForget())} className={quiet}>
          Use other words instead
        </button>
      </div>
      {error && <p className="font-mono text-xs text-paper">{error}</p>}
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
  const [tab, setTab] = useState<"deposit" | "swap" | "withdraw">("deposit");
  const [words, setWords] = useState<string | null>(null);

  useEffect(() => {
    const t0 = Date.now();
    const tick = setInterval(() => setMinutes(Math.floor((Date.now() - t0) / 60_000)), 15_000);
    import("@/lib/cash/actions")
      .then(({ watch }) => watch(o, setB, setScan))
      .then(() => setSynced(true))
      .catch(() => {})
      .finally(() => clearInterval(tick));
    return () => clearInterval(tick);
  }, [o]);

  return (
    <div className="space-y-10">
      <section className="flex flex-wrap items-start justify-between gap-6">
        <div className="space-y-1">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-silver">Your private address</p>
          <p className="max-w-xl break-all font-mono text-sm">{o.address}</p>
          {!synced && (
            <p className="max-w-xl font-mono text-xs leading-relaxed text-silver">
              Reading Railgun&apos;s records… {Math.round(scan * 100)}%{minutes > 0 && ` · ${minutes} min`}. The first time in a browser
              this takes about 10 minutes; keep the tab open. After that it takes seconds. You can deposit now.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-4">
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
        {words && <p className="w-full bg-paper p-4 font-mono text-sm text-developer">{words}</p>}
      </section>

      <section aria-label="Private balances" className="overflow-x-auto">
        <table className="w-full min-w-[30rem] font-mono text-sm">
          <thead className="text-left text-[11px] uppercase tracking-[0.14em] text-silver">
            <tr>
              <th className="py-2 font-normal">Coin</th>
              <th className="py-2 text-right font-normal">Spendable</th>
              <th className="py-2 text-right font-normal">Waiting</th>
              <th className="py-2 text-right font-normal">Blocked</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-silver/15 border-y border-silver/20">
            {COINS.map(([c, label]) => (
              <tr key={c}>
                <td className="py-3">{c === "eth" ? "ETH (as WETH)" : label}</td>
                <td className="py-3 text-right text-xl">{fmt(b.spendable[c])}</td>
                <td className="py-3 text-right text-silver">{fmt(b.waiting[c])}</td>
                <td className="py-3 text-right text-silver">{fmt(b.blocked[c])}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-paper/70">
          Waiting: every deposit, and every swap&apos;s result, waits about an hour while Railgun checks it against lists of
          stolen and sanctioned funds. Blocked: funds those lists caught; they can only go back to where they came from.
        </p>
      </section>

      <section className="space-y-6">
        <div role="group" aria-label="Action" className="flex gap-1 font-mono text-xs">
          {(["deposit", "swap", "withdraw"] as const).map((t) => (
            <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)} className="border border-paper/20 px-4 py-2 capitalize aria-pressed:border-paper aria-pressed:bg-paper aria-pressed:text-developer">
              {t}
            </button>
          ))}
        </div>
        {tab === "deposit" && <Deposit o={o} />}
        {tab !== "deposit" && !synced && <p className="text-paper/80">Swapping and withdrawing open once the records are read.</p>}
        {tab === "swap" && synced && <Swap o={o} spendable={b.spendable} />}
        {tab === "withdraw" && synced && <Withdraw o={o} spendable={b.spendable} />}
      </section>
    </div>
  );
}

function CoinPicker({ value, onChange, label }: { value: Coin; onChange: (c: Coin) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex gap-1 font-mono text-xs">
      {COINS.map(([c, n]) => (
        <button key={c} type="button" aria-pressed={value === c} onClick={() => onChange(c)} className="border border-paper/20 px-3 py-1.5 aria-pressed:border-paper aria-pressed:bg-paper aria-pressed:text-developer">
          {n}
        </button>
      ))}
    </div>
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
    <div className="max-w-xl space-y-4">
      <p className="text-paper/80">
        From your public wallet into your private one. The deposit itself is public on Ethereum; what you do after it is not.
        Railgun keeps 0.25% of it.
      </p>
      {!sender ? (
        <ConnectButton label="Connect the wallet to deposit from" />
      ) : (
        <>
          <CoinPicker value={coin} onChange={setCoin} label="Coin" />
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`amount of ${name(coin)}`} inputMode="decimal" className={input} />
          <p className="font-mono text-xs text-silver">
            Tip: also deposit about 0.01 ETH. Private swaps and withdrawals pay their gas from it, so you never have to send them
            from a public wallet.
          </p>
          <button type="button" onClick={go} disabled={busy || wei <= 0n} className={button}>
            {busy ? "Depositing…" : `Deposit ${name(coin)}`}
          </button>
        </>
      )}
      {note && <p className="font-mono text-xs text-paper">{note}</p>}
    </div>
  );
}

/** How a private transaction goes out: a broadcaster (default, private) or your own wallet (linked). */
function useVia(relayAdapt: boolean) {
  const sender = useSender();
  const [mode, setMode] = useState<"broadcaster" | "self">("broadcaster");
  const pick = async (): Promise<Via> => {
    if (mode === "self") {
      if (!sender) throw new Error("connect a wallet to send it yourself");
      return { kind: "self", sender };
    }
    const { viaBroadcaster } = await import("@/lib/cash/broadcast");
    const via = await viaBroadcaster(relayAdapt);
    if (!via) throw new Error("no broadcaster online takes WETH right now; try again in a minute");
    return via;
  };
  const picker = (
    <fieldset className="space-y-2 font-mono text-xs">
      <legend className="mb-1 uppercase tracking-[0.14em] text-silver">Send it</legend>
      <label className="flex gap-2">
        <input type="radio" checked={mode === "broadcaster"} onChange={() => setMode("broadcaster")} />
        <span>By a Railgun broadcaster, paid from your private WETH. Private.</span>
      </label>
      <label className="flex gap-2">
        <input type="radio" checked={mode === "self"} onChange={() => setMode("self")} />
        <span>From my connected wallet. It pays the gas, and the transaction is linked to it.</span>
      </label>
      {mode === "self" && !sender && <ConnectButton label="Connect a wallet" />}
    </fieldset>
  );
  return { pick, picker };
}

function Swap({ o, spendable }: { o: Opened; spendable: Partial<Record<Coin, bigint>> }) {
  const [from, setFrom] = useState<Coin>("sc");
  const [to, setTo] = useState<Coin>("eth");
  const [amount, setAmount] = useState("");
  const [slip, setSlip] = useState(2);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { pick, picker } = useVia(true);
  const wei = amountOf(amount);

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

  async function go() {
    if (out === null || wei <= 0n) return;
    setBusy(true);
    setNote("Finding a way to send it…");
    try {
      const via = await pick();
      const { swap, railgunFees } = await import("@/lib/cash/actions");
      // the minimum is checked by the router before Railgun's deposit fee, so it is set on the amount before that fee
      const before = (out * 10_000n) / (10_000n - (await railgunFees()).shield);
      const min = (before * BigInt(100 - slip)) / 100n;
      const hash = await swap(o, via, from, to, wei, min, (p) => setNote(`Proving in this browser… ${Math.round(p)}%`));
      setNote(`Sent: ${short(hash)}. Your ${name(to)} shows as waiting, then spendable about an hour after it is mined.`);
    } catch (e) {
      setNote(e instanceof Error ? e.message.split("\n")[0] : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      <p className="text-paper/80">
        Inside Railgun, through the same $SC and $ZC pools as the rest of Silverchat. Railgun keeps 0.25% going out of your
        balance and 0.25% coming back in. The swap&apos;s coins and amounts are public; who made it is not.
      </p>
      <CoinPicker value={from} onChange={(c) => (setFrom(c), c === to && setTo(from))} label="From" />
      <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`amount of ${name(from)}, ${fmt(spendable[from])} spendable`} inputMode="decimal" className={input} />
      <CoinPicker value={to} onChange={(c) => (setTo(c), c === from && setFrom(to))} label="To" />
      <p className="font-mono text-sm">
        {out === null ? <span className="text-silver">·</span> : `about ${fmt(out)} ${name(to)} back, after Railgun's fees`}
      </p>
      <div role="group" aria-label="Slippage" className="flex items-center gap-1 font-mono text-xs">
        <span className="mr-2 text-silver">Slippage</span>
        {[1, 2, 5].map((s) => (
          <button key={s} type="button" aria-pressed={slip === s} onClick={() => setSlip(s)} className="border border-paper/20 px-2.5 py-1 aria-pressed:bg-paper aria-pressed:text-developer">
            {s}%
          </button>
        ))}
      </div>
      {picker}
      <button type="button" onClick={go} disabled={busy || out === null || wei <= 0n || wei > (spendable[from] ?? 0n)} className={button}>
        {busy ? "Working…" : "Swap privately"}
      </button>
      {note && <p className="font-mono text-xs text-paper">{note}</p>}
    </div>
  );
}

function Withdraw({ o, spendable }: { o: Opened; spendable: Partial<Record<Coin, bigint>> }) {
  const { address } = useAccount();
  const [coin, setCoin] = useState<Coin>("eth");
  const [amount, setAmount] = useState("");
  const [to, setTo] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { pick, picker } = useVia(coin === "eth");
  const wei = amountOf(amount);
  const own = !!address && to.toLowerCase() === address.toLowerCase();

  async function go() {
    if (!isAddress(to) || wei <= 0n) return;
    setBusy(true);
    setNote("Finding a way to send it…");
    try {
      const via = await pick();
      const { withdraw } = await import("@/lib/cash/actions");
      const hash = await withdraw(o, via, coin, wei, to as Address, (p) => setNote(`Proving in this browser… ${Math.round(p)}%`));
      setNote(`Sent: ${short(hash)}.`);
    } catch (e) {
      setNote(e instanceof Error ? e.message.split("\n")[0] : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      <p className="text-paper/80">To any address, best a fresh one. Railgun keeps 0.25%. ETH comes out as ETH.</p>
      <CoinPicker value={coin} onChange={setCoin} label="Coin" />
      <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`amount of ${name(coin)}, ${fmt(spendable[coin])} spendable`} inputMode="decimal" className={input} />
      <input value={to} onChange={(e) => setTo(e.target.value.trim())} placeholder="0x… the address to send to" className={input} spellCheck={false} />
      {own && <p className="font-mono text-xs text-paper">That is your connected wallet: withdrawing there links it to this balance.</p>}
      {picker}
      <button type="button" onClick={go} disabled={busy || !isAddress(to) || wei <= 0n || wei > (spendable[coin] ?? 0n)} className={button}>
        {busy ? "Working…" : `Withdraw ${name(coin)}`}
      </button>
      {note && <p className="font-mono text-xs text-paper">{note}</p>}
    </div>
  );
}
