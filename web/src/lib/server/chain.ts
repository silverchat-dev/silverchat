import "server-only";

import { createPublicClient, createWalletClient, defineChain, http, type Abi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";

import { CHAIN_ID } from "@/lib/config";

/** Server reads go through RPC_URL. Eligibility reads old blocks, so it must serve history. */
const RPC_URL = process.env.RPC_URL ?? "https://eth.drpc.org";

const chain =
  CHAIN_ID === 1
    ? mainnet
    : defineChain({ id: CHAIN_ID, name: "mainnet fork", nativeCurrency: mainnet.nativeCurrency, rpcUrls: { default: { http: [RPC_URL] } } });

export const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });

export function walletFor(key: string | undefined) {
  if (!key) return null;
  const account = privateKeyToAccount(key as Hex);
  return createWalletClient({ account, chain, transport: http(RPC_URL) });
}

type Wallet = NonNullable<ReturnType<typeof walletFor>>;

/** Simulate first so a call that would revert costs nothing, then send. Returns the tx hash. */
export async function send(wallet: Wallet, call: { address: Hex; abi: Abi; functionName: string; args: readonly unknown[] }) {
  const { request } = await publicClient.simulateContract({ ...call, account: wallet.account } as Parameters<typeof publicClient.simulateContract>[0]);
  return wallet.writeContract(request as Parameters<Wallet["writeContract"]>[0]);
}
