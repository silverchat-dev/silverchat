/**
 * SilverCash runs Railgun's wallet SDK in the browser and only there: the private wallet, its keys and its balances
 * never reach our server. The engine keeps its notes in IndexedDB, the proving files in the Cache API, and proves in a
 * Web Worker so the page keeps moving. One engine per page, started on first use.
 */
import type { Address } from "viem";

type W = typeof import("@railgun-community/wallet");
type S = typeof import("@railgun-community/shared-models");
export type Railgun = { W: W; S: S; chain: { type: number; id: number } };

// Railgun's own Proof of Innocence node; a fork has none, so the address can be emptied for local tests
const POI_NODES = (process.env.NEXT_PUBLIC_CASH_POI ?? "https://ppoi.fdi.network").split(",").filter(Boolean);
// SilverCash reads Ethereum mainnet through public RPCs, never ours, so our server never sees a SilverCash request; two
// of them, so one failing call is answered by the other
export const CASH_RPCS = (process.env.NEXT_PUBLIC_CASH_RPC ?? "https://ethereum-rpc.publicnode.com,https://eth.drpc.org").split(",").filter(Boolean);

let started: Promise<Railgun> | null = null;

export function engine() {
  started ??= start().catch((e) => {
    started = null;
    throw e;
  });
  return started;
}

async function start(): Promise<Railgun> {
  const [W, S, LevelJs] = await Promise.all([import("@railgun-community/wallet"), import("@railgun-community/shared-models"), import("level-js")]);
  const files = await caches.open("silvercash-artifacts");
  const url = (path: string) => `/silvercash-artifacts/${path}`;
  const store = new W.ArtifactStore(
    async (path) => {
      const hit = await files.match(url(path));
      return hit ? Buffer.from(await hit.arrayBuffer()) : null;
    },
    async (_dir, path, item) => files.put(url(path), new Response(typeof item === "string" ? item : new Uint8Array(item))),
    async (path) => !!(await files.match(url(path))),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = new (LevelJs as any).default("silvercash");
  // NEXT_PUBLIC_CASH_DEBUG=1 prints the engine's own log to the console, for local testing only
  const debug = process.env.NEXT_PUBLIC_CASH_DEBUG === "1";
  if (debug) W.setLoggers(console.log, console.error);
  await W.startRailgunEngine("silvercash", db, debug, store, false, false, POI_NODES, undefined, debug);
  W.getProver().setSnarkJSGroth16(workerProver());
  const chainId = S.NETWORK_CONFIG[S.NetworkName.Ethereum].chain.id;
  // weights add up to at least 2, as Railgun's fallback provider asks; the first answers unless it stalls
  const providers = CASH_RPCS.map((provider, i) => ({ provider, priority: i + 1, weight: CASH_RPCS.length === 1 ? 2 : 1 }));
  await W.loadProvider({ chainId, providers }, S.NetworkName.Ethereum);
  return { W, S, chain: S.NETWORK_CONFIG[S.NetworkName.Ethereum].chain };
}

/** snarkjs's groth16 prover, run in a worker: a proof takes 5 to 30 seconds and would freeze the page. */
function workerProver() {
  let next = 0;
  const waiting = new Map<number, { ok: (v: unknown) => void; fail: (e: Error) => void }>();
  let worker: Worker | null = null;
  const get = () => {
    if (worker) return worker;
    worker = new Worker(new URL("./prove.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ id: number; result?: unknown; error?: string }>) => {
      const w = waiting.get(e.data.id);
      waiting.delete(e.data.id);
      if (e.data.error) w?.fail(new Error(e.data.error));
      else w?.ok(e.data.result);
    };
    return worker;
  };
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fullProve: (inputs: any, wasm: any, zkey: any) =>
      new Promise<never>((ok, fail) => {
        const id = next++;
        waiting.set(id, { ok: ok as (v: unknown) => void, fail });
        get().postMessage({ id, inputs, wasm, zkey });
      }),
    verify: undefined,
  };
}

// ---- the private wallet: a new 12-word phrase, kept encrypted in this browser with a password

const SAVED = "silvercash:wallet";
type Saved = { id: string; salt: string; block: number; address: string };

export const saved = (): Saved | null => {
  try {
    return JSON.parse(localStorage.getItem(SAVED) ?? "null");
  } catch {
    return null;
  }
};

/** The engine's 32-byte encryption key from the password: PBKDF2-SHA256, 600,000 rounds, a random salt per wallet. */
async function keyFrom(password: string, salt: string) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: 600_000 }, base, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type Opened = { id: string; address: string; key: string };

/**
 * Make a new private wallet, or restore one from its words. Derivation index 0 and no extra passphrase, as Railway and
 * other Railgun wallets do, so the words alone recover it anywhere. `block` is where scanning starts.
 */
export async function createWallet(password: string, mnemonic: string, block: number | undefined): Promise<Opened> {
  const { W, S } = await engine();
  const salt = crypto.randomUUID();
  const key = await keyFrom(password, salt);
  const info = await W.createRailgunWallet(key, mnemonic, block ? { [S.NetworkName.Ethereum]: block } : undefined, 0);
  localStorage.setItem(SAVED, JSON.stringify({ id: info.id, salt, block: block ?? 0, address: info.railgunAddress } satisfies Saved));
  return { id: info.id, address: info.railgunAddress, key };
}

/** Open the saved wallet; a wrong password fails to decrypt it. */
export async function unlock(password: string): Promise<Opened> {
  const s = saved();
  if (!s) throw new Error("no SilverCash wallet in this browser");
  const { W } = await engine();
  const key = await keyFrom(password, s.salt);
  try {
    const info = await W.loadWalletByID(key, s.id, false);
    return { id: info.id, address: info.railgunAddress, key };
  } catch {
    throw new Error("wrong password");
  }
}

export async function wordsOf(o: Opened) {
  const { W } = await engine();
  return W.getWalletMnemonic(o.key, o.id);
}

/** Remove the wallet from this browser. Without its words, what it holds is gone. */
export async function forget(o: Opened) {
  const { W } = await engine();
  await W.deleteWalletByID(o.id);
  localStorage.removeItem(SAVED);
}

export type Balances = Record<string, Partial<Record<Address, bigint>>>;
