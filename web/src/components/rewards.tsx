"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { BaseError, UserRejectedRequestError, type Hex } from "viem";
import { useAccount, usePublicClient, useSignMessage, useWriteContract } from "wagmi";

import { askAbi } from "@/lib/abi";
import { hasReceipts } from "@/lib/answer";
import { ADDR, CHAIN_ID } from "@/lib/config";
import { tokens } from "@/lib/format";
import { rewardsMessage, today } from "@/lib/rewards";

type Claim = { id: string; amount: string; proof: Hex[] };

const sigKey = (address: string, day: string) => `silverchat:rewards:${address.toLowerCase()}:${day}`;

/**
 * Rewards for the connected wallet, claimed in one transaction. The list is private to the wallet, so it is fetched
 * with a signature, asked for once a day and only on a device where this wallet has answered.
 */
export function Rewards() {
  const { address, chainId } = useAccount();
  const client = usePublicClient();
  const { signMessageAsync } = useSignMessage();
  const { writeContractAsync } = useWriteContract();
  const [day] = useState(today);
  const [signed, setSigned] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const answered = useMemo(() => !!address && hasReceipts(address), [address]);
  const stored = useMemo(() => {
    try {
      return address ? sessionStorage.getItem(sigKey(address, day)) : null;
    } catch {
      return null;
    }
  }, [address, day]);
  const sig = signed ?? stored;

  const claims = useQuery({
    queryKey: ["claims", address, sig],
    enabled: !!address && !!sig,
    refetchInterval: 120_000,
    queryFn: async (): Promise<Claim[]> =>
      (await (await fetch(`/api/claims/${address}?day=${day}`, { headers: { "x-rewards-signature": sig! } })).json()).claims ?? [],
  });

  if (!address || chainId !== CHAIN_ID || !answered) return null;

  async function check() {
    if (!address) return;
    setNote(null);
    try {
      const s = await signMessageAsync({ message: rewardsMessage(address, day) });
      try {
        sessionStorage.setItem(sigKey(address, day), s);
      } catch {}
      setSigned(s);
    } catch {
      setNote("You cancelled it in your wallet.");
    }
  }

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
      if ((await client.waitForTransactionReceipt({ hash: tx })).status !== "success") throw new Error("reverted");
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

  const list = claims.data ?? [];
  const total = list.reduce((s, c) => s + BigInt(c.amount), 0n);
  const button = "border border-paper/60 px-3 py-2 font-mono text-xs text-paper hover:border-paper disabled:opacity-50";

  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {!sig ? (
        <button type="button" onClick={check} className={button}>
          Check rewards
        </button>
      ) : list.length ? (
        <button type="button" onClick={() => claim()} disabled={busy} className={button} title={`${list.length} ${list.length === 1 ? "poll" : "polls"}`}>
          {busy ? "Claiming…" : `Claim ${tokens(total)} ZC`}
        </button>
      ) : null}
      {note && (
        <span role="status" className="font-mono text-xs text-silver">
          {note}
        </span>
      )}
    </span>
  );
}
