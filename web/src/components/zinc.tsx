"use client";

import { useQuery } from "@tanstack/react-query";
import encodeQR from "qr";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { formatEther, isHex, type Hex } from "viem";

import { Rail, StepPart, pill, said, small, warn } from "@/components/fork";
import { Part, action, field, label, second } from "@/components/journal";
import { short } from "@/lib/format";
import type { Message } from "@/lib/zinc/chat";
import { TIERS, type Burner } from "@/lib/zinc/zkapi";
import type { Snapshot } from "@openanonymity/zkapi-browser-sdk/client";

const input = `${field} font-mono !text-base`;
const button = action;
const quiet = small;
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

// the way through, in five steps: the burner, then the round trip
const STEPS = [{ name: "Burner" }, { name: "Fund" }, { name: "Private" }, { name: "Ask" }, { name: "Home" }];
type State = "done" | "now" | "later";
const stateOf = (n: number, at: number): State => (n - 1 < at ? "done" : n - 1 === at ? "now" : "later");
// the green action belongs to the step you are at; the others' buttons are ink
const mainOf = (state: State) => (state === "now" ? action : second);

/** A field with its label over it. */
function Labelled({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className={label}>{caption}</span>
      {children}
    </label>
  );
}

/** Step 1 of the way through, before the burner is open. */
function First({ title = "Make a burner", children }: { title?: string; children: ReactNode }) {
  return (
    <>
      <Part title="The way through">
        <Rail steps={STEPS} at={0} done={0} next="Next: fund it with shielded ZEC." />
      </Part>
      <StepPart n={1} of={STEPS.length} title={title} state="now">
        {children}
      </StepPart>
    </>
  );
}

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

  if (stage === "loading")
    return (
      <First>
        <p role="status" className="font-mono text-sm text-silver motion-safe:animate-pulse">Loading…</p>
      </First>
    );
  if (stage === "none")
    return (
      <First>
        <NewBurner onOpen={opened} />
      </First>
    );
  if (stage === "locked" || !burner)
    return (
      <First title="Open your burner">
        <Unlock onOpen={opened} onForget={() => setStage("none")} />
      </First>
    );
  return <Open burner={burner} onWiped={() => (setBurner(null), setStage("none"))} />;
}

// ---- the burner: made here, locked with a password, saved as a private key

function NewBurner({ onOpen }: { onOpen: (k: Hex) => void }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [imported, setImported] = useState("");
  const [fresh, setFresh] = useState<Hex | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function make() {
    setError(null);
    if (pw.length < 10) return setError("Use a password of at least 10 characters. It encrypts the burner in this browser.");
    if (pw !== pw2) return setError("The two passwords are not the same.");
    const key = imported.trim();
    if (key && !(isHex(key) && key.length === 66)) return setError("A private key is 0x and 64 hex characters.");
    setBusy(true);
    try {
      const { makeBurner } = await import("@/lib/zinc/burner");
      const k = await makeBurner(pw, (key || undefined) as Hex | undefined);
      if (key) onOpen(k);
      else setFresh(k);
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(false);
    }
  }

  if (fresh) return <SaveKey k={fresh} onDone={() => onOpen(fresh)} />;
  return (
    <div className="max-w-xl space-y-6">
      <p className="leading-relaxed text-paper/80">
        Zinc makes a burner: a new Ethereum key in this browser, used for one round trip and then wiped. NEAR pays it ETH for
        your ZEC, it funds a private zkAPI balance, and at the end it sends what is left back as ZEC.
      </p>
      <Labelled caption="Password for this browser">
        <input aria-label="Password for this browser" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="at least 10 characters" className={input} autoComplete="new-password" />
      </Labelled>
      <Labelled caption="The same password again">
        <input aria-label="The same password again" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="the same password again" className={input} autoComplete="new-password" />
      </Labelled>
      <details className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-mono text-xs text-silver hover:text-paper sm:min-h-0">
          <span aria-hidden className="transition-transform group-open:rotate-90 motion-reduce:transition-none">›</span>
          Bring back a saved burner
        </summary>
        <div className="pt-3">
          <Labelled caption="Saved private key">
            <input aria-label="Saved private key" value={imported} onChange={(e) => setImported(e.target.value)} placeholder="0x… private key" className={input} autoComplete="off" spellCheck={false} />
          </Labelled>
        </div>
      </details>
      <button type="button" onClick={make} disabled={busy} className={button}>
        {busy ? "Working…" : imported ? "Bring it back" : "Make a burner"}
      </button>
      {error && <p role="alert" className={said}>{error}</p>}
    </div>
  );
}

