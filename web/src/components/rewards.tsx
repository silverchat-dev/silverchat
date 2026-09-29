"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { BaseError, UserRejectedRequestError, type Hex } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";

import { askAbi } from "@/lib/abi";
import { ADDR, CHAIN_ID } from "@/lib/config";
import { tokens } from "@/lib/format";

type Claim = { id: string; amount: string; proof: Hex[] };

/** Every reward the connected wallet can claim, in one transaction. Shown only when there is something to claim. */
export function Rewards() {
  const { address, chainId } = useAccount();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const claims = useQuery({
    queryKey: ["claims", address],
    enabled: !!address,
    refetchInterval: 60_000,
    queryFn: async (): Promise<Claim[]> => (await (await fetch(`/api/claims/${address}`)).json()).claims ?? [],
  });

  const list = claims.data ?? [];
  if (!address || chainId !== CHAIN_ID || !list.length) return null;
  const total = list.reduce((s, c) => s + BigInt(c.amount), 0n);

  async function claim(retry = true): Promise<void> {
    if (!client || !address) return;
    setBusy(true);
    setNote(null);
    try {
      const fresh = (await claims.refetch()).data ?? [];
      if (!fresh.length) return;
      const { request } = await client.simulateContract({
        account: address,
        address: ADDR.ask,
        abi: askAbi,
        functionName: "claimMany",
        args: [address, fresh.map((c) => BigInt(c.id)), fresh.map((c) => BigInt(c.amount)), fresh.map((c) => c.proof)],
      });
      const tx = await writeContractAsync({ ...request, chainId: CHAIN_ID });
      await client.waitForTransactionReceipt({ hash: tx });
      setNote("Claimed.");
      claims.refetch();
    } catch (e) {
      if (e instanceof BaseError && e.walk((x) => x instanceof UserRejectedRequestError)) {
        setNote("You cancelled it in your wallet.");
      } else if (retry) {
        // someone may have claimed one of these for you in the meantime; the list is rebuilt from the chain
        return claim(false);
      } else {
        setNote("The claim did not go through. Try again in a minute.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => claim()}
        disabled={busy}
        className="border border-paper/60 px-3 py-2 font-mono text-xs text-paper hover:border-paper disabled:opacity-50"
        title={`${list.length} ${list.length === 1 ? "poll" : "polls"}`}
      >
        {busy ? "Claiming…" : `Claim ${tokens(total)} ZC`}
      </button>
      {note && (
        <span role="status" className="hidden font-mono text-xs text-silver md:inline">
          {note}
        </span>
      )}
    </span>
  );
}
