"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
} from "viem";
import { useAccount, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from "wagmi";

import { priceFeedAbi, realmFactoryAbi, routerAbi } from "@/lib/abi";
import { ADDR, CHAIN_ID } from "@/lib/config";
import { tokens } from "@/lib/format";
import { BASES, FEES, feeLabel, OPENING_FDV_USD, realmKey } from "@/lib/realm";

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
      return { zc: Number(h.zcUsd) || null, sc: Number(h.scUsd) || null };
    },
    refetchInterval: 60_000,
  });
  const ethUsd = eth.data ? Number(eth.data[1]) / 1e8 : null;
  return { eth: ethUsd, zc: coins.data?.zc ?? null, sc: coins.data?.sc ?? null };
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
  const [base, setBase] = useState<(typeof BASES)[number]["id"]>("eth");
  const [fee, setFee] = useState<number>(10_000);
  const [devBuy, setDevBuy] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const baseUsd = base === "eth" ? usd.eth : base === "zc" ? usd.zc : usd.sc;

  async function launch() {
    if (!client || !address || burnEth.data === undefined) return;
    setError(null);
    if (name.trim().length < 2 || name.trim().length > 32) return setError("Give it a name of 2 to 32 characters.");
    if (!/^[A-Z0-9]{2,10}$/.test(symbol)) return setError("A symbol is 2 to 10 capital letters or digits.");
    if (uri && !/^(https|ipfs):\/\/\S{3,280}$/.test(uri)) return setError("The image link must start with https:// or ipfs://.");
    if (!baseUsd || !usd.eth || !usd.sc) return setError("Prices are still loading; try again in a moment.");
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
    // a little over today's price for the burn; what is not used comes back in the same transaction
    const value = (burnEth.data * 102n) / 100n + dev;
    setBusy(true);
    try {
      setNote("Confirm the launch in your wallet…");
      const { request } = await client.simulateContract({
        account: address,
        address: ADDR.realmFactory,
        abi: realmFactoryAbi,
        functionName: "launch",
        args: [{ name: name.trim(), symbol, uri, base: b.address, feePpm: fee, openingFdv, minScBurned, devBuyEth: dev, minTokensOut: 0n }],
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
        <label className="block space-y-2">
          <span className="block font-mono text-xs uppercase tracking-[0.14em]">Image link · optional</span>
          <input value={uri} maxLength={300} onChange={(e) => setUri(e.target.value.trim())} placeholder="https://… or ipfs://…" className={field} />
        </label>
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
          <button type="button" onClick={launch} disabled={busy} className={button}>
            {busy ? note : "Burn $5 of SC and launch"}
          </button>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    </form>
  );
}

/** Buy or sell a SilverRealm token through Stockereum's router: ETH for ETH and ZC pairs, $SC for SC pairs. */
export function TradeBox({ token, base, symbol }: { token: Address; base: Address; symbol: string }) {
  const { address, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const router = useRouter();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const key = realmKey(token, base);
  const isWeth = base.toLowerCase() === ADDR.weth.toLowerCase();
  const isSc = base.toLowerCase() === ADDR.sc.toLowerCase();
  // SC has no ETH route on the router: SC pairs are bought and sold in SC
  const payName = side === "sell" ? symbol : isSc ? "$SC" : "ETH";
  const getName = side === "buy" ? symbol : isSc ? "$SC" : "ETH";

  let wei = 0n;
  try {
    wei = amount ? parseEther(amount) : 0n;
  } catch {}

  const quote = useQuery({
    queryKey: ["realmQuote", token, side, wei.toString()],
    enabled: !!client && wei > 0n,
    queryFn: async () => {
      const r = ADDR.stockereumRouter;
      if (side === "buy") {
        if (isSc) return client!.readContract({ address: r, abi: routerAbi, functionName: "quoteBuy", args: [key, base, wei] });
        return (await client!.readContract({ address: r, abi: routerAbi, functionName: "quoteBuyWithEth", args: [key, base, wei] }))[1];
      }
      if (isSc) return client!.readContract({ address: r, abi: routerAbi, functionName: "quoteSell", args: [key, token, wei] });
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
    // 3% below the quote: a moved price refuses the trade rather than fill it worse
    const minOut = (quote.data * 97n) / 100n;
    const r = ADDR.stockereumRouter;
    try {
      let call;
      if (side === "buy") {
        if (isSc) {
          await approve(base);
          call = { functionName: "buy", args: [key, base, wei, minOut, "0x"] } as const;
        } else if (isWeth) call = { functionName: "buyWethPairWithEth", args: [key, minOut, "0x"], value: wei } as const;
        else call = { functionName: "buyWithEth", args: [key, base, 0n, minOut, "0x"], value: wei } as const;
      } else {
        await approve(token);
        if (isSc) call = { functionName: "sell", args: [key, token, base, wei, minOut, "0x"] } as const;
        else if (isWeth) call = { functionName: "sellWethPairForEth", args: [key, token, wei, minOut, "0x"] } as const;
        else call = { functionName: "sellForEth", args: [key, token, base, wei, 0n, minOut, "0x"] } as const;
      }
      setNote("Confirm the trade in your wallet…");
      const { request } = await client.simulateContract({ account: address, address: r, abi: routerAbi, ...call } as never);
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

  return (
    <div className="space-y-5 bg-paper px-5 py-6 text-developer sm:px-7">
      <Choice legend="Trade" hint="Through Stockereum's router, exact amount in">
        <Pill name="side" checked={side === "buy"} onChange={() => setSide("buy")}>
          Buy
        </Pill>
        <Pill name="side" checked={side === "sell"} onChange={() => setSide("sell")}>
          Sell
        </Pill>
      </Choice>
      <label className="block space-y-2">
        <span className="block font-mono text-xs uppercase tracking-[0.14em]">You pay, in {payName}</span>
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.0" className={field} />
      </label>
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
        <button type="button" onClick={trade} disabled={busy || wei === 0n || quote.data === undefined} className={button}>
          {busy ? note : side === "buy" ? `Buy ${symbol}` : `Sell ${symbol}`}
        </button>
      )}
      {error && <p role="alert" className="text-sm">{error}</p>}
    </div>
  );
}
