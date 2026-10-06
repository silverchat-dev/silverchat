"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BaseError, ContractFunctionRevertedError, isHex, toHex, UserRejectedRequestError, zeroHash, type Hex } from "viem";
import { useAccount, useBlockNumber, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from "wagmi";

import { Part, action, field, label, quiet, second } from "@/components/journal";
import { riddleAbi } from "@/lib/abi";
import { ADDR, CHAIN_ID } from "@/lib/config";
import { answerHash, commitmentOf, loadGuess, normalize, REVEAL_DELAY, saveGuess } from "@/lib/riddle";

// buttons a thumb can hit on a phone
const tall = "min-h-11";

/** The wallet's connect button drawn as the view's one green action; it opens the same wallet window. */
function Connect({ children }: { children: string }) {
  return (
    <ConnectButton.Custom>
      {({ openConnectModal, mounted }) => (
        <button type="button" onClick={openConnectModal} disabled={!mounted} className={`${action} ${tall}`}>
          {children}
        </button>
      )}
    </ConnectButton.Custom>
  );
}

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
  const countdown = left === null ? null : left > 0n ? `Reveal it in ${left} ${left === 1n ? "block" : "blocks"}.` : "You can reveal it now.";

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
    <Part title="Your answer" id="solve">
      <label className="block space-y-3">
        <span className="block max-w-[32em] leading-relaxed text-paper/75">Try a guess here first. It is checked in your browser against the hash on Ethereum, and costs nothing.</span>
        <input
          value={guess}
          onChange={(e) => setGuess(e.target.value)}
          placeholder="your answer"
          autoComplete="off"
          spellCheck={false}
          className={`${field} text-[1.6rem] sm:text-[1.9rem]`}
        />
        {guess.trim() && (
          <span aria-live="polite" className="flex flex-wrap items-baseline gap-x-2 font-mono text-xs">
            <span aria-hidden className={`size-2 shrink-0 self-center rounded-full ${right ? "bg-tap" : "border border-paper/50"}`} />
            <span>{right ? "That is the answer. Seal it before anyone else does." : "Not it."}</span>
            <span className="text-silver">({normalize(guess) || "empty"})</span>
          </span>
        )}
      </label>

      {!address ? (
        <Connect>Connect a wallet to claim it</Connect>
      ) : chainId !== CHAIN_ID ? (
        <button type="button" onClick={() => switchChain({ chainId: CHAIN_ID })} className={`${second} ${tall}`}>
          Switch to Ethereum
        </button>
      ) : hasSeal && kept ? (
        <div className="space-y-4">
          <p className="text-[1.15rem] leading-snug">
            Your guess is sealed on-chain. {countdown}
          </p>
          <p className="space-y-1">
            <span className={`block ${label}`}>Salt, kept in this browser. Copy it somewhere safe.</span>
            <span className="block break-all font-mono text-xs text-paper/85">{kept.salt}</span>
          </p>
          <p className="max-w-[34em] text-sm leading-relaxed text-paper/75">
            Before you reveal, add a private RPC to your wallet (for example rpc.flashbots.net), so the answer is not seen
            in the public mempool before it lands.
          </p>
          <button type="button" disabled={busy || left === null || left > 0n} className={`${action} ${tall}`} onClick={() => reveal(kept.answer, kept.salt)}>
            {busy ? note : "Reveal and claim"}
          </button>
        </div>
      ) : hasSeal ? (
        <div className="space-y-5">
          <p className="max-w-[34em] leading-relaxed">
            This wallet has a sealed guess, but this browser does not hold it. Paste the answer and salt you sealed to reveal
            it. {countdown}
          </p>
          <label className="block space-y-1">
            <span className={`block ${label}`}>The answer you sealed</span>
            <input value={pasted.answer} onChange={(e) => setPasted({ ...pasted, answer: e.target.value })} placeholder="the answer you sealed" className={field} />
          </label>
          <label className="block space-y-1">
            <span className={`block ${label}`}>Its salt</span>
            <input value={pasted.salt} onChange={(e) => setPasted({ ...pasted, salt: e.target.value.trim() })} placeholder="its salt, 0x…" className={`${field} font-mono text-sm`} />
          </label>
          {pasted.answer && pasted.salt && !pastedOpens && <p className="text-sm">That is not the answer and salt you sealed.</p>}
          <button type="button" disabled={busy || !pastedOpens || left === null || left > 0n} className={`${action} ${tall}`} onClick={() => reveal(pasted.answer, pasted.salt as Hex)}>
            {busy ? note : "Reveal it"}
          </button>
          <details className="group text-sm">
            <summary className={`cursor-pointer py-2 font-mono text-xs text-silver ${quiet}`}>I lost the salt</summary>
            <p className="mt-2 max-w-[34em] leading-relaxed text-paper/80">
              Sealing again replaces your seal and restarts the ten blocks. If you already sent a reveal, that reveal fails.
            </p>
            <button type="button" disabled={busy || !right || !mine.isSuccess} className={`${second} ${tall} mt-4`} onClick={seal}>
              Seal my answer again
            </button>
          </details>
        </div>
      ) : (
        <button type="button" disabled={busy || !right || !mine.isSuccess} className={`${action} ${tall}`} onClick={seal}>
          {busy ? note : "Seal my answer"}
        </button>
      )}
      {error && (
        <p role="alert" className="border-l-2 border-paper pl-3 text-sm leading-relaxed">
          {error}
        </p>
      )}
    </Part>
  );
}
