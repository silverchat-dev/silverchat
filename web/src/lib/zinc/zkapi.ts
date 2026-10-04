/**
 * zkAPI (the Ethereum Foundation and Open Anonymity): a private ETH balance in a vault on Ethereum, spent on AI models
 * with zero-knowledge proofs instead of an account. The SDK runs in this browser: its note, proofs and keys stay here.
 * The burner is its wallet, so the deposit comes from an address with no past. Our server only passes the SDK's calls
 * to the zkAPI server under /zkapi-deployment/ (its POSTs allow no other origin); it keeps and logs nothing.
 */
import { formatEther } from "viem";

import { balanceOf, burnerProvider } from "./burner";

type Client = typeof import("@openanonymity/zkapi-browser-sdk/client").default;
export type Burner = ReturnType<typeof burnerProvider>;

let started: Promise<Client> | null = null;

/** The SDK, set up once per page with the burner as its wallet. */
export function zkapi(burner: Burner) {
  started ??= (async () => {
    const [{ configureBrowserSdk }, { default: client }] = await Promise.all([
      import("@openanonymity/zkapi-browser-sdk/configure"),
      import("@openanonymity/zkapi-browser-sdk/client"),
    ]);
    configureBrowserSdk({ configUrl: "/zkapi/browser-config.json", workerUrl: "/zkapi/assets/zkapiWasmWorker.js" });
    client.setWalletProvider(burner);
    await client.init();
    return client;
  })().catch((e) => {
    started = null;
    throw e;
  });
  return started;
}

// gas the burner keeps back for the deposit, the closing withdrawal and the transfer out to NEAR. The vault hashes the
// note into a depth-32 Poseidon tree on chain: its deposits use about 6.75M gas and mutual closes about 7.06M (its
// mainnet transactions, 2026-10-02 to 04). Priced at three times today's gas, at least 0.5 gwei; what is not spent
// goes out with the exit, so keeping too much costs nothing.
export const RESERVE_GAS = 6_800_000n + 7_100_000n + 21_000n;
export const reserveWei = (gasPrice: bigint) => RESERVE_GAS * (3n * gasPrice > 500_000_000n ? 3n * gasPrice : 500_000_000n);

/**
 * Put everything the burner holds, less the gas reserve, into the vault. The SDK prepares the exact transaction first
 * so its gas is estimated on the real calldata; the amount is whole gwei, as the vault takes.
 */
export async function depositAll(burner: Burner, onStatus: (s: string) => void) {
  const client = await zkapi(burner);
  const [balance, gasPrice] = await Promise.all([balanceOf(burner), burner.reads.getGasPrice()]);
  const usable = ((balance - reserveWei(gasPrice)) / 1_000_000_000n) * 1_000_000_000n;
  if (usable <= 0n) throw new Error(`the burner holds ${formatEther(balance)} ETH, not enough above the gas it keeps for later`);
  const eth = formatEther(usable);
  const prepared = await client.prepareDepositQuote(eth, { from: burner.address });
  await client.deposit(eth, (s: { message?: string } | string) => onStatus(typeof s === "string" ? s : (s?.message ?? "")), {
    preparedOperationId: prepared.operationId,
  });
  return usable;
}

/** A short-lived OpenRouter key paid from the private balance, capped at `usd` (one of the SDK's tiers). */
export async function access(burner: Burner, usd: number, onProgress: (s: string) => void, signal?: AbortSignal) {
  const client = await zkapi(burner);
  return client.acquireInferenceAccess(crypto.randomUUID(), {
    spendingLimitUsd: usd,
    signal,
    onProgress: (p: { message?: string }) => onProgress(p.message ?? ""),
  }) as Promise<{ apiKey: string; release: () => void }>;
}

/** Close the note and pay what is left back to the burner ("mutual"), or by the slow road without the server ("escape"). */
export async function withdraw(burner: Burner, mode: "mutual" | "escape", onStatus: (s: string) => void) {
  const client = await zkapi(burner);
  return client.withdraw(mode, (s: { message?: string } | string) => onStatus(typeof s === "string" ? s : (s?.message ?? "")), {
    destination: burner.address,
  });
}

export const TIERS = [1, 2, 3, 4.5, 6] as const;
