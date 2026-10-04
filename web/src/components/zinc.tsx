"use client";

import { useQuery } from "@tanstack/react-query";
import encodeQR from "qr";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatEther, isHex, type Hex } from "viem";

import { short } from "@/lib/format";
import type { Message } from "@/lib/zinc/chat";
import type { Burner } from "@/lib/zinc/zkapi";
import type { Snapshot } from "@openanonymity/zkapi-browser-sdk/client";

const input = "w-full border border-paper/25 bg-transparent px-3 py-2 font-mono text-sm text-paper placeholder:text-silver/60 focus:border-paper focus:outline-none";
const button = "bg-paper px-5 py-2.5 font-mono text-sm text-developer hover:brightness-105 disabled:opacity-40";
const quiet = "font-mono text-xs text-silver underline-offset-4 hover:text-paper hover:underline";
const card = "space-y-4 border border-paper/15 p-5 sm:p-6";
const label = "font-mono text-xs uppercase tracking-[0.14em] text-silver";
const err = (e: unknown) => (e instanceof Error ? e.message : String(e));

// a swap NEAR is doing for us, kept so a reload picks up where it was
type Leg = { depositAddress: string; amountIn: string; amountOut: string; deadline: string; uri?: string };
const IN = "zinc:in";
const OUT = "zinc:out";
const read = (k: string): Leg | null => {
  try {
    return JSON.parse(localStorage.getItem(k) ?? "null");
  } catch {
    return null;
  }
};
const write = (k: string, v: Leg | null) => (v ? localStorage.setItem(k, JSON.stringify(v)) : localStorage.removeItem(k));

type Stage = "loading" | "none" | "locked" | "open";

/** Zinc: shielded ZEC in, anonymous AI out, shielded ZEC back. */
export function Zinc() {
  const [stage, setStage] = useState<Stage>("loading");
  const [burner, setBurner] = useState<Burner | null>(null);

  useEffect(() => {
    void import("@/lib/zinc/burner").then(({ savedBurner }) => setStage(savedBurner() ? "locked" : "none"));
  }, []);

  const opened = async (key: Hex) => {
    const { burnerProvider } = await import("@/lib/zinc/burner");
    setBurner(burnerProvider(key));
    setStage("open");
  };

  if (stage === "loading") return <p className="font-mono text-sm text-silver">Loading…</p>;
  if (stage === "none") return <NewBurner onOpen={opened} />;
  if (stage === "locked" || !burner) return <Unlock onOpen={opened} onForget={() => setStage("none")} />;
  return <Open burner={burner} onWiped={() => (setBurner(null), setStage("none"))} />;
}

// ---- the burner: made here, locked with a password, saved as a private key

function NewBurner({ onOpen }: { onOpen: (k: Hex) => void }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [imported, setImported] = useState("");
  const [fresh, setFresh] = useState<Hex | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function make() {
    setError(null);
    if (pw.length < 10) return setError("Use a password of at least 10 characters. It encrypts the burner in this browser.");
    if (pw !== pw2) return setError("The two passwords are not the same.");
    const key = imported.trim();
    if (key && !(isHex(key) && key.length === 66)) return setError("A private key is 0x and 64 hex characters.");
    const { makeBurner } = await import("@/lib/zinc/burner");
    const k = await makeBurner(pw, (key || undefined) as Hex | undefined);
    if (key) onOpen(k);
    else setFresh(k);
  }

  if (fresh) return <SaveKey k={fresh} onDone={() => onOpen(fresh)} />;
  return (
    <section className="max-w-xl space-y-5">
      <p className="text-paper/80">
        Zinc makes a burner: a new Ethereum key in this browser, used for one round trip and then wiped. NEAR pays it ETH for
        your ZEC, it funds a private zkAPI balance, and at the end it sends what is left back as ZEC.
      </p>
      <input aria-label="Password for this browser" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="password for this browser" className={input} autoComplete="new-password" />
      <input aria-label="The same password again" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="the same password again" className={input} autoComplete="new-password" />
      <details className="text-sm text-paper/70">
        <summary className="cursor-pointer font-mono text-xs text-silver">Bring back a saved burner</summary>
        <input aria-label="Saved private key" value={imported} onChange={(e) => setImported(e.target.value)} placeholder="0x… private key" className={`${input} mt-2`} autoComplete="off" spellCheck={false} />
      </details>
      <button type="button" onClick={make} className={button}>
        {imported ? "Bring it back" : "Make a burner"}
      </button>
      {error && <p className="font-mono text-xs text-paper">{error}</p>}
    </section>
  );
}