/** The key, once. It holds the ETH before and after; the private balance is a note in this browser, not the key's. */
function SaveKey({ k, onDone }: { k: Hex; onDone: () => void }) {
  const [shown, setShown] = useState(false);
  const [ok, setOk] = useState(false);
  return (
    <div className="max-w-xl space-y-6">
      <h3 className="text-[1.3rem] leading-tight">Save the burner&apos;s key</h3>
      <p className={warn}>
        Any ETH on the burner is this key&apos;s. Keep it until the exit is done: it opens in any Ethereum wallet. Anyone with it can
        take that ETH. The private balance is different: it is a note kept only in this browser, and the key cannot bring it
        back. Do not clear this site&apos;s data while it is open.
      </p>
      <div className="rounded-lg bg-tray/70 p-4 font-mono text-sm leading-relaxed break-all">{shown ? k : "•".repeat(66)}</div>
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <button type="button" onClick={() => setShown((s) => !s)} className={quiet}>
          {shown ? "Hide" : "Show"}
        </button>
        <button type="button" onClick={() => void navigator.clipboard.writeText(k)} className={quiet}>
          Copy
        </button>
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <input type="checkbox" className="size-4 accent-tap" checked={ok} onChange={(e) => setOk(e.target.checked)} />I saved it somewhere safe
      </label>
      <button type="button" onClick={onDone} disabled={!ok} className={button}>
        Open Zinc
      </button>
    </div>
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
      className="max-w-md space-y-6"
    >
      <p className="leading-relaxed text-paper/80">Your Zinc burner is in this browser, locked.</p>
      <input type="text" name="username" autoComplete="username" value="zinc" readOnly hidden />
      <Labelled caption="Password">
        <input aria-label="Password" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="password" className={input} autoComplete="current-password" autoFocus />
      </Labelled>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <button type="submit" disabled={!pw} className={button}>
          Unlock
        </button>
        <button
          type="button"
          onClick={async () => {
            if (!confirm("Remove the burner from this browser? Without its saved key, any ETH on it is gone. A private balance stays in this browser and can still be closed to a new burner.")) return;
            (await import("@/lib/zinc/burner")).wipeBurner();
            onForget();
          }}
          className={quiet}
        >
          Start over
        </button>
      </div>
      {error && <p role="alert" className={said}>{error}</p>}
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
    let gone = false;
    void import("@/lib/zinc/zkapi").then(async ({ zkapi }) => {
      try {
        const client = await zkapi(burner);
        if (gone) return;
        setMoney({ fmt: (u) => client.formatBillingAmount(u) });
        setSnap(client.snapshot());
        off = client.subscribe(setSnap);
      } catch (e) {
        if (!gone) setSdkError(err(e));
      }
    });
    return () => ((gone = true), off());
  }, [burner]);

  const note = snap?.wallet?.has_note ? snap.wallet.note : null;
  const balance = note?.current_balance ?? note?.amount;
  // a withdrawal not yet closed: its ETH is not on the burner yet, so nothing may leave or be wiped
  const pending = snap?.withdrawals?.find((w) => w.phase !== "closed") ?? null;
  // a deposit sent but not yet seen confirmed (after a reload the SDK finishes it in the background)
  const depositing = !!snap?.deposits?.some((d) => d.status.startsWith("submitted"));

  // where the visitor is on the way through, for the steps' numbers only: every step stays usable as before
  const leaving = !!read(OUT);
  const at = leaving || pending ? 4 : note ? 3 : depositing || (eth != null && eth > 0n) ? 2 : 1;
  const expiry = note?.expiry ? new Date(note.expiry * 1000).toLocaleString() : null;
  const next = [
    "",
    "Next: make the ETH private in zkAPI's vault.",
    "Next: ask any model, paid by proof.",
    `Next: when you are done, send what is left home${expiry ? `, before ${expiry}` : ""}.`,
    "The last step. The burner is wiped when the ZEC lands.",
  ][at];

  // the opened burner starts at the top of the way through, not where the setup left the page
  useEffect(() => {
    document.getElementById("zinc-way")?.scrollIntoView({ block: "start" });
  }, []);

  return (
    <>
      <Part title="The way through" id="zinc-way">
        <Rail steps={STEPS} at={at} done={at} next={next} anchor="zinc-step" />
      </Part>
      <StepPart n={1} of={STEPS.length} title="Your burner" state="done" id="zinc-step-1">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3">
          <div className="space-y-1.5 border-l border-paper/20 pl-4">
            <dt className={label}>Burner</dt>
            <dd className="font-mono text-sm leading-7">{short(burner.address)}</dd>
          </div>
          <div className="space-y-1.5 border-l border-paper/20 pl-4">
            <dt className={label}>ETH</dt>
            <dd className="text-[1.6rem] leading-none tabular-nums">{eth == null ? "…" : Number(formatEther(eth)).toFixed(6)}</dd>
          </div>
          <div className="space-y-1.5 border-l border-paper/20 pl-4">
            <dt className={label}>Private balance</dt>
            <dd className="text-[1.6rem] leading-none tabular-nums">{balance != null && money ? `${money.fmt(balance)} ETH` : note ? "…" : "none"}</dd>
          </div>
          {note?.expiry ? (
            <div className="space-y-1.5 border-l border-paper/20 pl-4">
              <dt className={label}>Close before</dt>
              <dd className="leading-snug tabular-nums">{new Date(note.expiry * 1000).toLocaleString()}</dd>
            </div>
          ) : null}
        </dl>
        {note?.expiry ? (
          <p className={warn}>
            A private balance lasts 30 days. After that anyone can close it and all of it goes to zkAPI&apos;s operator, not back to
            you.
          </p>
        ) : null}
        {sdkError && <p role="alert" className={said}>zkAPI could not start here: {sdkError}</p>}
      </StepPart>
      <Fund burner={burner} onArrived={refresh} state={stateOf(2, at)} />
      <Deposit burner={burner} eth={eth} hasNote={!!note} depositing={depositing} onDone={refresh} state={stateOf(3, at)} />
      <Use burner={burner} hasNote={!!note} state={stateOf(4, at)} />
      <Exit burner={burner} hasNote={!!note} pending={pending} eth={eth} onWiped={onWiped} state={stateOf(5, at)} />
    </>
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

const AMOUNTS = ["0.05", "0.1", "0.5", "1", "5", "10"];
// above this, the fund step asks for a ZKPassport proof first
const OPEN_LIMIT = 1;

function Fund({ burner, onArrived, state: step }: { burner: Burner; onArrived: () => void; state: State }) {
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
  // the vault's gas for the round trip, and what each amount brings in ETH, so amounts too small for it are not offered
  const { data: fit } = useQuery({
    queryKey: ["zinc-fit"],
    queryFn: async () => {
      const [{ reserveNow }, { prices }] = await Promise.all([import("@/lib/zinc/zkapi"), import("@/lib/zinc/oneclick")]);
      const [reserve, p] = await Promise.all([reserveNow(burner), prices()]);
      return { reserve: Number(formatEther(reserve)), ethPerZec: p.zec / p.eth };
    },
    refetchInterval: 60_000,
  });
  const tooSmall = (a: string) => !!fit && Number(a) * fit.ethPerZec < 2 * fit.reserve;

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
    <StepPart n={2} of={STEPS.length} title="Fund the burner" state={step} id="zinc-step-2">
      <div className="space-y-2">
        <p aria-hidden className={label}>
          Pay with
        </p>
        <div role="group" aria-label="Pay with" className="flex flex-wrap gap-2">
          {(["zec", "eth"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={via === v} onClick={() => setVia(v)} className={pill}>
              {v === "zec" ? "Shielded ZEC" : "ETH"}
            </button>
          ))}
        </div>
      </div>
      {via === "eth" ? (
        <p className="leading-relaxed text-paper/80">
          Send ETH to <span className="font-mono text-sm break-all">{burner.address}</span> from any wallet. This is the least private way
          in: the sending wallet is public.
        </p>
      ) : leg ? (
        <div className="space-y-5">
          <p className="leading-relaxed text-paper/80">
            Send exactly <span className="font-mono">{(Number(leg.amountIn) / 1e8).toString()} ZEC</span> from a shielded balance (Zodl,
            Ywallet or any Zcash wallet) to this one-time NEAR address. About {Number(leg.amountOut).toFixed(6)} ETH comes to the burner.
          </p>
          <div className="flex flex-wrap items-start gap-5">
            {leg.uri && (
              <a href={leg.uri} aria-label="Open in a Zcash wallet" className="block w-44 shrink-0 rounded-md bg-white p-2" dangerouslySetInnerHTML={{ __html: encodeQR(leg.uri, "svg") }} />
            )}
            <div className="min-w-0 flex-1 basis-48 space-y-3">
              <p className={label}>One-time NEAR address</p>
              <p className="font-mono text-sm leading-relaxed break-all text-paper">{leg.depositAddress}</p>
              <p role="status" className="font-mono text-xs text-silver">
                NEAR: {state || "waiting"} · pay before {new Date(leg.deadline).toLocaleTimeString()}
              </p>
            </div>
          </div>
          {state === "PENDING_DEPOSIT" && (
            <button type="button" onClick={() => confirm("Forget this address? Only if you have not paid it.") && drop()} className={quiet}>
              I have not paid: start over
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="space-y-2">
            <p aria-hidden className={label}>
              Amount
            </p>
            <div role="group" aria-label="Amount" className="flex flex-wrap gap-2">
              {AMOUNTS.map((a) => (
                <button key={a} type="button" aria-pressed={amount === a} disabled={tooSmall(a)} onClick={() => setAmount(a)} className={pill}>
                  {a} ZEC
                </button>
              ))}
            </div>
          </div>
          {needsPass ? (
            <Passport burner={burner} onPass={() => setPass(true)} main={mainOf(step)} />
          ) : (
            <>
              <Labelled caption="Refund address">
                <input aria-label="Refund address" value={refund} onChange={(e) => setRefund(e.target.value)} placeholder="a transparent ZEC address (t1…)" className={input} autoComplete="off" spellCheck={false} />
              </Labelled>
              <button type="button" onClick={go} disabled={busy} className={mainOf(step)}>
                {busy ? "Asking NEAR…" : "Get a deposit address"}
              </button>
            </>
          )}
          <p className="text-[0.95rem] leading-relaxed text-paper/70">
            Round amounts make your swap look like everyone else&apos;s. Up to {OPEN_LIMIT} ZEC per swap needs nothing; more needs a
            ZKPassport proof, checked in this browser.
            {fit && ` The vault's gas for the round trip is about ${fit.reserve.toFixed(4)} ETH today; amounts too small for it are greyed out.`}
          </p>
        </div>
      )}
      {last && <p role="status" className="font-mono text-xs text-silver">Last swap: {last === "SUCCESS" ? "ETH arrived" : last.toLowerCase()}</p>}
      {error && <p role="alert" className={said}>{error}</p>}
    </StepPart>
  );
}

/**
 * ZKPassport, for amounts above the open limit: the phone proves 18+ and no sanctions list, bound to this burner. Nothing about the person reaches Zinc.
 */
function Passport({ burner, onPass, main }: { burner: Burner; onPass: () => void; main: string }) {
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
    <div className="space-y-4 border-l-[3px] border-paper/40 pl-4">
      <p className={label}>ZKPassport, for more than {OPEN_LIMIT} ZEC</p>
      <p className="leading-relaxed text-paper/80">
        Larger amounts need a ZKPassport proof: your phone reads your passport&apos;s chip and proves you are 18 or older and on
        no sanctions list. Where you are from does not matter, and Zinc never sees your name, number or country. The check
        runs in your browser only: no server or contract enforces it, and it applies to the ZEC amounts offered here.
      </p>
      {asking ? (
        <>
          <a href={asking.url} target="_blank" rel="noreferrer" aria-label="Open in ZKPassport" className="block w-44 rounded-md bg-white p-2" dangerouslySetInnerHTML={{ __html: encodeQR(asking.url, "svg") }} />
          <p role="status" className="font-mono text-xs text-silver">{step}</p>
        </>
      ) : (
        <button type="button" onClick={go} className={main}>
          Prove it with ZKPassport
        </button>
      )}
      {error && <p role="alert" className={said}>{error}</p>}
    </div>
  );
}

function Deposit({ burner, eth, hasNote, depositing, onDone, state }: { burner: Burner; eth: bigint | null; hasNote: boolean; depositing: boolean; onDone: () => void; state: State }) {
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
    <StepPart n={3} of={STEPS.length} title="Make it private" state={state} id="zinc-step-3">
      <p className="leading-relaxed text-paper/80">
        The burner puts its ETH into zkAPI&apos;s vault on Ethereum, less the gas it keeps for the way out. From then on, each use
        is paid with a zero-knowledge proof that does not say which deposit paid.
      </p>
      <p className={warn}>The balance is a note kept in this browser: clearing this site&apos;s data loses it.</p>
      <button type="button" onClick={go} disabled={busy || hasNote || depositing || !eth} className={mainOf(state)}>
        {hasNote ? "Private balance open" : busy || depositing ? "Depositing…" : "Deposit into zkAPI"}
      </button>
      {status && <p role="status" className="font-mono text-xs text-silver">{status}</p>}
      {error && <p role="alert" className={said}>{error}</p>}
    </StepPart>
  );
}

