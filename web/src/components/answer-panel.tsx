"use client";

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
import { Part, action, field, label, quiet } from "./journal";
import { Connect } from "./you";

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

  const usd = useQuery({
    queryKey: ["usd-prices"],
    queryFn: async () => {
      const h = await (await fetch("/api/health")).json();
      return { zc: Number(h.zcUsd) || null, sc: Number(h.scUsd) || null };
    },
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
    <Part id="answer" title="Your answer" more={<span className="text-silver">Free · no gas · anonymous</span>}>
      {!address ? (
        <div className="space-y-7">
          <Options content={content} />
          <div className="space-y-4">
            <p className="max-w-[30em] text-lg leading-snug">Connect a wallet that held ${MIN_HOLD_USD} of ZC or SC when this poll opened.</p>
            <Connect />
          </div>
        </div>
      ) : chainId !== CHAIN_ID ? (
        <div className="space-y-7">
          <Options content={content} />
          <button type="button" onClick={() => switchChain({ chainId: CHAIN_ID })} className={action}>
            Switch to Ethereum
          </button>
        </div>
      ) : answered ? (
        <div className="flex items-start gap-4">
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full border border-paper text-lg">
            ✓
          </span>
          <div className="min-w-0 space-y-3">
            <p className="text-xl leading-snug">You answered. The totals appear when the result is fixed.</p>
            {receipt && (
              <p className="font-mono text-[11px] leading-relaxed text-silver">
                Your receipt, kept in this browser: <span className="break-all text-paper">{receipt.leaf}</span>. After the result is
                fixed, you can check that it is in the record.
              </p>
            )}
          </div>
        </div>
      ) : you.isError ? (
        <p role="alert" className="text-lg">
          Cannot check this wallet right now.{" "}
          <button type="button" onClick={() => you.refetch()} className={quiet}>
            Try again
          </button>
        </p>
      ) : you.data && !you.data.eligible ? (
        <div className="space-y-4">
          <p className="max-w-[30em] text-lg leading-snug">
            This wallet held less than ${MIN_HOLD_USD} of ZC or SC when the poll opened, so it cannot answer this one.
          </p>
          <p className="max-w-[34em] leading-relaxed text-paper/80">
            Hold ${MIN_HOLD_USD} of ZC or SC and you can answer every poll asked after that. Get a little more than ${MIN_HOLD_USD}:
            prices move, and the check uses the price when each poll opens.
          </p>
          <BuyHold usd={MIN_HOLD_USD + 2} zcUsd={usd.isError ? null : usd.data?.zc} scUsd={usd.isError ? null : usd.data?.sc} />
        </div>
      ) : (
        <form
          className="space-y-8"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <fieldset disabled={busy || !you.data} className="space-y-9 disabled:opacity-70">
            {content.questions.map((q, i) => (
              <fieldset key={i} className="space-y-2">
                <legend className={content.questions.length === 1 ? "sr-only" : "mb-3 text-[1.35rem] leading-snug text-balance"}>
                  {content.questions.length > 1 && <span className="mr-2 font-mono text-xs text-silver">{i + 1}.</span>}
                  {q.q}
                </legend>
                <ul className="ruled">
                  {q.options.map((o, k) => (
                    <li key={k}>
                      <OptionRow name={`q${i}`} k={k} checked={choices[i] === k} onChange={() => setChoices((c) => c.map((x, j) => (j === i ? k : x)))}>
                        {o}
                      </OptionRow>
                    </li>
                  ))}
                </ul>
              </fieldset>
            ))}

            <div className="space-y-4">
              <p className={label}>Optional · about you</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <Select label="Region" value={region} onChange={setRegion} options={REGIONS} />
                <Select label="Age" value={age} onChange={setAge} options={AGES} />
              </div>
              <p className="font-mono text-[11px] leading-relaxed text-silver">
                These let the result be split by group. A breakdown appears only when every group in it has 20 answers or more.
              </p>
            </div>
          </fieldset>

          <div className="space-y-4">
            <button type="submit" disabled={busy || !ready || !you.data} className={`${action} w-full py-3.5 sm:w-auto sm:min-w-[16rem]`}>
              {busy ? "Sign in your wallet…" : ready ? "Sign my answer" : "Pick an answer for every question"}
            </button>
            {error && (
              <p role="alert" className="font-mono text-xs text-paper">
                × {error}
              </p>
            )}
            <p className="max-w-[40em] font-mono text-[11px] leading-relaxed text-silver">
              Signing is free and sends no transaction. Your choice goes into the public record without your address, so nobody
              reading it can tell which one is yours. The team that runs this server can. If you claim a reward, the chain shows
              that you answered, not what.
            </p>
          </div>
        </form>
      )}
    </Part>
  );
}

/** The options as a list to read, for a visitor who cannot answer yet. */
function Options({ content }: { content: Content }) {
  return (
    <div className="space-y-6">
      {content.questions.map((q, i) => (
        <div key={i} className="space-y-2">
          {content.questions.length > 1 && (
            <p className="text-[1.2rem] leading-snug">
              <span className="mr-2 font-mono text-xs text-silver">{i + 1}.</span>
              {q.q}
            </p>
          )}
          <ul className="ruled">
            {q.options.map((o, k) => (
              <li key={k} className="flex min-h-12 items-center gap-4 py-2 text-[1.1rem] leading-snug text-paper/80">
                <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full border border-dashed border-paper/40 font-mono text-[10px] text-silver">
                  {"ABCDEF"[k]}
                </span>
                {o}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** One option to pick: a whole row to tap, its letter filled with ink when chosen. The demo uses it too. */
export function OptionRow({ name, k, checked, onChange, children }: { name: string; k: number; checked: boolean; onChange: () => void; children: React.ReactNode }) {
  return (
    <label className="group -mx-2 flex min-h-14 cursor-pointer items-center gap-4 rounded-md px-2 py-2 text-[1.15rem] leading-snug transition-colors hover:bg-paper/[0.04] has-[:checked]:bg-paper/[0.06]">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="peer sr-only" />
      <span
        aria-hidden
        className="grid size-8 shrink-0 place-items-center rounded-full border border-paper/45 font-mono text-[11px] transition-colors group-hover:border-paper peer-checked:border-paper peer-checked:bg-paper peer-checked:text-developer peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2"
      >
        {"ABCDEF"[k]}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
      <span aria-hidden className="font-mono text-xs text-paper opacity-0 transition-opacity peer-checked:opacity-100">
        chosen
      </span>
    </label>
  );
}

function Select({ label: name, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <label className="block space-y-1">
      <span className="block font-mono text-[11px] uppercase tracking-[0.16em] text-silver">{name}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`${field} cursor-pointer text-base`}>
        <option value="">Rather not say</option>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}