/** The key, once. The private balance belongs to this browser's zkAPI note, but the ETH before and after is the key's. */
function SaveKey({ k, onDone }: { k: Hex; onDone: () => void }) {
  const [shown, setShown] = useState(false);
  const [ok, setOk] = useState(false);
  return (
    <section className="max-w-xl space-y-5">
      <h2 className="text-2xl">Save the burner&apos;s key</h2>
      <p className="text-paper/80">
        Any ETH on the burner is this key&apos;s. Keep it until the exit is done: it opens in any Ethereum wallet. Anyone with it can
        take that ETH.
      </p>
      <div className="bg-paper p-4 font-mono text-xs break-all text-developer">{shown ? k : "•".repeat(66)}</div>
      <div className="flex flex-wrap gap-4">
        <button type="button" onClick={() => setShown((s) => !s)} className={quiet}>
          {shown ? "Hide" : "Show"}
        </button>
        <button type="button" onClick={() => void navigator.clipboard.writeText(k)} className={quiet}>
          Copy
        </button>
      </div>
      <label className="flex items-center gap-3 text-sm text-paper/80">
        <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />I saved it somewhere safe
      </label>
      <button type="button" onClick={onDone} disabled={!ok} className={button}>
        Open Zinc
      </button>
    </section>
  );
}

function Unlock({ onOpen, onForget }: { onOpen: (k: Hex) => void; onForget: () => void }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          onOpen(await (await import("@/lib/zinc/burner")).unlockBurner(pw));
        } catch (x) {
          setError(err(x));
        }
      }}
      className="max-w-md space-y-4"
    >
      <p className="text-paper/80">Your Zinc burner is in this browser, locked.</p>
      <input type="text" name="username" autoComplete="username" value="zinc" readOnly hidden />
      <input aria-label="Password" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="password" className={input} autoComplete="current-password" autoFocus />
      <div className="flex items-center gap-5">
        <button type="submit" disabled={!pw} className={button}>
          Unlock
        </button>
        <button
          type="button"
          onClick={async () => {
            if (!confirm("Remove the burner from this browser? Without its saved key, any ETH on it is gone.")) return;
            (await import("@/lib/zinc/burner")).wipeBurner();
            onForget();
          }}
          className={quiet}
        >
          Start over
        </button>
      </div>
      {error && <p className="font-mono text-xs text-paper">{error}</p>}
    </form>
  );
}

// ---- the open burner: fund, deposit, use, exit

function Open({ burner, onWiped }: { burner: Burner; onWiped: () => void }) {
  const { data: eth = null, refetch } = useQuery({
    queryKey: ["zinc-eth", burner.address],
    queryFn: async () => (await import("@/lib/zinc/burner")).balanceOf(burner),
    refetchInterval: 15_000,
  });
  const refresh = useCallback(() => void refetch(), [refetch]);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [money, setMoney] = useState<{ fmt: (u: number | string) => string } | null>(null);
  const [sdkError, setSdkError] = useState<string | null>(null);

  useEffect(() => {
    let off = () => {};
    void import("@/lib/zinc/zkapi").then(async ({ zkapi }) => {
      try {
        const client = await zkapi(burner);
        setMoney({ fmt: (u) => client.formatBillingAmount(u) });
        setSnap(client.snapshot());
        off = client.subscribe(setSnap);
      } catch (e) {
        setSdkError(err(e));
      }
    });
    return () => off();
  }, [burner]);

  const note = snap?.wallet?.has_note ? snap.wallet.note : null;
  const balance = note?.current_balance ?? note?.amount;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className={`${card} lg:col-span-2`} aria-label="Burner">
        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 font-mono text-sm">
          <span>
            <span className={label}>Burner</span> {short(burner.address)}
          </span>
          <span>
            <span className={label}>ETH</span> {eth == null ? "…" : Number(formatEther(eth)).toFixed(6)}
          </span>
          <span>
            <span className={label}>Private balance</span> {balance != null && money ? `${money.fmt(balance)} ETH` : note ? "…" : "none"}
          </span>
        </div>
        {sdkError && <p className="font-mono text-xs text-paper">zkAPI could not start here: {sdkError}</p>}
      </section>
      <Fund burner={burner} onArrived={refresh} />
      <Deposit burner={burner} eth={eth} hasNote={!!note} onDone={refresh} />
      <Use burner={burner} hasNote={!!note} />
      <Exit burner={burner} hasNote={!!note} eth={eth} onWiped={onWiped} />
    </div>
  );
}

