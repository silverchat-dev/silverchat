"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BaseError, toHex, UserRejectedRequestError, type Hex } from "viem";
import { useAccount, useSignTypedData, useSwitchChain } from "wagmi";

import { MIN_HOLD_USD } from "@/lib/algorithm";
import { AGES, domain, loadReceipt, REGIONS, resultLeaf, saveReceipt, tagsHash, types } from "@/lib/answer";
import { CHAIN_ID } from "@/lib/config";
import type { Content } from "@/lib/content";

import { BuyHold } from "./buy";

type You = { eligible: boolean };

export function AnswerPanel({ pollId, content, open }: { pollId: string; content: Content; open: boolean }) {
  // the connector's own chain, not the configured one
  const { address, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const { signTypedDataAsync } = useSignTypedData();
  const router = useRouter();

  const [choices, setChoices] = useState<(number | null)[]>(() => content.questions.map(() => null));
  const [region, setRegion] = useState("");
  const [age, setAge] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const zcUsd = useQuery({
    queryKey: ["zcUsd"],
    queryFn: async () => Number((await (await fetch("/api/health")).json()).zcUsd) || null,
    refetchInterval: 60_000,
  });
  const you = useQuery({
    queryKey: ["you", pollId, address],
    enabled: open && !!address,
    queryFn: async (): Promise<You> => (await (await fetch(`/api/polls/${pollId}?address=${address}`)).json()).you,
  });

  if (!open) return null;

  const receipt = address ? loadReceipt(pollId, address) : null;
  const answered = done || !!receipt;
  const ready = choices.every((c) => c !== null);

  async function submit() {
    if (!address || !ready) return;
    setError(null);
    setBusy(true);
    try {
      const salt = toHex(crypto.getRandomValues(new Uint8Array(32))) as Hex;
      const picked = choices as number[];
      const signature = await signTypedDataAsync({
        domain: domain(),
        types,
        primaryType: "Answer",
        message: { pollId: BigInt(pollId), choices: picked, tagsHash: tagsHash(region, age), salt },
      });
      const res = await fetch("/api/answer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pollId, voter: address, choices: picked, region, age, salt, signature }),
      });
      const body = await res.json().catch(() => ({}));
      // answered earlier from another browser: this one has no receipt, but the answer stands
      if (res.status === 409 && String(body.error).includes("already")) return setDone(true);
      if (!res.ok) throw new Error(body.error ?? "the answer was not saved");
      saveReceipt({ pollId, voter: address, choices: picked, salt, leaf: resultLeaf(BigInt(pollId), picked, salt) });
      setDone(true);
      router.refresh();
    } catch (e) {
      setError(
        e instanceof BaseError && e.walk((x) => x instanceof UserRejectedRequestError)
          ? "You cancelled it in your wallet."
          : `It did not go through: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="answer" className="bg-paper px-5 py-7 text-developer sm:px-9 sm:py-9">
      <h2 id="answer" className="font-mono text-xs uppercase tracking-[0.14em]">
        Your answer
      </h2>

      {!address ? (
        <div className="mt-5 space-y-4">
          <p className="text-lg">Connect a wallet that held ${MIN_HOLD_USD} of ZC or SC when this poll opened.</p>
          <ConnectButton label="Connect a wallet" />
        </div>
      ) : chainId !== CHAIN_ID ? (
        <button type="button" onClick={() => switchChain({ chainId: CHAIN_ID })} className="mt-5 bg-developer px-5 py-3 font-mono text-sm text-paper">
          Switch to Ethereum
        </button>
      ) : answered ? (
        <div className="mt-5 space-y-3">
          <p className="text-lg">You answered. The totals appear when the result is fixed.</p>
          {receipt && (
            <p className="break-all font-mono text-xs text-developer/70">
              Your receipt, kept in this browser: {receipt.leaf}. After the result is fixed, you can check that it is in the record.
            </p>
          )}
        </div>
      ) : you.isError ? (
        <p className="mt-5 text-lg">
          Cannot check this wallet right now.{" "}
          <button type="button" onClick={() => you.refetch()} className="underline underline-offset-4">
            Try again
          </button>
        </p>
      ) : you.data && !you.data.eligible ? (
        <div className="mt-5 space-y-4">
          <p className="text-lg">This wallet held less than ${MIN_HOLD_USD} of ZC or SC when the poll opened, so it cannot answer this one.</p>
          <p className="text-developer/80">
            Hold ${MIN_HOLD_USD} of ZC or SC and you can answer every poll asked after that. Get a little more than ${MIN_HOLD_USD}:
            prices move, and the check uses the price when each poll opens.
          </p>
          <BuyHold usd={MIN_HOLD_USD + 2} zcUsd={zcUsd.data ?? null} />
        </div>
      ) : (
        <form
          className="mt-6 space-y-8"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <fieldset disabled={busy || !you.data} className="space-y-8">
            {content.questions.map((q, i) => (
              <fieldset key={i} className="space-y-3">
                <legend className={content.questions.length === 1 ? "sr-only" : "mb-3 text-2xl leading-snug"}>{q.q}</legend>
                {q.options.map((o, k) => (
                  <label key={k} className="flex cursor-pointer items-center gap-3 border-b border-developer/15 py-2 text-lg">
                    <input
                      type="radio"
                      name={`q${i}`}
                      checked={choices[i] === k}
                      onChange={() => setChoices((c) => c.map((x, j) => (j === i ? k : x)))}
                      className="peer sr-only"
                    />
                    <span aria-hidden className="grid size-7 shrink-0 place-items-center border border-developer/50 font-mono text-xs peer-checked:bg-developer peer-checked:text-paper peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:outline-offset-2">
                      {"ABCDEF"[k]}
                    </span>
                    {o}
                  </label>
                ))}
              </fieldset>
            ))}

            <div className="grid gap-4 border-t border-developer/25 pt-6 sm:grid-cols-2">
              <p className="font-mono text-xs leading-relaxed text-developer/70 sm:col-span-2">
                Optional. These let the result be split by group. A breakdown appears only when every group in it has 20 answers or more.
              </p>
              <Select label="Region" value={region} onChange={setRegion} options={REGIONS} />
              <Select label="Age" value={age} onChange={setAge} options={AGES} />
            </div>
          </fieldset>

          <div className="space-y-3">
            <button type="submit" disabled={busy || !ready || !you.data} className="w-full bg-developer py-3 font-mono text-sm text-paper disabled:cursor-not-allowed disabled:opacity-40">
              {busy ? "Sign in your wallet…" : ready ? "Sign my answer" : "Pick an answer for every question"}
            </button>
            <p className="font-mono text-xs leading-relaxed text-developer/70">
              Signing is free and sends no transaction. Your choice goes into the public record without your address, so nobody
              reading it can tell which one is yours. The team that runs this server can. If you claim a reward, the chain shows
              that you answered, not what.
            </p>
            {error && (
              <p role="alert" className="font-mono text-xs text-developer">
                {error}
              </p>
            )}
          </div>
        </form>
      )}
    </section>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <label className="space-y-2">
      <span className="block font-mono text-xs uppercase tracking-[0.14em]">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full border border-developer/50 bg-transparent px-3 py-2 font-mono text-sm">
        <option value="">Rather not say</option>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}
