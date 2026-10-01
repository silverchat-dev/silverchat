"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BaseError, ContractFunctionRevertedError, isHex, toHex, UserRejectedRequestError, zeroHash, type Hex } from "viem";
import { useAccount, useBlockNumber, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from "wagmi";

import { riddleAbi } from "@/lib/abi";
import { ADDR, CHAIN_ID } from "@/lib/config";
import { answerHash, commitmentOf, loadGuess, normalize, REVEAL_DELAY, saveGuess } from "@/lib/riddle";

const button = "bg-developer px-5 py-3 font-mono text-sm text-paper disabled:opacity-50";

function explain(e: unknown) {
  if (e instanceof BaseError) {
    if (e.walk((x) => x instanceof UserRejectedRequestError)) return "You cancelled it in your wallet.";
    const revert = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    if (revert?.data?.errorName === "Over") return "Someone solved it first, or the riddle is closed.";
    if (revert?.data?.errorName === "TooSoon") return "Wait until ten blocks have passed since your seal.";
    if (revert?.data?.errorName) return `The contract refused it: ${revert.data.errorName.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()}.`;
    return `It did not go through: ${e.shortMessage}`;
  }
  return `It did not go through: ${e instanceof Error ? e.message : String(e)}`;
}

/** Try a guess for free in the browser, then seal it on-chain, wait ten blocks, and reveal it. */
export function SolvePanel({ answerHashOnChain }: { answerHashOnChain: Hex }) {
  const { address, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const router = useRouter();
  const block = useBlockNumber({ watch: true });

  const [guess, setGuess] = useState("");
  const [pasted, setPasted] = useState({ answer: "", salt: "" });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const state = useReadContract({ address: ADDR.riddle, abi: riddleAbi, functionName: "solved", query: { refetchInterval: 15_000 } });
  const closed = useReadContract({ address: ADDR.riddle, abi: riddleAbi, functionName: "closed", query: { refetchInterval: 15_000 } });
  const mine = useReadContract({ address: ADDR.riddle, abi: riddleAbi, functionName: "commits", args: address ? [address] : undefined, query: { enabled: !!address } });

  const right = guess.trim() !== "" && answerHash(guess) === answerHashOnChain;
  const [sealed, sealedAt] = mine.data ?? [zeroHash, 0n];
  const hasSeal = sealed !== zeroHash;
  const kept = address && hasSeal ? loadGuess(address, sealed) : null;
  const left = hasSeal && block.data !== undefined ? sealedAt + REVEAL_DELAY - block.data : null;
  const over = state.data === true || closed.data === true;

  async function run(label: string, fn: () => Promise<Hex>) {
    if (!client) return;
    setBusy(true);
    setError(null);
    setNote(label);
    try {
      const hash = await fn();
      if ((await client.waitForTransactionReceipt({ hash })).status !== "success") throw new Error("the transaction reverted");
    } catch (e) {
      setError(explain(e));
    } finally {
      setNote(null);
      setBusy(false);
      await Promise.all([mine.refetch(), state.refetch()]);
      router.refresh();
    }
  }

  const sendCommit = async (commitment: Hex) => {
    const { request } = await client!.simulateContract({ account: address!, address: ADDR.riddle, abi: riddleAbi, functionName: "commit", args: [commitment] });
    return writeContractAsync({ ...request, chainId: CHAIN_ID });
  };
  const sendReveal = async (answer: string, salt: Hex) => {
    const { request } = await client!.simulateContract({ account: address!, address: ADDR.riddle, abi: riddleAbi, functionName: "reveal", args: [normalize(answer), salt] });
    return writeContractAsync({ ...request, chainId: CHAIN_ID });
  };

  function seal() {
    if (!address || !right) return;
    const salt = toHex(crypto.getRandomValues(new Uint8Array(32))) as Hex;
    const commitment = commitmentOf(address, guess, salt);
    // kept before anything is sent; without it this browser cannot reveal, and the salt below is the only copy
    if (!saveGuess(address, commitment, { answer: normalize(guess), salt })) {
      return setError("This browser cannot keep your guess. Use a browser that allows site storage.");
    }
    run("Sealing…", () => sendCommit(commitment));
  }

  // a reveal that fails is sent again unchanged; a new seal would restart the ten blocks and void a reveal already seen
  function reveal(answer: string, salt: Hex) {
    run("Revealing…", () => sendReveal(answer, salt));
  }

  const pastedOpens = !!address && isHex(pasted.salt) && pasted.salt.length === 66 && commitmentOf(address, pasted.answer, pasted.salt as Hex) === sealed;

  if (over) return null;

  return (
    <section aria-labelledby="solve" className="space-y-6 bg-paper px-5 py-7 text-developer sm:px-9 sm:py-9">
      <h2 id="solve" className="font-mono text-xs uppercase tracking-[0.14em]">
        Your answer
      </h2>

      <label className="block space-y-2">
        <span className="block text-sm text-developer/70">Try a guess here first. It is checked in your browser against the hash on Ethereum, and costs nothing.</span>
        <input
          value={guess}
          onChange={(e) => setGuess(e.target.value)}
          placeholder="your answer"
          autoComplete="off"
          spellCheck={false}
          className="w-full border-b border-developer/40 bg-transparent pb-2 text-2xl outline-none placeholder:text-developer/35 focus:border-developer"
        />
        {guess.trim() && (
          <span className="block font-mono text-xs">
            {right ? "That is the answer. Seal it before anyone else does." : "Not it."} <span className="text-developer/60">({normalize(guess) || "empty"})</span>
          </span>
        )}
      </label>

      {!address ? (
        <ConnectButton label="Connect a wallet to claim it" />
      ) : chainId !== CHAIN_ID ? (
        <button type="button" onClick={() => switchChain({ chainId: CHAIN_ID })} className={button}>
          Switch to Ethereum
        </button>
      ) : hasSeal && kept ? (
        <div className="space-y-3">
          <p>
            Your guess is sealed on-chain.{" "}
            {left === null ? null : left > 0n ? `Reveal it in ${left} ${left === 1n ? "block" : "blocks"}.` : "You can reveal it now."}
          </p>
          <p className="break-all font-mono text-xs text-developer/70">Salt, kept in this browser: {kept.salt}. Copy it somewhere safe.</p>
          <p className="text-sm text-developer/70">
            Before you reveal, add a private RPC to your wallet (for example rpc.flashbots.net), so the answer is not seen
            in the public mempool before it lands.
          </p>
          <button type="button" disabled={busy || left === null || left > 0n} className={button} onClick={() => reveal(kept.answer, kept.salt)}>
            {busy ? note : "Reveal and claim"}
          </button>
        </div>
      ) : hasSeal ? (
        <div className="space-y-4 text-sm">
          <p>This wallet has a sealed guess, but this browser does not hold it. Paste the answer and salt you sealed to reveal it.</p>
          <input value={pasted.answer} onChange={(e) => setPasted({ ...pasted, answer: e.target.value })} placeholder="the answer you sealed" className="w-full border-b border-developer/40 bg-transparent py-1 outline-none" />
          <input value={pasted.salt} onChange={(e) => setPasted({ ...pasted, salt: e.target.value.trim() })} placeholder="its salt, 0x…" className="w-full border-b border-developer/40 bg-transparent py-1 font-mono text-xs outline-none" />
          {pasted.answer && pasted.salt && !pastedOpens && <p>That is not the answer and salt you sealed.</p>}
          <button type="button" disabled={busy || !pastedOpens || left === null || left > 0n} className={button} onClick={() => reveal(pasted.answer, pasted.salt as Hex)}>
            {busy ? note : "Reveal it"}
          </button>
          <details>
            <summary className="cursor-pointer">I lost the salt</summary>
            <p className="mt-2">
              Sealing again replaces your seal and restarts the ten blocks. If you already sent a reveal, that reveal fails.
            </p>
            <button type="button" disabled={busy || !right || mine.isPending} className={`${button} mt-3`} onClick={seal}>
              Seal my answer again
            </button>
          </details>
        </div>
      ) : (
        <button type="button" disabled={busy || !right || mine.isPending} className={button} onClick={seal}>
          {busy ? note : "Seal my answer"}
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
    </section>
  );
}