/** Poll NEAR until a swap settles; `done` gets the final status. */
function useLeg(key: string, done: (status: string) => void) {
  // the burner opens after the first render, so localStorage is there
  const [leg, setLeg] = useState<Leg | null>(() => read(key));
  const [state, setState] = useState<string>("");
  const doneRef = useRef(done);
  useEffect(() => {
    doneRef.current = done;
  });
  useEffect(() => {
    if (!leg) return;
    let stop = false;
    const tick = async () => {
      const { status } = await import("@/lib/zinc/oneclick");
      const s = await status(leg.depositAddress).catch(() => null);
      if (stop || !s) return;
      setState(s.status);
      if (["SUCCESS", "REFUNDED", "FAILED"].includes(s.status)) {
        write(key, null);
        setLeg(null);
        doneRef.current(s.status);
      }
    };
    void tick();
    const t = setInterval(tick, 10_000);
    return () => ((stop = true), clearInterval(t));
  }, [key, leg]);
  const start = (l: Leg) => (write(key, l), setLeg(l), setState("PENDING_DEPOSIT"));
  const drop = () => (write(key, null), setLeg(null));
  return { leg, state, start, drop };
}

const AMOUNTS = ["0.05", "0.1", "0.25", "0.5"];
// above this, the fund step asks for a ZKPassport proof first
const OPEN_LIMIT = 0.1;