function Use({ burner, hasNote, state }: { burner: Burner; hasNote: boolean; state: State }) {
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [tier, setTier] = useState<number>(TIERS[0]);
  const [agentKey, setAgentKey] = useState<string | null>(null);
  const [chat, setChat] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void import("@/lib/zinc/chat").then(({ MODELS }) => (setModels(MODELS), setModel(MODELS[0])));
  }, []);

  // a key per message, let go when the answer is in: zkAPI keeps a live key for the next one (a key lives about five
  // minutes) and makes a new one when it has run out
  async function withKey<T>(run: (apiKey: string) => Promise<T>) {
    const { access } = await import("@/lib/zinc/zkapi");
    const k = await access(burner, tier, setBusy);
    try {
      return await run(k.apiKey);
    } finally {
      k.release();
    }
  }

  async function send() {
    const text = draft.trim();
    if (!text) return;
    setError(null);
    const history: Message[] = [...chat, { role: "user", content: text }];
    setChat(history);
    setDraft("");
    try {
      const { ask } = await import("@/lib/zinc/chat");
      await withKey((apiKey) => {
        setBusy("Thinking…");
        return ask(apiKey, model, history, (t) => setChat([...history, { role: "assistant", content: t }]));
      });
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy("");
    }
  }

  async function forAgent() {
    setError(null);
    try {
      setAgentKey(await withKey(async (apiKey) => apiKey));
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <StepPart n={4} of={STEPS.length} title="Ask anything" state={state} id="zinc-step-4">
      {!hasNote ? (
        <p className="leading-relaxed text-paper/70">Once the private balance is open, any OpenRouter model answers here, paid by proof.</p>
      ) : (
        <>
          <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Labelled caption="Model">
              <select aria-label="Model" value={model} onChange={(e) => setModel(e.target.value)} className={`${input} cursor-pointer`}>
                {models.map((m) => (
                  <option key={m} value={m} className="bg-developer">
                    {m}
                  </option>
                ))}
              </select>
            </Labelled>
            <Labelled caption="Spending cap">
              <select aria-label="Spending cap" value={tier} onChange={(e) => setTier(Number(e.target.value))} className={`${input} cursor-pointer`}>
                {TIERS.map((t) => (
                  <option key={t} value={t} className="bg-developer">
                    up to ${t} per key
                  </option>
                ))}
              </select>
            </Labelled>
          </div>
          {chat.length > 0 && (
            <div className="max-h-96 space-y-4 overflow-y-auto rounded-lg bg-tray/50 p-4">
              {chat.map((m, i) => (
                // the answer being written is read out once it is done, not word by word
                <p key={i} aria-live={i === chat.length - 1 && m.role === "assistant" && !busy ? "polite" : undefined} className={m.role === "user" ? "border-l-2 border-paper pl-3 text-paper" : "whitespace-pre-wrap leading-relaxed text-paper/80"}>
                  {m.content}
                </p>
              ))}
            </div>
          )}
          <form onSubmit={(e) => (e.preventDefault(), void send())} className="flex items-end gap-3">
            <input aria-label="Message" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="ask" className={input} />
            <button type="submit" disabled={!!busy} className={mainOf(state)}>
              Send
            </button>
          </form>
          {busy && <p role="status" className="font-mono text-xs text-silver motion-safe:animate-pulse">{busy}</p>}
          <button type="button" onClick={forAgent} disabled={!!busy} className={quiet}>
            {agentKey ? "Take a new key for an agent" : "Use it from an agent"}
          </button>
          {agentKey && <AgentKey k={agentKey} model={model} />}
        </>
      )}
      {error && <p role="alert" className={said}>{error}</p>}
    </StepPart>
  );
}

