"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { BaseError, formatEther, parseEther, parseUnits, UserRejectedRequestError, type Address, type PublicClient } from "viem";
import { useAccount, useBalance, usePublicClient, useWriteContract } from "wagmi";

import { routerAbi } from "@/lib/abi";
import { ADDR, CHAIN_ID, ZERO } from "@/lib/config";
import { tokens } from "@/lib/format";

// every launch pool on Stockereum is fee 0 (the hook charges), tick spacing 200, the hook
const keyFor = (token: Address, quote: Address) =>
  BigInt(token) < BigInt(quote)
    ? { currency0: token, currency1: quote, fee: 0, tickSpacing: 200, hooks: ADDR.stockereumHook }
    : { currency0: quote, currency1: token, fee: 0, tickSpacing: 200, hooks: ADDR.stockereumHook };

/** ZC trades against WETH; SC trades against ZC, so the router buys ZC with the ETH first, in the same transaction. */
export type Coin = "zc" | "sc";
export const POOL_KEY = keyFor(ADDR.zc, ADDR.weth);
const SC_KEY = keyFor(ADDR.sc, ADDR.zc);
const pair = (coin: Coin) => (coin === "zc" ? { key: POOL_KEY, quote: ADDR.weth } : { key: SC_KEY, quote: ADDR.zc });

/** When a quote fails, the one way out: the coin's own page on Stockereum. */
export const STOCKEREUM_ZC = `https://stockereum.com/t/${ADDR.zc}`;
const stockereum = (coin: Coin) => `https://stockereum.com/t/${coin === "zc" ? ADDR.zc : ADDR.sc}`;

// bought on top of what's needed, so a small price move between quote and buy doesn't revert it; it stays in the wallet
export const withBuffer = (amount: bigint) => (amount * 103n) / 100n;
// ETH kept back for gas, up to three transactions on the slow path
const GAS_ROOM = parseEther("0.003");

/**
 * ETH that buys at least `want` of the coin, from the router's own quote (the launch fees included). A probe gives the
 * rate, then up to four quotes settle within 0.5% above `want`.
 */
export async function ethFor(client: PublicClient, want: bigint, coin: Coin = "zc") {
  const { key, quote: via } = pair(coin);
  const quote = async (eth: bigint) =>
    (await client.readContract({ address: ADDR.stockereumRouter, abi: routerAbi, functionName: "quoteBuyWithEth", args: [key, via, eth] }))[1];
  const probe = 10n ** 16n;
  const rate = await quote(probe);
  if (rate === 0n) throw new Error(`the pool has no ${coin.toUpperCase()} to sell`);
  let eth = (want * probe) / rate + 1n;
  // correct both ways (a thin pool prices a small buy better than the probe), keeping the cheapest ETH that still delivers
  let best: bigint | null = null;
  for (let i = 0; i < 4; i++) {
    const out = await quote(eth);
    if (out >= want) {
      if (best === null || eth < best) best = eth;
      if (out - want <= want / 200n) break;
      eth = (eth * want) / out + 1n;
    } else eth = (eth * want) / out + eth / 1000n + 1n;
  }
  if (best === null) throw new Error("could not price that amount");
  return best;
}

/** The ETH for `want` of the coin plus the buffer, refreshed every 15 seconds, and whether this wallet has it. */
export function useEthFor(want: bigint | null, coin: Coin = "zc") {
  const client = usePublicClient();
  const { address } = useAccount();
  const eth = useBalance({ address, query: { enabled: !!address } });
  const q = useQuery({
    queryKey: ["eth-for", coin, want?.toString()],
    enabled: !!client && !!want && want > 0n,
    queryFn: () => ethFor(client!, withBuffer(want!), coin),
    refetchInterval: 15_000,
    retry: 1,
  });
  return { eth: q.data, error: q.error, have: eth.data?.value, enough: q.data !== undefined && eth.data !== undefined && eth.data.value > q.data + GAS_ROOM };
}

