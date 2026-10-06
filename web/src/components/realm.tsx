"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import {
  BaseError,
  ContractFunctionRevertedError,
  erc20Abi,
  formatEther,
  parseEther,
  parseEventLogs,
  parseUnits,
  UserRejectedRequestError,
  type Address,
  type Hex,
} from "viem";
import { useAccount, useBalance, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from "wagmi";

import { priceFeedAbi, realmFactoryAbi, realmHookAbi, routerAbi } from "@/lib/abi";
import { ADDR, CHAIN_ID } from "@/lib/config";
import { tokens } from "@/lib/format";
import { refused } from "@/lib/moderation";
import { baseOf, BASES, FEES, feeLabel, imageSrc, OPENING_FDV_USD, realmKey, SUPPLY } from "@/lib/realm";

import { action, field, label, second } from "./journal";
import { Connect } from "./realm-you";

const button = `${action} min-h-11`;
const big = `${action} min-h-12 w-full text-[14px]`;
const alert = "border-l-2 border-paper pl-3 text-[0.95rem] leading-snug text-paper";
// a small choice: the tap area is a full 44 px on a phone, the ink fill only as tall as the word
const choice = "group inline-flex min-h-11 items-center font-mono text-[12px] tracking-[0.04em] tabular-nums aria-pressed:text-developer sm:min-h-9";
const ink =
  "rounded-full border border-paper/25 px-3 py-1 transition-colors group-hover:border-paper group-aria-pressed:border-paper group-aria-pressed:bg-paper";

/** A set of choices under a small label, with a short hint. */
function Choice({ legend, hint, children }: { legend: string; hint: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="space-y-1">
        <span className={`${label} block`}>{legend}</span>
        <span className="block text-[0.95rem] leading-snug text-paper/70">{hint}</span>
      </legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

/** One choice of a set: a radio drawn as a pill. */
function Pill({ name, checked, onChange, children }: { name: string; checked: boolean; onChange: () => void; children: React.ReactNode }) {
  return (
    <label className="cursor-pointer">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="peer sr-only" />
      <span className="inline-flex min-h-11 items-center rounded-full border border-paper/25 px-4 font-mono text-[13px] tabular-nums transition-colors peer-checked:border-paper peer-checked:bg-paper peer-checked:text-developer peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:outline-offset-2 hover:border-paper sm:min-h-9">
        {children}
      </span>
    </label>
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

/** Dollar prices the forms need: ETH from Chainlink, ZC and SC from the app's medians. */
function usePrices() {
  const eth = useReadContract({ address: ADDR.ethUsdFeed, abi: priceFeedAbi, functionName: "latestRoundData" });
  const coins = useQuery({
    queryKey: ["coinUsd"],
    queryFn: async () => {
      const h = await (await fetch("/api/health")).json();
      return { zc: Number(h.zcUsd) || null, sc: Number(h.scUsd) || null, stocker: Number(h.stockerUsd) || null };
    },
    refetchInterval: 60_000,
  });
  const ethUsd = eth.data ? Number(eth.data[1]) / 1e8 : null;
  return { eth: ethUsd, zc: coins.data?.zc ?? null, sc: coins.data?.sc ?? null, stocker: coins.data?.stocker ?? null };
}

/** Launch a token from your own Realm. */
export function LaunchForm() {
  const { address, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const router = useRouter();
  const usd = usePrices();
  const burnEth = useReadContract({ address: ADDR.realmFactory, abi: realmFactoryAbi, functionName: "ethForBurn" });

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [uri, setUri] = useState("");
  // kept so the image is sent again right before the launch: an upload nobody launches with is dropped after a day
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [xHandle, setXHandle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [base, setBase] = useState<(typeof BASES)[number]["id"]>("eth");
  const [fee, setFee] = useState<number>(10_000);
  const [devBuy, setDevBuy] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const baseUsd = { eth: usd.eth, zc: usd.zc, sc: usd.sc, stocker: usd.stocker }[base];

  async function upload(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.size > 512 * 1024) return setError("The image must be 512 KB or less.");
    setUploading(true);
    try {
      const res = await fetch("/api/realm/image", { method: "POST", body: file });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `upload failed (${res.status})`);
      setUri(body.uri);
      setFile(file);
    } catch (e) {
      setError(`The image did not upload: ${e instanceof Error ? e.message : String(e)}.`);
    } finally {
      setUploading(false);
    }
  }

  async function launch() {
    if (!client || !address) return;
    setError(null);
    if (name.trim().length < 2 || name.trim().length > 32) return setError("Give it a name of 2 to 32 characters.");
    if (!/^[A-Z0-9]{2,10}$/.test(symbol)) return setError("A symbol is 2 to 10 capital letters or digits.");
    const word = refused({ v: 1, questions: [{ q: `${name} ${symbol} ${description}`, options: [] }] });
    if (word) return setError(`Silverchat does not show tokens with "${word}" in the name or symbol.`);
    // our own uploads or any https link: those are what the token page can show
    if (uri && !imageSrc(uri)) return setError("The image link must start with https://.");
    if (website && !/^https:\/\/\S{3,200}$/.test(website)) return setError("The website must be an https link.");
    const handle = xHandle.trim().replace(/^@/, "").replace(/^https:\/\/(www\.)?(x|twitter)\.com\//, "").replace(/\/$/, "");
    if (handle && !/^[A-Za-z0-9_]{1,15}$/.test(handle)) return setError("Write the X account as its handle, like @silverchat.");
    if (!baseUsd || !usd.eth || !usd.sc || burnEth.data === undefined) return setError("Prices are still loading; try again in a moment.");
    let dev = 0n;
    try {
      dev = devBuy ? parseEther(devBuy) : 0n;
    } catch {
      return setError("Write the first buy as a number of ETH.");
    }
    const b = BASES.find((x) => x.id === base)!;
    // $4,000 of the base for the whole supply, like Stockereum's launches
    const openingFdv = parseUnits((OPENING_FDV_USD / baseUsd).toFixed(6), 18);
    // the $5 buys SC through two 1% pools; refuse less than 90% of that
    const minScBurned = parseUnits(((5 / usd.sc) * 0.98 * 0.9).toFixed(6), 18);
    // the first buy on a ZC or SC pair goes through one or two other pools, where a moved price could take it: the
    // fresh pool is a constant product of the supply and the opening value, so expect that and refuse under 90%
    // ETH→ZC, ETH→STOCKER: one pool; ETH→ZC→SC: two
    const hops = base === "eth" ? 0 : base === "sc" ? 2 : 1;
    const net = (Number(formatEther(dev)) * usd.eth * 0.99 ** hops * (1 - fee / 1e6)) / baseUsd;
    const netWei = parseUnits(net.toFixed(12), 18);
    const minTokensOut = dev === 0n ? 0n : (((SUPPLY * netWei) / (openingFdv + netWei)) * 9n) / 10n;
    // a little over today's price for the burn; what is not used comes back in the same transaction
    const value = (burnEth.data * 102n) / 100n + dev;
    setBusy(true);
    try {
      if (file) {
        setNote("Sending the image…");
        const res = await fetch("/api/realm/image", { method: "POST", body: file });
        if (!res.ok) throw new Error("the image could not be stored; try again");
      } else if (uri.includes("/api/realm/image/")) {
        const own = await fetch(imageSrc(uri)!, { method: "HEAD" }).catch(() => null);
        if (!own?.ok) throw new Error("that image is no longer stored here; upload it again");
      }
      // the image, description and links go on-chain as one link to their JSON, stored here under its own hash
      let launchUri = uri;
      if (description.trim() || website || handle) {
        setNote("Saving the description…");
        const res = await fetch("/api/realm/meta", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ image: uri || null, description: description.trim() || null, website: website || null, x: handle || null }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "the description could not be saved");
        launchUri = body.uri;
      }
      setNote("Confirm the launch in your wallet…");
      const { request } = await client.simulateContract({
        account: address,
        address: ADDR.realmFactory,
        abi: realmFactoryAbi,
        functionName: "launch",
        args: [{ name: name.trim(), symbol, uri: launchUri, base: b.address, feePpm: fee, openingFdv, minScBurned, devBuyEth: dev, minTokensOut }],
        value,
      });
      const tx = await writeContractAsync({ ...request, chainId: CHAIN_ID });
      const receipt = await client.waitForTransactionReceipt({ hash: tx });
      if (receipt.status !== "success") throw new Error("the transaction reverted");
      const [launched] = parseEventLogs({ abi: realmFactoryAbi, logs: receipt.logs, eventName: "Launched" });
      setNote("Launched. Waiting for the record…");
      for (let i = 0; i < 30; i++) {
        if ((await fetch(`/api/realm/token/${launched.args.token}`).catch(() => null))?.ok) break;
        await new Promise((r) => setTimeout(r, 2000));
      }
      router.push(`/realm/token/${launched.args.token}`);
    } catch (e) {
      setBusy(false);
      setNote(null);
      setError(explain(e));
    }
  }

  const lab = `${label} block`;
  // the form in three steps, each under a small numbered heading, like a page of instructions
  const step = (n: string, title: string) => (
    <h3 className="flex items-baseline gap-3 border-b border-dashed border-paper/25 pb-2 text-xl">
      <span className="font-mono text-[11px] text-silver">{n}</span>
      {title}
    </h3>
  );
  return (
    <form className="space-y-10" onSubmit={(e) => e.preventDefault()}>
      <fieldset disabled={busy} className="space-y-9">
        <legend className="sr-only">The token</legend>
        {step("01", "The sign")}
        <div className="grid gap-7 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <label className="block space-y-1">
            <span className={lab}>Name</span>
            <input value={name} maxLength={32} onChange={(e) => setName(e.target.value)} placeholder="Snowmoon" className={`${field} text-2xl`} />
          </label>
          <label className="block space-y-1">
            <span className={lab}>Symbol</span>
            <input value={symbol} maxLength={10} onChange={(e) => setSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder="MOON" className={`${field} font-mono text-2xl tracking-[0.06em]`} />
          </label>
        </div>
        <div className="space-y-3">
          <span className={lab}>Image · optional</span>
          <div className="flex items-center gap-5">
            {imageSrc(uri) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageSrc(uri)!} alt="" width={72} height={72} className="h-[4.5rem] w-[4.5rem] shrink-0 rounded-md object-cover ring-1 ring-paper/15" />
            ) : (
              <span aria-hidden className="grid h-[4.5rem] w-[4.5rem] shrink-0 place-items-center rounded-md border border-dashed border-paper/35 font-mono text-[11px] text-silver">
                {symbol.slice(0, 4) || "?"}
              </span>
            )}
            <span className="space-y-2">
              <label className={`${second} min-h-11 cursor-pointer has-[:focus-visible]:outline has-[:focus-visible]:outline-1 has-[:focus-visible]:outline-offset-2`}>
                {uploading ? "Uploading…" : uri ? "Change image" : "Upload an image"}
                <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
              </label>
              <span className="block font-mono text-[11px] text-silver">PNG, JPEG, GIF or WebP, up to 512 KB</span>
            </span>
          </div>
          <label className="block space-y-1 pt-1">
            <span className="block text-[0.95rem] text-paper/70">Or paste a link to an image</span>
            <input value={uri} maxLength={300} onChange={(e) => {
                setUri(e.target.value.trim());
                setFile(null);
              }} placeholder="https://…" className={`${field} font-mono text-sm`} />
          </label>
        </div>
        <label className="block space-y-1">
          <span className={lab}>Description · optional</span>
          <textarea value={description} maxLength={280} rows={3} onChange={(e) => setDescription(e.target.value)} placeholder="What it is, in a sentence or two." className={`${field} resize-none leading-snug`} />
        </label>
        <div className="grid gap-7 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className={lab}>Website · optional</span>
            <input value={website} maxLength={200} onChange={(e) => setWebsite(e.target.value.trim())} placeholder="https://…" className={`${field} font-mono text-sm`} />
          </label>
          <label className="block space-y-1">
            <span className={lab}>X account · optional</span>
            <input value={xHandle} maxLength={40} onChange={(e) => setXHandle(e.target.value.trim())} placeholder="@handle" className={`${field} font-mono text-sm`} />
          </label>
        </div>
        {step("02", "The market")}
        <Choice legend="Trades against" hint="The coin people pay in, and the one its fees are taken in.">
          {BASES.map((b) => (
            <Pill key={b.id} name="base" checked={base === b.id} onChange={() => setBase(b.id)}>
              {b.name}
            </Pill>
          ))}
        </Choice>
        <Choice legend="Trading fee" hint="All of it is burned: 80% as $SC, 20% as $ZC.">
          {FEES.map((f) => (
            <Pill key={f} name="fee" checked={fee === f} onChange={() => setFee(f)}>
              {feeLabel(f)}
            </Pill>
          ))}
        </Choice>
        <label className="block space-y-1">
          <span className={lab}>Your first buy, in ETH · optional</span>
          <input inputMode="decimal" value={devBuy} onChange={(e) => setDevBuy(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" className={`${field} text-2xl tabular-nums`} />
          <span className="block pt-1 text-[0.95rem] leading-snug text-paper/70">
            Bought in the launch transaction at the trading fee. Anyone else in the first 20 seconds pays up to 99%.
          </span>
        </label>
      </fieldset>

      <div className="space-y-5">
        {step("03", "Light it")}
        <p className="max-w-[34em] leading-relaxed text-paper/85">
          Launching buys $5 of $SC and burns it
          {burnEth.data !== undefined && ` (about ${Number(formatEther(burnEth.data)).toFixed(5)} ETH)`}. The whole
          supply, one billion, goes into the pool at a ${OPENING_FDV_USD.toLocaleString("en-US")} valuation and stays
          there: nobody can take the liquidity out.
        </p>
        {!address ? (
          <Connect label="Connect a wallet to launch" />
        ) : chainId !== CHAIN_ID ? (
          <button type="button" onClick={() => switchChain({ chainId: CHAIN_ID })} className={button}>
            Switch to Ethereum
          </button>
        ) : (
          <button type="button" onClick={launch} disabled={busy || uploading} className={button}>
            {busy ? note : "Burn $5 of SC and launch"}
          </button>
        )}
        {error && (
          <p role="alert" className={alert}>
            {error}
          </p>
        )}
      </div>
    </form>
  );
}

const BUY_PRESETS = ["0.1", "0.25", "0.5", "1"];
const ETH_FOR_GAS = 10n ** 16n;
const PCT_PRESETS = ["10", "25", "50", "100"];

const PRESETS_EVENT = "silverrealm-presets";
const onPresets = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener(PRESETS_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(PRESETS_EVENT, cb);
  };
};

/** Quick amounts, each person's own, kept in this browser; storage that fails (private mode) falls back to the defaults. */
function usePresets(key: string, defaults: string[]) {
  const raw = useSyncExternalStore(
    onPresets,
    () => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    () => null,
  );
  let list = defaults;
  try {
    const saved = JSON.parse(raw ?? "null");
    if (Array.isArray(saved) && saved.length === defaults.length && saved.every((x) => typeof x === "string")) list = saved;
  } catch {}
  const save = (next: string[]) => {
    try {
      localStorage.setItem(key, JSON.stringify(next));
      window.dispatchEvent(new Event(PRESETS_EVENT));
    } catch {}
  };
  return [list, save] as const;
}

/** A row of quick amounts with an edit button that turns them into inputs. */
function Presets({ values, onPick, onSave, unit }: { values: string[]; onPick: (v: string) => void; onSave: (v: string[]) => void; unit: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(values);
  const chip = choice;
  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {draft.map((v, i) => (
          <input
            key={i}
            value={v}
            inputMode="decimal"
            aria-label={`Quick amount ${i + 1}`}
            onChange={(e) => setDraft(draft.map((x, j) => (j === i ? e.target.value.replace(/[^0-9.]/g, "") : x)))}
            className="min-h-11 w-16 border-0 border-b border-paper/30 bg-transparent px-1 py-1.5 font-mono text-xs tabular-nums focus:border-paper focus:ring-0 focus:outline-none sm:min-h-8"
          />
        ))}
        <button
          type="button"
          onClick={() => {
            // a share is at most the whole balance
            onSave(draft.map((x, i) => (Number(x) > 0 ? (unit === "%" ? String(Math.min(100, Number(x))) : x) : values[i])));
            setEditing(false);
          }}
          className={chip}
        >
          <span className={ink}>Save</span>
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {values.map((v, i) => (
        <button key={i} type="button" onClick={() => onPick(v)} className={chip}>
          <span className={ink}>{unit === "%" ? (v === "100" ? "Max" : `${v}%`) : `${v} ${unit}`}</span>
        </button>
      ))}
      <button
        type="button"
        onClick={() => {
          setDraft(values);
          setEditing(true);
        }}
        aria-label="Edit the quick amounts"
        title="Edit the quick amounts"
        className="min-h-11 px-2 font-mono text-[11px] uppercase tracking-[0.12em] text-silver underline decoration-paper/25 underline-offset-4 hover:text-paper sm:min-h-8"
      >
        edit
      </button>
    </div>
  );
}

/**
 * Buy or sell a SilverRealm token through Stockereum's router. ETH pairs trade in ETH; ZC and STOCKER pairs in ETH (the
 * router buys the coin on the way) or in the coin itself; SC pairs in SC, which has no ETH route on the router.
 */
export function TradeBox({ token, base, symbol, poolId }: { token: Address; base: Address; symbol: string; poolId: Hex }) {
  const { address, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const router = useRouter();
  const b = baseOf(base)!;
  const ethPair = b.id === "eth";
  const ethRoute = b.id === "zc" || b.id === "stocker";
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [withEth, setWithEth] = useState(b.id !== "sc");
  const [slippage, setSlippage] = useState(2);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const key = realmKey(token, base);
  const eth = withEth || ethPair;
  const coinName = eth ? "ETH" : b.name;
  const payName = side === "buy" ? coinName : symbol;
  const getName = side === "buy" ? symbol : coinName;

  const fee = useReadContract({ address: ADDR.realmHook, abi: realmHookAbi, functionName: "currentFee", args: [poolId], query: { refetchInterval: 5000 } });
  const ethBal = useBalance({ address, query: { enabled: !!address } });
  const payCoin = side === "sell" ? token : eth ? null : base;
  const coinBal = useReadContract({ address: payCoin ?? token, abi: erc20Abi, functionName: "balanceOf", args: address ? [address] : undefined, query: { enabled: !!address && !!payCoin } });
  const balance = payCoin ? coinBal.data : ethBal.data?.value;
  const [buyPresets, saveBuyPresets] = usePresets("silverrealm:buy-eth", BUY_PRESETS);
  const [buyPct, saveBuyPct] = usePresets("silverrealm:buy-pct", PCT_PRESETS);
  const [sellPct, saveSellPct] = usePresets("silverrealm:sell-pct", PCT_PRESETS);
  // a share of what you hold: the token when selling, the coin when buying with it
  const pickPct = (v: string) => {
    if (balance === undefined) return;
    const part = v === "100" ? balance : (balance * BigInt(Math.round(Number(v) * 100))) / 10_000n;
    setAmount(formatEther(part));
  };

  let wei = 0n;
  try {
    wei = amount ? parseEther(amount) : 0n;
  } catch {}

  const quote = useQuery({
    queryKey: ["realmQuote", token, side, eth, wei.toString()],
    enabled: !!client && wei > 0n,
    queryFn: async () => {
      const r = ADDR.stockereumRouter;
      if (side === "buy") {
        if (!eth) return client!.readContract({ address: r, abi: routerAbi, functionName: "quoteBuy", args: [key, base, wei] });
        return (await client!.readContract({ address: r, abi: routerAbi, functionName: "quoteBuyWithEth", args: [key, base, wei] }))[1];
      }
      if (!eth) return client!.readContract({ address: r, abi: routerAbi, functionName: "quoteSell", args: [key, token, wei] });
      return (await client!.readContract({ address: r, abi: routerAbi, functionName: "quoteSellForEth", args: [key, token, base, wei] }))[1];
    },
    refetchInterval: 15_000,
  });

  async function approve(coin: Address) {
    const allowance = await client!.readContract({ address: coin, abi: erc20Abi, functionName: "allowance", args: [address!, ADDR.stockereumRouter] });
    if (allowance >= wei) return;
    setNote("Approve it in your wallet…");
    const tx = await writeContractAsync({ address: coin, abi: erc20Abi, functionName: "approve", args: [ADDR.stockereumRouter, wei], chainId: CHAIN_ID });
    if ((await client!.waitForTransactionReceipt({ hash: tx })).status !== "success") throw new Error("the approval reverted");
  }

  async function trade() {
    if (!client || !address || wei === 0n || quote.data === undefined) return;
    setBusy(true);
    setError(null);
    // a moved price refuses the trade rather than fill it worse than the slippage you chose
    const minOut = (quote.data * BigInt(100 - slippage)) / 100n;
    try {
      let call;
      if (side === "buy") {
        if (ethPair) call = { functionName: "buyWethPairWithEth", args: [key, minOut, "0x"], value: wei } as const;
        else if (eth) call = { functionName: "buyWithEth", args: [key, base, 0n, minOut, "0x"], value: wei } as const;
        else {
          await approve(base);
          call = { functionName: "buy", args: [key, base, wei, minOut, "0x"] } as const;
        }
      } else {
        await approve(token);
        if (ethPair) call = { functionName: "sellWethPairForEth", args: [key, token, wei, minOut, "0x"] } as const;
        else if (eth) call = { functionName: "sellForEth", args: [key, token, base, wei, 0n, minOut, "0x"] } as const;
        else call = { functionName: "sell", args: [key, token, base, wei, minOut, "0x"] } as const;
      }
      setNote("Confirm the trade in your wallet…");
      const { request } = await client.simulateContract({ account: address, address: ADDR.stockereumRouter, abi: routerAbi, ...call } as never);
      const tx = await writeContractAsync({ ...(request as object), chainId: CHAIN_ID } as never);
      if ((await client.waitForTransactionReceipt({ hash: tx })).status !== "success") throw new Error("the transaction reverted");
      setAmount("");
      router.refresh();
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(false);
      setNote(null);
    }
  }

  const tab = choice;
  return (
    <div className="space-y-6">
      <div role="group" aria-label="Buy or sell" className="grid grid-cols-2 rounded-full border border-paper/25 p-1">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={side === s}
            onClick={() => setSide(s)}
            className="min-h-11 rounded-full font-mono text-[13px] tracking-[0.06em] text-silver transition-colors hover:text-paper aria-pressed:bg-paper aria-pressed:text-developer"
          >
            {s === "buy" ? "Buy" : "Sell"}
          </button>
        ))}
      </div>
      {ethRoute && (
        <div role="group" aria-label={side === "buy" ? "Pay with" : "Receive"} className="flex flex-wrap items-center gap-2">
          <span className={`${label} mr-1`}>{side === "buy" ? "Pay with" : "Receive"}</span>
          <button type="button" aria-pressed={withEth} onClick={() => setWithEth(true)} className={tab}>
            <span className={ink}>ETH</span>
          </button>
          <button type="button" aria-pressed={!withEth} onClick={() => setWithEth(false)} className={tab}>
            <span className={ink}>{b.name}</span>
          </button>
        </div>
      )}
      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="trade-amount" className={label}>
            Amount, in {payName}
          </label>
          {balance !== undefined && (
            <button
              type="button"
              // paying in ETH keeps 0.01 back for gas
              onClick={() => setAmount(formatEther(payCoin ? balance : balance > ETH_FOR_GAS ? balance - ETH_FOR_GAS : 0n))}
              className="-my-3 py-3 font-mono text-[11px] text-silver tabular-nums underline decoration-paper/25 underline-offset-4 hover:text-paper"
            >
              balance {tokens(balance, 4)}
            </button>
          )}
        </div>
        <input
          id="trade-amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="0.0"
          className={`${field} text-[2rem] leading-tight tabular-nums`}
        />
        {side === "buy" && eth ? (
          <Presets key="eth" values={buyPresets} onPick={setAmount} onSave={saveBuyPresets} unit="ETH" />
        ) : (
          <Presets key={side} values={side === "sell" ? sellPct : buyPct} onPick={pickPct} onSave={side === "sell" ? saveSellPct : saveBuyPct} unit="%" />
        )}
      </div>
      <dl className="space-y-3 border-y border-dashed border-paper/25 py-4">
        <div className="flex items-baseline justify-between gap-4">
          <dt className={label}>You get about</dt>
          <dd className="text-right text-xl tabular-nums">
            {quote.data !== undefined ? tokens(quote.data, 4) : "…"} <span className="font-mono text-xs text-silver">{getName}</span>
          </dd>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <dt className={label}>Slippage</dt>
          <dd className="flex gap-1.5">
            {[1, 2, 5].map((s) => (
              <button key={s} type="button" aria-pressed={slippage === s} onClick={() => setSlippage(s)} className={tab}>
                <span className={ink}>{s}%</span>
              </button>
            ))}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className={label}>Fee</dt>
          <dd className="font-mono text-xs tabular-nums">{fee.data !== undefined ? `${Number(fee.data) / 10_000}%` : "·"}, all burned</dd>
        </div>
      </dl>
      {!address ? (
        <Connect label="Connect a wallet to trade" className="w-full" />
      ) : chainId !== CHAIN_ID ? (
        <button type="button" onClick={() => switchChain({ chainId: CHAIN_ID })} className={big}>
          Switch to Ethereum
        </button>
      ) : (
        <button type="button" onClick={trade} disabled={busy || wei === 0n || quote.data === undefined} className={big}>
          {busy ? note : side === "buy" ? `Buy ${symbol}` : `Sell ${symbol}`}
        </button>
      )}
      {error && (
        <p role="alert" className={alert}>
          {error}
        </p>
      )}
    </div>
  );
}
