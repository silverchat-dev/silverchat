"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { BaseError, formatEther, parseEther, parseUnits, UserRejectedRequestError, type PublicClient } from "viem";
import { useAccount, useBalance, usePublicClient, useWriteContract } from "wagmi";

import { routerAbi } from "@/lib/abi";
import { ADDR, CHAIN_ID, ZERO } from "@/lib/config";
import { tokens } from "@/lib/format";

/** ZC's pool on Stockereum: every launch pool is fee 0 (the hook charges), tick spacing 200. */
export const POOL_KEY =
  BigInt(ADDR.zc) < BigInt(ADDR.weth)
    ? { currency0: ADDR.zc, currency1: ADDR.weth, fee: 0, tickSpacing: 200, hooks: ADDR.stockereumHook }
    : { currency0: ADDR.weth, currency1: ADDR.zc, fee: 0, tickSpacing: 200, hooks: ADDR.stockereumHook };

/** When a quote fails, the one way out: ZC's own page on Stockereum. */
export const STOCKEREUM_ZC = `https://stockereum.com/t/${ADDR.zc}`;
const BUY_SC = `https://stockereum.com/t/${ADDR.sc}`;

// bought on top of what's needed, so a small price move between quote and buy doesn't revert it; it stays in the wallet
export const withBuffer = (zc: bigint) => (zc * 103n) / 100n;
// ETH kept back for gas, up to three transactions on the slow path
const GAS_ROOM = parseEther("0.003");

/**
 * ETH that buys at least `want` ZC, from the router's own quote (the launch fee included). A probe gives the rate,
 * then up to three quotes correct for the price moving along the curve.
 */
export async function ethFor(client: PublicClient, want: bigint) {
  const quote = async (eth: bigint) =>
    (await client.readContract({ address: ADDR.stockereumRouter, abi: routerAbi, functionName: "quoteBuyWithEth", args: [POOL_KEY, ADDR.weth, eth] }))[1];
  const probe = 10n ** 16n;
  const rate = await quote(probe);
  if (rate === 0n) throw new Error("the pool has no ZC to sell");
  let eth = (want * probe) / rate + 1n;
  for (let i = 0; i < 3; i++) {
    const out = await quote(eth);
    if (out >= want) return eth;
    eth = (eth * want) / out + eth / 1000n + 1n;
  }
  throw new Error("could not price that amount");
}

/** The ETH for `want` ZC plus the buffer, refreshed every 15 seconds, and whether this wallet has it. */
export function useEthFor(want: bigint | null) {
  const client = usePublicClient();
  const { address } = useAccount();
  const eth = useBalance({ address, query: { enabled: !!address } });
  const q = useQuery({
    queryKey: ["eth-for", want?.toString()],
    enabled: !!client && !!want && want > 0n,
    queryFn: () => ethFor(client!, withBuffer(want!)),
    refetchInterval: 15_000,
    retry: 1,
  });
  return { eth: q.data, error: q.error, have: eth.data?.value, enough: q.data !== undefined && eth.data !== undefined && eth.data.value > q.data + GAS_ROOM };
}

/** The buy transaction for at least `minOut` ZC, simulated with the user's own account first. */
export async function buy(client: PublicClient, account: `0x${string}`, minOut: bigint, eth: bigint, write: ReturnType<typeof useWriteContract>["writeContractAsync"]) {
  const { request } = await client.simulateContract({
    account,
    address: ADDR.stockereumRouter,
    abi: routerAbi,
    functionName: "buyWethPairWithEth",
    args: [POOL_KEY, minOut, "0x"],
    value: eth,
  });
  const tx = await write({ ...request, chainId: CHAIN_ID });
  if ((await client.waitForTransactionReceipt({ hash: tx })).status !== "success") throw new Error("the buy reverted");
}

const ethText = (wei: bigint) => `${Number(formatEther(wei)).toPrecision(2)} ETH`;

/** A wallet short of the $20 hold buys about $22 of ZC right here, in one transaction. SC stays a link to Stockereum. */
export function BuyHold({ usd, zcUsd }: { usd: number; zcUsd: number | null | undefined }) {
  const client = usePublicClient();
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const [state, setState] = useState<"idle" | "buying" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const want = zcUsd ? parseUnits((usd / zcUsd).toFixed(0), 18) : null;
  const q = useEthFor(want);

  async function go() {
    if (!client || !address || !want || !q.eth) return;
    setError(null);
    setState("buying");
    try {
      await buy(client, address, want, q.eth, writeContractAsync);
      setState("done");
    } catch (e) {
      setState("idle");
      setError(e instanceof BaseError && e.walk((x) => x instanceof UserRejectedRequestError) ? "You cancelled it in your wallet." : `It did not go through: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    }
  }

  if (state === "done") return <p className="font-mono text-sm">Bought. The ZC is in your wallet, ready for the next polls.</p>;
  return (
    <div className="space-y-3 font-mono text-sm">
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={go} disabled={!q.eth || !q.enough || state !== "idle"} className="bg-developer px-5 py-3 text-paper disabled:cursor-not-allowed disabled:opacity-40">
          {state === "buying" ? "Confirm in your wallet…" : want && q.eth ? `Buy ${tokens(want, 0)} ZC for ${ethText(q.eth)}` : `Buy $${usd} of ZC`}
        </button>
        {ADDR.sc !== ZERO && (
          <a href={BUY_SC} target="_blank" rel="noreferrer" className="border border-developer/50 px-5 py-3">
            Buy $20 of SC
          </a>
        )}
      </div>
      <p className="text-xs leading-relaxed text-developer/70">
        {q.error || zcUsd === null ? (
          <>
            Can&apos;t get a price right now.{" "}
            <a href={STOCKEREUM_ZC} target="_blank" rel="noreferrer" className="underline underline-offset-4">
              Buy ZC on Stockereum
            </a>
          </>
        ) : q.eth && q.have !== undefined && !q.enough ? (
          `You need about ${ethText(q.eth)} plus gas; this wallet has ${ethText(q.have)}.`
        ) : (
          `About $${usd}, bought with ETH through Stockereum. The price includes its 1% fee and a 3% buffer; any extra ZC stays with you.`
        )}
      </p>
      {error && (
        <p role="alert" className="text-xs text-developer">
          {error}
        </p>
      )}
    </div>
  );
}