/** The buy transaction for at least `minOut` of the coin, simulated with the user's own account first. */
export async function buy(
  client: PublicClient,
  account: Address,
  minOut: bigint,
  eth: bigint,
  write: ReturnType<typeof useWriteContract>["writeContractAsync"],
  coin: Coin = "zc",
) {
  // for SC, minOut on the SC that arrives is the protection; the ZC leg in between needs no floor of its own
  const tx =
    coin === "zc"
      ? await write({
          ...(await client.simulateContract({ account, address: ADDR.stockereumRouter, abi: routerAbi, functionName: "buyWethPairWithEth", args: [POOL_KEY, minOut, "0x"], value: eth })).request,
          chainId: CHAIN_ID,
        })
      : await write({
          ...(await client.simulateContract({ account, address: ADDR.stockereumRouter, abi: routerAbi, functionName: "buyWithEth", args: [SC_KEY, ADDR.zc, 0n, minOut, "0x"], value: eth })).request,
          chainId: CHAIN_ID,
        });
  if ((await client.waitForTransactionReceipt({ hash: tx })).status !== "success") throw new Error("the buy reverted");
}

const ethText = (wei: bigint) => `${Number(formatEther(wei)).toPrecision(2)} ETH`;

/** One coin's buy: about `usd` of it with ETH, in one transaction, with its own quote and status. */
function BuyCoin({ coin, usd, price, primary }: { coin: Coin; usd: number; price: number | null | undefined; primary: boolean }) {
  const client = usePublicClient();
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const [state, setState] = useState<"idle" | "buying" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const name = coin.toUpperCase();
  const want = price ? parseUnits((usd / price).toFixed(0), 18) : null;
  const q = useEthFor(want, coin);

  async function go() {
    if (!client || !address || !want || !q.eth) return;
    setError(null);
    setState("buying");
    try {
      await buy(client, address, want, q.eth, writeContractAsync, coin);
      setState("done");
    } catch (e) {
      setState("idle");
      setError(e instanceof BaseError && e.walk((x) => x instanceof UserRejectedRequestError) ? "You cancelled it in your wallet." : `It did not go through: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    }
  }

  return (
    <div className="space-y-2">
      {state === "done" ? (
        <p className="py-3">Bought. The {name} is in your wallet, ready for the next polls.</p>
      ) : (
        <button
          type="button"
          onClick={go}
          disabled={!q.eth || !q.enough || state !== "idle"}
          className={`${primary ? "bg-developer text-paper" : "border border-developer/50"} px-5 py-3 disabled:cursor-not-allowed disabled:opacity-40`}
        >
          {state === "buying" ? "Confirm in your wallet…" : want && q.eth ? `Buy ${tokens(want, 0)} ${name} for ${ethText(q.eth)}` : `Buy $${usd} of ${name}`}
        </button>
      )}
      {(q.error || price === null) && state !== "done" ? (
        <p className="text-xs text-developer/70">
          Can&apos;t get a price right now.{" "}
          <a href={stockereum(coin)} target="_blank" rel="noreferrer" className="underline underline-offset-4">
            Buy {name} on Stockereum
          </a>
        </p>
      ) : q.eth && q.have !== undefined && !q.enough && state !== "done" ? (
        <p className="text-xs text-developer/70">You need about {ethText(q.eth)} plus gas; this wallet has {ethText(q.have)}.</p>
      ) : null}
      {error && (
        <p role="alert" className="text-xs text-developer">
          {error}
        </p>
      )}
    </div>
  );
}

/** A wallet short of the $20 hold buys about $22 of ZC or SC right here, in one transaction each. */
export function BuyHold({ usd, zcUsd, scUsd }: { usd: number; zcUsd: number | null | undefined; scUsd: number | null | undefined }) {
  return (
    <div className="space-y-3 font-mono text-sm">
      <div className="flex flex-wrap items-start gap-3">
        <BuyCoin coin="zc" usd={usd} price={zcUsd} primary />
        {ADDR.sc !== ZERO && <BuyCoin coin="sc" usd={usd} price={scUsd} primary={false} />}
      </div>
      <p className="text-xs leading-relaxed text-developer/70">
        About ${usd} each, bought with ETH through Stockereum. The price includes its fees (SC goes through ZC, so two) and a
        3% buffer; any extra stays with you.
      </p>
    </div>
  );
}