function Fund({ burner, onArrived }: { burner: Burner; onArrived: () => void }) {
  const [via, setVia] = useState<"zec" | "eth">("zec");
  const [amount, setAmount] = useState(AMOUNTS[0]);
  const [refund, setRefund] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const { leg, state, start, drop } = useLeg(IN, (s) => (setLast(s), onArrived()));
  const [pass, setPass] = useState(false);
  useEffect(() => {
    void import("@/lib/zinc/passport").then(({ passOf }) => setPass(!!passOf(burner.address)));
  }, [burner.address]);
  const needsPass = Number(amount) > OPEN_LIMIT && !pass;

  async function go() {
    setError(null);
    const { quote, isTransparent, zip321, ZEC, ETH } = await import("@/lib/zinc/oneclick");
    if (!isTransparent(refund)) return setError("NEAR sends a failed swap back to a transparent address (t1… or t3…). Copy one from your wallet's receive screen.");
    setBusy(true);
    try {
      const q = await quote(ZEC, ETH, amount, burner.address, refund.trim());
      start({ depositAddress: q.depositAddress, amountIn: q.amountIn, amountOut: q.amountOutFormatted, deadline: q.deadline, uri: zip321(q.depositAddress, q.amountIn) });
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={card} aria-labelledby="zinc-fund">
      <h2 id="zinc-fund" className="text-2xl">
        1. Fund the burner
      </h2>
      <div role="group" aria-label="Pay with" className="flex gap-1 font-mono text-xs">
        {(["zec", "eth"] as const).map((v) => (
          <button key={v} type="button" aria-pressed={via === v} onClick={() => setVia(v)} className="border border-paper/20 px-3 py-1.5 aria-pressed:border-paper aria-pressed:bg-paper aria-pressed:text-developer">
            {v === "zec" ? "Shielded ZEC" : "ETH"}
          </button>
        ))}
      </div>
      {via === "eth" ? (
        <p className="text-paper/80">
          Send ETH to <span className="font-mono break-all">{burner.address}</span> from any wallet. This is the least private way
          in: the sending wallet is public.
        </p>
      ) : leg ? (
        <div className="space-y-3">
          <p className="text-paper/80">
            Send exactly <b>{(Number(leg.amountIn) / 1e8).toString()} ZEC</b> from a shielded balance (Zodl, Ywallet or any Zcash
            wallet) to this one-time NEAR address. About {Number(leg.amountOut).toFixed(6)} ETH comes to the burner.
          </p>
          {leg.uri && (
            <a href={leg.uri} aria-label="Open in a Zcash wallet" className="block w-44 bg-paper p-2" dangerouslySetInnerHTML={{ __html: encodeQR(leg.uri, "svg") }} />
          )}
          <p className="font-mono text-xs break-all text-paper">{leg.depositAddress}</p>
          <p className="font-mono text-xs text-silver">
            NEAR: {state || "waiting"} · pay before {new Date(leg.deadline).toLocaleTimeString()}
          </p>
          {state === "PENDING_DEPOSIT" && (
            <button type="button" onClick={() => confirm("Forget this address? Only if you have not paid it.") && drop()} className={quiet}>
              I have not paid: start over
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div role="group" aria-label="Amount" className="flex flex-wrap gap-1 font-mono text-xs">
            {AMOUNTS.map((a) => (
              <button key={a} type="button" aria-pressed={amount === a} onClick={() => setAmount(a)} className="border border-paper/20 px-3 py-1.5 aria-pressed:border-paper aria-pressed:bg-paper aria-pressed:text-developer">
                {a} ZEC
              </button>
            ))}
          </div>
          {needsPass ? (
            <Passport burner={burner} onPass={() => setPass(true)} />
          ) : (
            <>
              <input aria-label="Refund address" value={refund} onChange={(e) => setRefund(e.target.value)} placeholder="a transparent ZEC address for refunds (t1…)" className={input} autoComplete="off" spellCheck={false} />
              <button type="button" onClick={go} disabled={busy} className={button}>
                {busy ? "Asking NEAR…" : "Get a deposit address"}
              </button>
            </>
          )}
          <p className="text-sm text-paper/60">
            Round amounts make your swap look like everyone else&apos;s. Up to {OPEN_LIMIT} ZEC needs nothing; more needs a ZKPassport proof.
          </p>
        </div>
      )}
      {last && <p className="font-mono text-xs text-silver">Last swap: {last === "SUCCESS" ? "ETH arrived" : last.toLowerCase()}</p>}
      {error && <p className="font-mono text-xs text-paper">{error}</p>}
    </section>
  );
}

/**
 * ZKPassport, for amounts above the open limit: the phone proves 18+, no sanctions list and no embargoed nationality,
 * bound to this burner. Nothing about the person reaches Zinc.
 */
function Passport({ burner, onPass }: { burner: Burner; onPass: () => void }) {
  const [asking, setAsking] = useState<{ url: string; cancel: () => void } | null>(null);
  const [step, setStep] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => () => asking?.cancel(), [asking]);

  async function go() {
    setError(null);
    try {
      const { askPassport } = await import("@/lib/zinc/passport");
      const a = await askPassport(burner.address, setStep);
      setAsking(a);
      setStep("Scan this with the ZKPassport app");
      await a.result;
      onPass();
    } catch (e) {
      setError(err(e));
      setAsking(null);
    }
  }

  return (
    <div className="space-y-3 border border-paper/15 p-4">
      <p className="text-paper/80">
        Larger amounts need a ZKPassport proof: your phone reads your passport&apos;s chip and proves you are 18 or older, on no
        sanctions list, and not from a country under a full US embargo. Zinc never sees your name, number or country.
      </p>
      {asking ? (
        <>
          <a href={asking.url} target="_blank" rel="noreferrer" aria-label="Open in ZKPassport" className="block w-44 bg-paper p-2" dangerouslySetInnerHTML={{ __html: encodeQR(asking.url, "svg") }} />
          <p className="font-mono text-xs text-silver">{step}</p>
        </>
      ) : (
        <button type="button" onClick={go} className={button}>
          Prove it with ZKPassport
        </button>
      )}
      {error && <p className="font-mono text-xs text-paper">{error}</p>}
    </div>
  );
}

function Deposit({ burner, eth, hasNote, onDone }: { burner: Burner; eth: bigint | null; hasNote: boolean; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setError(null);
    try {
      const { depositAll } = await import("@/lib/zinc/zkapi");
      const put = await depositAll(burner, setStatus);
      setStatus(`${formatEther(put)} ETH is now private.`);
      onDone();
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={card} aria-labelledby="zinc-deposit">
      <h2 id="zinc-deposit" className="text-2xl">
        2. Make it private
      </h2>
      <p className="text-paper/80">
        The burner puts its ETH into zkAPI&apos;s vault on Ethereum, less the gas it keeps for the way out. From then on, each use
        is paid with a zero-knowledge proof: nobody can tell which deposit paid for it.
      </p>
      <button type="button" onClick={go} disabled={busy || hasNote || !eth} className={button}>
        {hasNote ? "Private balance open" : busy ? "Depositing…" : "Deposit into zkAPI"}
      </button>
      {status && <p className="font-mono text-xs text-silver">{status}</p>}
      {error && <p className="font-mono text-xs text-paper">{error}</p>}
    </section>
  );
}

function Use({ burner, hasNote }: { burner: Burner; hasNote: boolean }) {
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [tier, setTier] = useState(1);
  const [key, setKey] = useState<{ apiKey: string; release: () => void } | null>(null);
  const [chat, setChat] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [agent, setAgent] = useState(false);

  useEffect(() => {
    void import("@/lib/zinc/chat").then(({ MODELS }) => (setModels(MODELS), setModel(MODELS[0])));
  }, []);
  useEffect(() => () => key?.release(), [key]);

  async function getKey() {
    const { access } = await import("@/lib/zinc/zkapi");
    const k = await access(burner, tier, setBusy);
    setKey(k);
    return k;
  }

  async function send() {
    const text = draft.trim();
    if (!text) return;
    setError(null);
    const history: Message[] = [...chat, { role: "user", content: text }];
    setChat(history);
    setDraft("");
    try {
      const k = key ?? (await getKey());
      setBusy("Thinking…");
      const { ask } = await import("@/lib/zinc/chat");
      await ask(k.apiKey, model, history, (t) => setChat([...history, { role: "assistant", content: t }]));
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <section className={card} aria-labelledby="zinc-use">
      <h2 id="zinc-use" className="text-2xl">
        3. Ask anything
      </h2>
      {!hasNote ? (
        <p className="text-paper/60">Once the private balance is open, any OpenRouter model answers here, paid by proof.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <select aria-label="Model" value={model} onChange={(e) => setModel(e.target.value)} className={`${input} w-auto`}>
              {models.map((m) => (
                <option key={m} value={m} className="bg-developer">
                  {m}
                </option>
              ))}
            </select>
            <select aria-label="Spending cap" value={tier} onChange={(e) => (key?.release(), setKey(null), setTier(Number(e.target.value)))} className={`${input} w-auto`}>
              {[1, 2, 3, 4.5, 6].map((t) => (
                <option key={t} value={t} className="bg-developer">
                  up to ${t} per key
                </option>
              ))}
            </select>
          </div>
          <div className="max-h-96 space-y-3 overflow-y-auto" aria-live="polite">
            {chat.map((m, i) => (
              <p key={i} className={m.role === "user" ? "text-paper" : "whitespace-pre-wrap text-paper/75"}>
                {m.content}
              </p>
            ))}
          </div>
          <form onSubmit={(e) => (e.preventDefault(), void send())} className="flex gap-2">
            <input aria-label="Message" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="ask" className={input} />
            <button type="submit" disabled={!!busy} className={button}>
              Send
            </button>
          </form>
          {busy && <p className="font-mono text-xs text-silver">{busy}</p>}
          <button type="button" onClick={() => void (key ? setAgent((a) => !a) : getKey().then(() => setAgent(true)).catch((e) => setError(err(e))))} className={quiet}>
            Use it from an agent
          </button>
          {agent && key && <AgentKey k={key.apiKey} model={model} />}
        </>
      )}
      {error && <p className="font-mono text-xs text-paper">{error}</p>}
    </section>
  );
}

function AgentKey({ k, model }: { k: string; model: string }) {
  const [snippet, setSnippet] = useState("");
  useEffect(() => {
    void import("@/lib/zinc/chat").then(({ curl }) => setSnippet(curl(k, model)));
  }, [k, model]);
  return (
    <div className="space-y-2">
      <p className="text-sm text-paper/70">
        A short-lived key with the cap above, for any OpenAI-compatible client. It stops when it expires or the cap is spent;
        only what is used is charged.
      </p>
      <pre className="overflow-x-auto bg-paper/5 p-3 font-mono text-xs text-paper/80">{snippet}</pre>
      <button type="button" onClick={() => void navigator.clipboard.writeText(snippet)} className={quiet}>
        Copy
      </button>
    </div>
  );
}

function Exit({ burner, hasNote, eth, onWiped }: { burner: Burner; hasNote: boolean; eth: bigint | null; onWiped: () => void }) {
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { leg, state, start } = useLeg(OUT, async (s) => {
    if (s !== "SUCCESS") return setError(`NEAR: ${s.toLowerCase()}. A refund goes back to the burner as ETH.`);
    (await import("@/lib/zinc/burner")).wipeBurner();
    onWiped();
  });

  async function go() {
    setError(null);
    const { isZcashAddress, isTransparent, quote, submitted, ETH, ZEC } = await import("@/lib/zinc/oneclick");
    if (!isZcashAddress(to)) return setError("That is not a Zcash address.");
    if (isTransparent(to) && !confirm("That is a transparent address: anyone can see what arrives there. Use it anyway?")) return;
    try {
      const { withdraw } = await import("@/lib/zinc/zkapi");
      const { sendable, send } = await import("@/lib/zinc/burner");
      if (hasNote) await withdraw(burner, "mutual", setBusy);
      setBusy("Asking NEAR for a quote…");
      const s = await sendable(burner);
      const q = await quote(ETH, ZEC, formatEther(s.value), to.trim(), burner.address);
      start({ depositAddress: q.depositAddress, amountIn: q.amountIn, amountOut: q.amountOutFormatted, deadline: q.deadline });
      setBusy("Sending the ETH to NEAR…");
      const hash = await send(burner, q.depositAddress as Hex, s);
      await submitted(q.depositAddress, hash);
      setBusy("");
    } catch (e) {
      setError(err(e));
      setBusy("");
    }
  }

  async function escape() {
    if (!confirm("The slow way out works without the zkAPI server, but takes a 24-hour challenge window. Start it?")) return;
    try {
      await (await import("@/lib/zinc/zkapi")).withdraw(burner, "escape", setBusy);
    } catch (e) {
      setError(err(e));
    }
  }

  return (
    <section className={card} aria-labelledby="zinc-exit">
      <h2 id="zinc-exit" className="text-2xl">
        4. Back to shielded ZEC
      </h2>
      {leg ? (
        <p className="font-mono text-xs text-silver">
          NEAR: {state || "waiting"} · about {Number(leg.amountOut).toFixed(4)} ZEC on its way. The burner is wiped when it lands.
        </p>
      ) : (
        <>
          <p className="text-paper/80">
            Closes the private balance, then the burner sends all it holds to NEAR, which pays ZEC to a fresh shielded address of
            yours. Wait a while after your last use, and it is harder to tie the two ends together.
          </p>
          <input aria-label="Your shielded ZEC address" value={to} onChange={(e) => setTo(e.target.value)} placeholder="a fresh shielded ZEC address (u1… or zs1…)" className={input} autoComplete="off" spellCheck={false} />
          <div className="flex flex-wrap items-center gap-5">
            <button type="button" onClick={go} disabled={!!busy || (!hasNote && !eth)} className={button}>
              {busy ? "Working…" : "Close and send home"}
            </button>
            {hasNote && (
              <button type="button" onClick={escape} className={quiet}>
                zkAPI server down? The slow way out
              </button>
            )}
          </div>
        </>
      )}
      {busy && <p className="font-mono text-xs text-silver">{busy}</p>}
      {error && <p className="font-mono text-xs text-paper">{error}</p>}
    </section>
  );
}
