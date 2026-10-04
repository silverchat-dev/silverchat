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
let wallet: Burner | null = null;

/** The SDK, set up once per page, with the open burner as its wallet (a new burner replaces the old one). */
export async function zkapi(burner: Burner) {
  started ??= (async () => {
    const [{ configureBrowserSdk }, { default: client }] = await Promise.all([
      import("@openanonymity/zkapi-browser-sdk/configure"),
      import("@openanonymity/zkapi-browser-sdk/client"),
    ]);
    configureBrowserSdk({ configUrl: "/zkapi/browser-config.json", workerUrl: "/zkapi/assets/zkapiWasmWorker.js" });
    client.setWalletProvider(burner);
    wallet = burner;
    await client.init();
    return client;
  })();
  // a failed start stays failed: the SDK takes its settings once per page, so only a reload starts it again
  const client = await started.catch((e) => {
    throw new Error(`${e instanceof Error ? e.message : e}. Reload the page to try again`);
  });
  if (wallet?.address !== burner.address) {
    client.setWalletProvider(burner);
    wallet = burner;
  }
  return client;
}

// gas the burner keeps back for the deposit, the closing withdrawal and the transfer out to NEAR. The vault hashes the
// note into a depth-32 Poseidon tree on chain: its deposits use about 6.75M gas and mutual closes about 7.06M (its
// mainnet transactions on Blockscout, 2026-10-02 to 04). Priced at twice today's max fee per gas, base fee and tip
// (the SDK also pads its gas limit by a fifth), and at least 0.2 gwei; what is not spent goes out with the exit, so
// keeping more than needed costs nothing.
export const RESERVE_GAS = 6_800_000n + 7_100_000n + 21_000n;
export const reserveWei = (maxFeePerGas: bigint) => RESERVE_GAS * (2n * maxFeePerGas > 200_000_000n ? 2n * maxFeePerGas : 200_000_000n);
export const reserveNow = async (burner: Burner) => reserveWei((await burner.reads.estimateFeesPerGas()).maxFeePerGas);

// the SDK's status lines speak of MetaMask; here the burner signs
const said = (onStatus: (s: string) => void) => (s: { message?: string } | string) =>
  onStatus((typeof s === "string" ? s : (s?.message ?? "")).replace(/MetaMask/g, "the burner"));

/**
 * Put everything the burner holds, less the gas reserve, into the vault. The SDK prepares the transaction first and
 * signs that same one; the amount is whole gwei, as the vault takes.
 */
export async function depositAll(burner: Burner, onStatus: (s: string) => void) {
  const client = await zkapi(burner);
  const [balance, reserve] = await Promise.all([balanceOf(burner), reserveNow(burner)]);
  const usable = ((balance - reserve) / 1_000_000_000n) * 1_000_000_000n;
  if (usable <= 0n) throw new Error(`the burner holds ${formatEther(balance)} ETH, not enough above the gas it keeps for later`);
  const eth = formatEther(usable);
  const prepared = await client.prepareDepositQuote(eth, { from: burner.address });
  await client.deposit(eth, said(onStatus), {
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
    onProgress: said(onProgress),
  }) as Promise<{ apiKey: string; release: () => void }>;
}

/** Close the note and pay what is left back to the burner ("mutual"), or by the slow road without the server ("escape"). */
export async function withdraw(burner: Burner, mode: "mutual" | "escape", onStatus: (s: string) => void) {
  const client = await zkapi(burner);
  return client.withdraw(mode, said(onStatus), {
    destination: burner.address,
  });
}

/** The slow way out, second half: once the 24-hour window has passed, pay the escaped balance to the burner. */
export async function finishEscape(burner: Burner, recordId: string, onStatus: (s: string) => void) {
  const client = await zkapi(burner);
  return client.finalizeEscape(recordId, said(onStatus));
}

// the spending caps zkAPI offers per key, in dollars
export const TIERS = [1, 2, 3, 4.5, 6] as const;
