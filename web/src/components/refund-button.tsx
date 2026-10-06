"use client";

import { useState } from "react";
import { BaseError, UserRejectedRequestError } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";

import { askAbi } from "@/lib/abi";
import { ADDR, CHAIN_ID } from "@/lib/config";
import { tokens } from "@/lib/format";

import { action } from "./journal";

/** Shown to the asker when a poll was never fixed within 7 days of closing: the whole payment comes back. */
export function RefundButton({ pollId, asker, cost }: { pollId: string; asker: string; cost: string }) {
  const { address, chainId } = useAccount();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  if (!address || address.toLowerCase() !== asker || chainId !== CHAIN_ID) return null;

  async function refund() {
    if (!client || !address) return;
    setState("busy");
    setError(null);
    try {
      const { request } = await client.simulateContract({ account: address, address: ADDR.ask, abi: askAbi, functionName: "refund", args: [BigInt(pollId)] });
      const tx = await writeContractAsync({ ...request, chainId: CHAIN_ID });
      await client.waitForTransactionReceipt({ hash: tx });
      setState("done");
    } catch (e) {
      setState("idle");
      setError(
        e instanceof BaseError && e.walk((x) => x instanceof UserRejectedRequestError)
          ? "You cancelled it in your wallet."
          : "The refund did not go through. The result may have been fixed a moment ago; reload the page.",
      );
    }
  }

  return (
    <div className="space-y-4">
      <p className="max-w-[30em] text-lg leading-snug">This poll was not fixed within 7 days of closing. You can take your {tokens(cost)} ZC back.</p>
      <button type="button" onClick={refund} disabled={state !== "idle"} className={action}>
        {state === "done" ? "Refunded" : state === "busy" ? "Confirm in your wallet…" : "Take my ZC back"}
      </button>
      {error && (
        <p role="alert" className="font-mono text-xs text-paper">
          × {error}
        </p>
      )}
    </div>
  );
}