function AgentKey({ k, model }: { k: string; model: string }) {
  const [snippet, setSnippet] = useState("");
  useEffect(() => {
    void import("@/lib/zinc/chat").then(({ curl }) => setSnippet(curl(k, model)));
  }, [k, model]);
  return (
    <div className="space-y-3">
      <p className="text-[0.95rem] leading-relaxed text-paper/70">
        A key with the cap above, for any OpenAI-compatible client. It lives about five minutes, or until the cap is spent;
        only what is used is charged. Take a new one here when it stops.
      </p>
      <pre className="overflow-x-auto rounded-lg bg-tray/60 p-4 font-mono text-xs leading-relaxed text-paper/85">{snippet}</pre>
      <button type="button" onClick={() => void navigator.clipboard.writeText(snippet)} className={quiet}>
        Copy
      </button>
    </div>
  );
}

type Pending = { recordId: string; mode: "mutual" | "escape"; phase: string; challengeDeadline?: number };

function Exit({ burner, hasNote, pending, eth, onWiped, state: step }: { burner: Burner; hasNote: boolean; pending: Pending | null; eth: bigint | null; onWiped: () => void; state: State }) {
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { leg, state, start, drop } = useLeg(OUT, async (s) => {
    if (s !== "SUCCESS") return setError(`NEAR: ${s.toLowerCase()}. A refund goes back to the burner as ETH.`);
    // wipe only an empty burner: ETH that came in after the quote (a late close, a late swap) stays reachable
    const { balanceOf, wipeBurner } = await import("@/lib/zinc/burner");
    if ((await balanceOf(burner)) > 200_000_000_000_000n) return setError("ZEC is on its way, but ETH is still on the burner. Send it home again.");
    wipeBurner();
    (await import("@/lib/zinc/passport")).forgetPassport();
    onWiped();
  });

  async function go() {
    setError(null);
    const { isZcashAddress, isTransparent, quote, submitted, ETH, ZEC } = await import("@/lib/zinc/oneclick");
    if (!isZcashAddress(to)) return setError("Use a unified ZEC address (u1…); NEAR does not pay to Sapling (zs1…) addresses.");
    if (isTransparent(to) && !confirm("That is a transparent address: anyone can see what arrives there. Use it anyway?")) return;
    try {
      // NEAR checks the address before anything closes: a refused address must not leave a closed balance behind
      setBusy("Checking the address with NEAR…");
      await quote(ETH, ZEC, "0.01", to.trim(), burner.address, true);
      const { withdraw } = await import("@/lib/zinc/zkapi");
      const { balanceOf, sendable, send } = await import("@/lib/zinc/burner");
      if (hasNote) {
        const before = await balanceOf(burner);
        await withdraw(burner, "mutual", setBusy);
        // a public RPC can lag the close by a block or two: quote only once the closed note's ETH shows
        setBusy("Waiting for the closed balance on the burner…");
        for (let i = 0; i < 30 && (await balanceOf(burner)) <= before; i++) await new Promise((r) => setTimeout(r, 4000));
      }
      setBusy("Asking NEAR for a quote…");
      const s = await sendable(burner);
      const q = await quote(ETH, ZEC, formatEther(s.value), to.trim(), burner.address);
      start({ depositAddress: q.depositAddress, amountIn: q.amountIn, amountOut: q.amountOutFormatted, deadline: q.deadline });
      setBusy("Sending the ETH to NEAR…");
      let hash: Hex;
      try {
        hash = await send(burner, q.depositAddress as Hex, s);
      } catch (e) {
        drop();
        throw e;
      }
      await submitted(q.depositAddress, hash);
      setBusy("");
    } catch (e) {
      setError(err(e));
      setBusy("");
    }
  }

  async function finish() {
    if (!pending) return;
    setError(null);
    try {
      await (await import("@/lib/zinc/zkapi")).finishEscape(burner, pending.recordId, setBusy);
      setBusy("");
    } catch (e) {
      setError(err(e));
      setBusy("");
    }
  }
  const deadline = pending?.challengeDeadline ? new Date(pending.challengeDeadline * 1000) : null;

  async function escape() {
    if (!confirm("The slow way out works without the zkAPI server, but takes a 24-hour challenge window. Start it?")) return;
    try {
      await (await import("@/lib/zinc/zkapi")).withdraw(burner, "escape", setBusy);
    } catch (e) {
      setError(err(e));
    }
  }

  return (
    <StepPart n={5} of={STEPS.length} title="Back to shielded ZEC" state={step} id="zinc-step-5">
      {leg ? (
        <p role="status" className="font-mono text-xs leading-relaxed text-silver">
          NEAR: {state || "waiting"} · about {Number(leg.amountOut).toFixed(4)} ZEC on its way. The burner is wiped when it lands.
        </p>
      ) : null}
      {leg && state === "PENDING_DEPOSIT" && !busy && (
        <button type="button" onClick={() => confirm("Forget this NEAR address? Only if the burner has not sent to it.") && drop()} className={quiet}>
          Nothing was sent: start over
        </button>
      )}
      {leg ? null : pending ? (
        <div className="space-y-5">
          <p className="leading-relaxed text-paper/80">
            {pending.mode === "escape"
              ? `The slow way out is under way. After ${deadline ? deadline.toLocaleString() : "the 24-hour window"}, finish it to pay the balance to the burner; then send it home.`
              : "The private balance is closing. Once it is closed, send the ETH home."}
          </p>
          {pending.mode === "escape" && (
            <button type="button" onClick={finish} disabled={!!busy || !deadline || deadline > new Date()} className={mainOf(step)}>
              Finish the slow way out
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="leading-relaxed text-paper/80">
            Closes the private balance, then the burner sends all it holds to NEAR, which pays ZEC to a fresh shielded address of
            yours. Wait a while after your last use, and it is harder to tie the two ends together.
          </p>
          <Labelled caption="Your shielded ZEC address">
            <input aria-label="Your shielded ZEC address" value={to} onChange={(e) => setTo(e.target.value)} placeholder="a fresh unified ZEC address (u1…)" className={input} autoComplete="off" spellCheck={false} />
          </Labelled>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <button type="button" onClick={go} disabled={!!busy || (!hasNote && !eth)} className={mainOf(step)}>
              {busy ? "Working…" : "Close and send home"}
            </button>
            {hasNote && !pending && (
              <button type="button" onClick={escape} className={quiet}>
                zkAPI server down? The slow way out
              </button>
            )}
          </div>
        </>
      )}
      {busy && <p role="status" className="font-mono text-xs text-silver">{busy}</p>}
      {error && <p role="alert" className={said}>{error}</p>}
    </StepPart>
  );
}
