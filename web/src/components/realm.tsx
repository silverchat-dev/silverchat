"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
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

import { Choice, Pill } from "./ask-form";

const button = "bg-developer px-5 py-3 font-mono text-sm text-paper disabled:opacity-50";
const field = "w-full border border-developer/50 bg-transparent px-3 py-2 font-mono text-sm";

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

  return (
    <form className="space-y-9 bg-paper px-5 py-7 text-developer sm:px-9 sm:py-9" onSubmit={(e) => e.preventDefault()}>
      <fieldset disabled={busy} className="space-y-9">
        <div className="grid gap-7 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="block font-mono text-xs uppercase tracking-[0.14em]">Name</span>
            <input value={name} maxLength={32} onChange={(e) => setName(e.target.value)} placeholder="Snowmoon" className={field} />
          </label>
          <label className="space-y-2">
            <span className="block font-mono text-xs uppercase tracking-[0.14em]">Symbol</span>
            <input value={symbol} maxLength={10} onChange={(e) => setSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder="MOON" className={field} />
          </label>
        </div>
        <div className="space-y-2">
          <span className="block font-mono text-xs uppercase tracking-[0.14em]">Image · optional</span>
          <div className="flex items-center gap-4">
            {imageSrc(uri) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageSrc(uri)!} alt="" width={64} height={64} className="h-16 w-16 shrink-0 object-cover" />
            )}
            <label className="cursor-pointer border border-developer/50 px-4 py-2 font-mono text-sm">
              {uploading ? "Uploading…" : uri ? "Change image" : "Upload an image"}
              <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
            </label>
          </div>
          <span className="block text-sm text-developer/70">PNG, JPEG, GIF or WebP, up to 512 KB. Or paste a link:</span>
          <input value={uri} maxLength={300} onChange={(e) => {
              setUri(e.target.value.trim());
              setFile(null);
            }} placeholder="https://… link to an image" className={field} />
        </div>
        <label className="block space-y-2">
          <span className="block font-mono text-xs uppercase tracking-[0.14em]">Description · optional</span>
          <textarea value={description} maxLength={280} rows={3} onChange={(e) => setDescription(e.target.value)} placeholder="What it is, in a sentence or two." className={`${field} resize-none`} />
        </label>
        <div className="grid gap-7 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="block font-mono text-xs uppercase tracking-[0.14em]">Website · optional</span>
            <input value={website} maxLength={200} onChange={(e) => setWebsite(e.target.value.trim())} placeholder="https://…" className={field} />
          </label>
          <label className="space-y-2">
            <span className="block font-mono text-xs uppercase tracking-[0.14em]">X account · optional</span>
            <input value={xHandle} maxLength={40} onChange={(e) => setXHandle(e.target.value.trim())} placeholder="@handle" className={field} />
          </label>
        </div>
        <Choice legend="Trades against" hint="The coin people pay in, and the one its fees are taken in">
          {BASES.map((b) => (
            <Pill key={b.id} name="base" checked={base === b.id} onChange={() => setBase(b.id)}>
              {b.name}
            </Pill>
          ))}
        </Choice>
        <Choice legend="Trading fee" hint="All of it is burned: 80% as $SC, 20% as $ZC">
          {FEES.map((f) => (
            <Pill key={f} name="fee" checked={fee === f} onChange={() => setFee(f)}>
              {feeLabel(f)}
            </Pill>
          ))}
        </Choice>
        <label className="block space-y-2">
          <span className="block font-mono text-xs uppercase tracking-[0.14em]">Your first buy, in ETH · optional</span>
          <input inputMode="decimal" value={devBuy} onChange={(e) => setDevBuy(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" className={field} />
          <span className="block text-sm text-developer/70">
            Bought in the launch transaction at the trading fee. Anyone else in the first 20 seconds pays up to 99%.
          </span>
        </label>
      </fieldset>

      <div className="space-y-3 border-t border-developer/20 pt-7 text-sm">
        <p>
          Launching buys $5 of $SC and burns it
          {burnEth.data !== undefined && ` (about ${Number(formatEther(burnEth.data)).toFixed(5)} ETH)`}. The whole
          supply, one billion, goes into the pool at a ${OPENING_FDV_USD.toLocaleString("en-US")} valuation and stays
          there: nobody can take the liquidity out.
        </p>
        {!address ? (
          <ConnectButton label="Connect a wallet to launch" />
        ) : chainId !== CHAIN_ID ? (
          <button type="button" onClick={() => switchChain({ chainId: CHAIN_ID })} className={button}>
            Switch to Ethereum
          </button>
        ) : (
          <button type="button" onClick={launch} disabled={busy || uploading} className={button}>
            {busy ? note : "Burn $5 of SC and launch"}
          </button>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    </form>
  );
}

const BUY_PRESETS = ["0.1", "0.25", "0.5", "1"];
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
  const chip = "border border-developer/40 px-2.5 py-1.5 font-mono text-xs hover:bg-developer hover:text-paper";
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
            className="w-16 border border-developer/50 bg-transparent px-2 py-1.5 font-mono text-xs"
          />
        ))}
        <button
          type="button"
          onClick={() => {
            onSave(draft.map((x, i) => (Number(x) > 0 ? x : values[i])));
            setEditing(false);
          }}
          className={chip}
        >
          Save
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {values.map((v) => (
        <button key={v} type="button" onClick={() => onPick(v)} className={chip}>
          {unit === "%" ? (v === "100" ? "Max" : `${v}%`) : `${v} ${unit}`}
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
        className="px-2 py-1.5 font-mono text-xs text-developer/70 hover:text-developer"
      >
        ✎
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

  const tab = "border border-developer/40 px-3 py-1.5 font-mono text-xs aria-pressed:bg-developer aria-pressed:text-paper";
  return (
    <div className="space-y-5 bg-paper px-5 py-6 text-developer sm:px-7">
      <div className="flex gap-1">
        {(["buy", "sell"] as const).map((s) => (
          <button key={s} type="button" aria-pressed={side === s} onClick={() => setSide(s)} className={`${tab} px-5 py-2 text-sm`}>
            {s === "buy" ? "Buy" : "Sell"}
          </button>
        ))}
      </div>
      {ethRoute && (
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="text-developer/70">{side === "buy" ? "Pay with" : "Receive"}</span>
          <button type="button" aria-pressed={withEth} onClick={() => setWithEth(true)} className={tab}>
            ETH
          </button>
          <button type="button" aria-pressed={!withEth} onClick={() => setWithEth(false)} className={tab}>
            {b.name}
          </button>
        </div>
      )}
      <label className="block space-y-2">
        <span className="flex justify-between font-mono text-xs uppercase tracking-[0.14em]">
          <span>Amount, in {payName}</span>
          {balance !== undefined && (
            <button type="button" onClick={() => setAmount(formatEther(balance))} className="normal-case tracking-normal text-developer/70 underline-offset-2 hover:underline">
              balance {tokens(balance, 4)}
            </button>
          )}
        </span>
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.0" className={field} />
      </label>
      {side === "buy" && eth ? (
        <Presets key="eth" values={buyPresets} onPick={setAmount} onSave={saveBuyPresets} unit="ETH" />
      ) : (
        <Presets key={side} values={side === "sell" ? sellPct : buyPct} onPick={pickPct} onSave={side === "sell" ? saveSellPct : saveBuyPct} unit="%" />
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-xs">
        <span className="flex items-center gap-1">
          <span className="mr-1 text-developer/70">Slippage</span>
          {[1, 2, 5].map((s) => (
            <button key={s} type="button" aria-pressed={slippage === s} onClick={() => setSlippage(s)} className={tab}>
              {s}%
            </button>
          ))}
        </span>
        <span className="text-developer/70">Fee {fee.data !== undefined ? `${Number(fee.data) / 10_000}%` : "·"}, all burned</span>
      </div>
      <p className="font-mono text-sm">
        You get about {quote.data !== undefined ? tokens(quote.data, 4) : "…"} {getName}
      </p>
      {!address ? (
        <ConnectButton label="Connect a wallet to trade" />
      ) : chainId !== CHAIN_ID ? (
        <button type="button" onClick={() => switchChain({ chainId: CHAIN_ID })} className={button}>
          Switch to Ethereum
        </button>
      ) : (
        <button type="button" onClick={trade} disabled={busy || wei === 0n || quote.data === undefined} className={`${button} w-full`}>
          {busy ? note : side === "buy" ? `Buy ${symbol}` : `Sell ${symbol}`}
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
