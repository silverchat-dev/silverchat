import "server-only";

import { createPublicClient, createWalletClient, defineChain, formatGwei, http, parseGwei, type Abi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";

import { CHAIN_ID } from "@/lib/config";

/** Server reads go through RPC_URL. Eligibility reads old blocks, so it must serve history. */
const RPC_URL = process.env.RPC_URL ?? "https://eth.drpc.org";

const chain =
  CHAIN_ID === 1
    ? mainnet
    : defineChain({
        id: CHAIN_ID,
        name: "mainnet fork",
        nativeCurrency: mainnet.nativeCurrency,
        rpcUrls: { default: { http: [RPC_URL] } },
        contracts: mainnet.contracts,
      });

const transport = () => http(RPC_URL, { timeout: 12_000, retryCount: 2 });
export const publicClient = createPublicClient({ chain, transport: transport() });

export function walletFor(key: string | undefined) {
  if (!key) return null;
  const account = privateKeyToAccount(key as Hex);
  return createWalletClient({ account, chain, transport: transport() });
}

export const poster = walletFor(process.env.POSTER_PRIVATE_KEY);
export const pricer = walletFor(process.env.PRICER_PRIVATE_KEY);

// above this the server waits: a poll has 7 days to be fixed and the price 5% of room, neither is worth a spike
const MAX_FEE = parseGwei("30");

type Wallet = NonNullable<ReturnType<typeof walletFor>>;

/** Simulate first so a call that would revert costs nothing, then send. Returns the tx hash. */
export async function send(wallet: Wallet, call: { address: Hex; abi: Abi; functionName: string; args: readonly unknown[] }) {
  const fees = await publicClient.estimateFeesPerGas();
  if (fees.maxFeePerGas > MAX_FEE) throw new Error(`gas is ${formatGwei(fees.maxFeePerGas)} gwei, over the ${formatGwei(MAX_FEE)} cap; trying later`);
  const { request } = await publicClient.simulateContract({ ...call, account: wallet.account, ...fees } as Parameters<typeof publicClient.simulateContract>[0]);
  return wallet.writeContract(request as Parameters<Wallet["writeContract"]>[0]);
}
