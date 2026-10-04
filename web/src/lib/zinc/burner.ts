/**
 * Zinc's burner: a fresh Ethereum key made in this browser for one round trip. It has no past (nothing but the swap
 * ever paid it) and no future (it is wiped after the exit). It is kept encrypted with a password, like SilverCash's
 * wallet, and can be saved as a plain private key that opens in any Ethereum wallet.
 */
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";

import { CASH_RPCS } from "@/lib/cash/engine";

const SAVED = "zinc:burner";
type Saved = { address: Hex; salt: string; iv: string; box: string };

const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const bytes = (h: string) => Uint8Array.from(h.match(/../g)!.map((x) => parseInt(x, 16)));

export const savedBurner = (): Saved | null => {
  try {
    return JSON.parse(localStorage.getItem(SAVED) ?? "null");
  } catch {
    return null;
  }
};

/** AES-GCM key from the password: PBKDF2-SHA256, 600,000 rounds, a random salt per burner (as SilverCash). */
async function keyFrom(password: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: 600_000 }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function seal(key: Hex, password: string): Promise<Saved> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const box = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await keyFrom(password, salt), bytes(key.slice(2)) as BufferSource);
  return { address: privateKeyToAccount(key).address, salt: hex(salt), iv: hex(iv), box: hex(box) };
}

export async function open(s: Saved, password: string): Promise<Hex> {
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(s.iv) as BufferSource }, await keyFrom(password, bytes(s.salt)), bytes(s.box) as BufferSource);
    return `0x${hex(plain)}`;
  } catch {
    throw new Error("wrong password");
  }
}

/** A new burner, or one brought back from its saved private key. */
export async function makeBurner(password: string, imported?: Hex): Promise<Hex> {
  const key = imported ?? generatePrivateKey();
  localStorage.setItem(SAVED, JSON.stringify(await seal(key, password)));
  return key;
}

export const unlockBurner = async (password: string) => {
  const s = savedBurner();
  if (!s) throw new Error("no Zinc burner in this browser");
  return open(s, password);
};

export const wipeBurner = () => localStorage.removeItem(SAVED);

/**
 * The burner as an EIP-1193 provider for the zkAPI SDK: it answers with the burner's address, signs its transactions
 * here, and sends every read to the same public RPCs SilverCash uses, so no wallet extension is involved.
 */
export function burnerProvider(key: Hex) {
  const account = privateKeyToAccount(key);
  const transport = http(CASH_RPCS[0]);
  const wallet = createWalletClient({ account, chain: mainnet, transport });
  const reads = createPublicClient({ chain: mainnet, transport });
  const rpc = transport({ chain: mainnet });
  return {
    address: account.address,
    wallet,
    reads,
    async request({ method, params }: { method: string; params?: unknown[] }): Promise<unknown> {
      switch (method) {
        case "eth_requestAccounts":
        case "eth_accounts":
          return [account.address];
        case "eth_chainId":
          return `0x${mainnet.id.toString(16)}`;
        case "wallet_switchEthereumChain":
        case "wallet_addEthereumChain":
          return null;
        case "eth_sendTransaction": {
          const [tx] = params as [{ from?: Hex; to: Hex; data?: Hex; value?: Hex; gas?: Hex; nonce?: Hex }];
          if (tx.from && tx.from.toLowerCase() !== account.address.toLowerCase()) throw new Error("not the burner's transaction");
          return wallet.sendTransaction({
            to: tx.to,
            data: tx.data,
            value: tx.value ? BigInt(tx.value) : undefined,
            gas: tx.gas ? BigInt(tx.gas) : undefined,
            nonce: tx.nonce ? Number(tx.nonce) : undefined,
          });
        }
        default:
          return rpc.request({ method, params } as never);
      }
    },
    on() {},
    removeListener() {},
  };
}

export const balanceOf = (b: ReturnType<typeof burnerProvider>) => b.reads.getBalance({ address: b.address });

/**
 * Everything the burner can send in one plain transfer: its balance less that transfer's gas, priced at twice today's
 * base fee so it goes through. The exit quotes NEAR for exactly this amount and then sends exactly it.
 */
export async function sendable(b: ReturnType<typeof burnerProvider>) {
  const [balance, block] = await Promise.all([balanceOf(b), b.reads.getBlock()]);
  const maxPriorityFeePerGas = 10_000_000n;
  const maxFeePerGas = 2n * (block.baseFeePerGas ?? 0n) + maxPriorityFeePerGas;
  const value = balance - 21_000n * maxFeePerGas;
  if (value <= 0n) throw new Error("the burner holds less than the gas to send it");
  return { value, maxFeePerGas, maxPriorityFeePerGas };
}

// what the fee does not use stays behind as dust: the burner is wiped after this
export const send = (b: ReturnType<typeof burnerProvider>, to: Hex, s: Awaited<ReturnType<typeof sendable>>) =>
  b.wallet.sendTransaction({ to, gas: 21_000n, ...s });
