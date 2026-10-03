/**
 * What a SilverCash wallet does: deposit (shield) from your public wallet, swap privately inside Railgun, withdraw
 * (unshield) to any address. A swap or a withdrawal is proved here, then sent either by a public broadcaster, paid in
 * private WETH, or by your own public wallet, which links that wallet to the transaction.
 */
import { createPublicClient, encodeFunctionData, erc20Abi, http, keccak256, parseAbi, type Address, type Hex } from "viem";
import { mainnet } from "viem/chains";

import { ADDR, PUBLIC_RPC_URL } from "@/lib/config";

import { engine, type Opened } from "./engine";
import { afterFee, RAILGUN, swapCalls, tokenOf, type Coin } from "./routes";

const RPC = process.env.NEXT_PUBLIC_CASH_RPC ?? PUBLIC_RPC_URL;
export const chainClient = createPublicClient({ chain: mainnet, transport: http(RPC) });

/** Your public wallet, as the page's wallet connection exposes it. */
export type Sender = {
  address: Address;
  sign: (message: string) => Promise<Hex>;
  send: (tx: { to: Address; data: Hex; value: bigint; gas?: bigint }) => Promise<Hex>;
};

/** How a private transaction leaves this browser: by a broadcaster (private), or signed by your public wallet. */
export type Via = { kind: "self"; sender: Sender } | { kind: "broadcaster"; submit: Submit; fee: { token: Address; perUnitGas: bigint; recipient: string } };
export type Submit = (populated: { to: string; data: string; nullifiers: string[]; pois: unknown; minGasPrice: bigint; relayAdapt: boolean }) => Promise<string>;

const railgunAbi = parseAbi(["function shieldFee() view returns (uint120)", "function unshieldFee() view returns (uint120)"]);
let fees: Promise<{ shield: bigint; unshield: bigint }> | null = null;

/** Railgun's deposit and withdrawal fees in basis points, read from its contract (25 each when this was written). */
export function railgunFees() {
  fees ??= Promise.all([
    chainClient.readContract({ address: RAILGUN, abi: railgunAbi, functionName: "shieldFee" }),
    chainClient.readContract({ address: RAILGUN, abi: railgunAbi, functionName: "unshieldFee" }),
  ]).then(([shield, unshield]) => ({ shield: BigInt(shield), unshield: BigInt(unshield) }));
  return fees;
}

async function gasDetails(gasEstimate = 0n) {
  const { S } = await engine();
  const f = await chainClient.estimateFeesPerGas();
  const type2: typeof S.EVMGasType.Type2 = S.EVMGasType.Type2;
  return { evmGasType: type2, gasEstimate, maxFeePerGas: f.maxFeePerGas, maxPriorityFeePerGas: f.maxPriorityFeePerGas };
}

// ---- deposit: always from your public wallet; the deposit itself is public, what you do after is not

/**
 * Shield `amount` of a coin into the private wallet. Railgun asks for a signature to make the deposit's private key, so
 * the same public wallet can see its own deposits later. ETH is wrapped to WETH on the way in.
 */
export async function deposit(o: Opened, sender: Sender, coin: Coin, amount: bigint, step: (s: string) => void) {
  const { W, S } = await engine();
  const V2 = S.TXIDVersion.V2_PoseidonMerkle;
  step("Sign the deposit key in your wallet…");
  const key = keccak256(await sender.sign(W.getShieldPrivateKeySignatureMessage()));
  if (coin === "eth") {
    const { transaction: t } = await W.populateShieldBaseToken(V2, S.NetworkName.Ethereum, o.address, key, { tokenAddress: ADDR.weth, amount });
    step("Confirm the deposit in your wallet…");
    return sender.send({ to: t.to as Address, data: t.data as Hex, value: amount });
  }
  const token = tokenOf(coin);
  const allowance = await chainClient.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [sender.address, RAILGUN] });
  if (allowance < amount) {
    step("Approve Railgun to take the coins…");
    const hash = await sender.send({ to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [RAILGUN, amount] }), value: 0n });
    if ((await chainClient.waitForTransactionReceipt({ hash })).status !== "success") throw new Error("the approval reverted");
  }
  const { transaction: t } = await W.populateShield(V2, S.NetworkName.Ethereum, key, [{ tokenAddress: token, amount, recipientAddress: o.address }], []);
  step("Confirm the deposit in your wallet…");
  return sender.send({ to: t.to as Address, data: t.data as Hex, value: 0n });
}

// ---- swap and withdraw: proved here, sent by a broadcaster or by you

type Progress = (pct: number) => void;

async function sendProved(
  via: Via,
  build: (broadcasterFee: { tokenAddress: string; amount: bigint; recipientAddress: string } | undefined, gas: Awaited<ReturnType<typeof gasDetails>>, minGasPrice: bigint | undefined) => Promise<{ transaction: { to: string; data: string; value?: bigint }; nullifiers?: string[]; preTransactionPOIsPerTxidLeafPerList: unknown }>,
  estimate: (fee: { tokenAddress: string; feePerUnitGas: bigint } | undefined, gas: Awaited<ReturnType<typeof gasDetails>>) => Promise<bigint>,
  relayAdapt: boolean,
) {
  const { W } = await engine();
  const gas = await gasDetails();
  if (via.kind === "self") {
    gas.gasEstimate = await estimate(undefined, gas);
    const { transaction: t } = await build(undefined, gas, undefined);
    return via.sender.send({ to: t.to as Address, data: t.data as Hex, value: t.value ?? 0n, gas: gas.gasEstimate });
  }
  const feeToken = { tokenAddress: via.fee.token, feePerUnitGas: via.fee.perUnitGas };
  gas.gasEstimate = await estimate(feeToken, gas);
  const fee = W.calculateBroadcasterFeeERC20Amount(feeToken, gas);
  const recipient = { tokenAddress: fee.tokenAddress, amount: fee.amount, recipientAddress: via.fee.recipient };
  const minGasPrice = gas.maxFeePerGas;
  const r = await build(recipient, gas, minGasPrice);
  return via.submit({ to: r.transaction.to, data: r.transaction.data, nullifiers: r.nullifiers ?? [], pois: r.preTransactionPOIsPerTxidLeafPerList, minGasPrice, relayAdapt });
}

/**
 * Swap `amount` of one private coin into another inside Railgun: RelayAdapt takes the coins out (less Railgun's
 * withdrawal fee), runs the Stockereum route, and Railgun shields what it bought back to you (less its deposit fee).
 * What you get back waits an hour before it can be spent, like any deposit.
 */
export async function swap(o: Opened, via: Via, from: Coin, to: Coin, amount: bigint, minOut: bigint, progress: Progress) {
  const { W, S } = await engine();
  const V2 = S.TXIDVersion.V2_PoseidonMerkle;
  const net = S.NetworkName.Ethereum;
  const out = [{ tokenAddress: tokenOf(from), amount }];
  const calls = swapCalls(from, to, afterFee(amount, (await railgunFees()).unshield), minOut).map((c) => ({ to: c.to, data: c.data, value: c.value }));
  const back = [{ tokenAddress: tokenOf(to), recipientAddress: o.address }];
  const self = via.kind === "self";
  return sendProved(
    via,
    async (fee, gas, minGasPrice) => {
      await W.generateCrossContractCallsProof(V2, net, o.id, o.key, out, [], back, [], calls, fee, self, minGasPrice, undefined, (p) => progress(p));
      return W.populateProvedCrossContractCalls(V2, net, o.id, out, [], back, [], calls, fee, self, minGasPrice, gas);
    },
    async (fee, gas) => (await W.gasEstimateForUnprovenCrossContractCalls(V2, net, o.id, o.key, out, [], back, [], calls, gas, fee, self, undefined)).gasEstimate,
    true,
  );
}

/** Withdraw `amount` of a private coin to any address; ETH comes out as ETH. */
export async function withdraw(o: Opened, via: Via, coin: Coin, amount: bigint, to: Address, progress: Progress) {
  const { W, S } = await engine();
  const V2 = S.TXIDVersion.V2_PoseidonMerkle;
  const net = S.NetworkName.Ethereum;
  const self = via.kind === "self";
  if (coin === "eth") {
    const weth = { tokenAddress: ADDR.weth, amount };
    return sendProved(
      via,
      async (fee, gas, minGasPrice) => {
        await W.generateUnshieldBaseTokenProof(V2, net, to, o.id, o.key, weth, fee, self, minGasPrice, (p) => progress(p));
        return W.populateProvedUnshieldBaseToken(V2, net, to, o.id, weth, fee, self, minGasPrice, gas);
      },
      async (fee, gas) => (await W.gasEstimateForUnprovenUnshieldBaseToken(V2, net, to, o.id, o.key, weth, gas, fee, self)).gasEstimate,
      true,
    );
  }
  const r = [{ tokenAddress: tokenOf(coin), amount, recipientAddress: to }];
  return sendProved(
    via,
    async (fee, gas, minGasPrice) => {
      await W.generateUnshieldProof(V2, net, o.id, o.key, r, [], fee, self, minGasPrice, (p) => progress(p));
      return W.populateProvedUnshield(V2, net, o.id, r, [], fee, self, minGasPrice, gas);
    },
    async (fee, gas) => (await W.gasEstimateForUnprovenUnshield(V2, net, o.id, o.key, r, [], gas, fee, self)).gasEstimate,
    false,
  );
}

/** What a swap of `amount` (already less Railgun's withdrawal fee) gives back now, before Railgun's deposit fee. */
export async function quote(from: Coin, to: Coin, amount: bigint): Promise<bigint> {
  const { routerAbi } = await import("@/lib/abi");
  const { scZc, zcWeth } = await import("./routes");
  const read = async (functionName: string, args: unknown[]) =>
    (await chainClient.simulateContract({ address: ADDR.stockereumRouter, abi: routerAbi, functionName, args } as never)).result as unknown;
  switch (`${from}>${to}`) {
    case "sc>zc":
      return (await read("quoteSell", [scZc(), ADDR.sc, amount])) as bigint;
    case "zc>sc":
      return (await read("quoteBuy", [scZc(), ADDR.zc, amount])) as bigint;
    case "zc>eth":
      return (await read("quoteSell", [zcWeth(), ADDR.zc, amount])) as bigint;
    case "eth>zc":
      return (await read("quoteBuy", [zcWeth(), ADDR.weth, amount])) as bigint;
    case "sc>eth":
      return ((await read("quoteSellForEth", [scZc(), ADDR.sc, ADDR.zc, amount])) as [bigint, bigint])[1];
    case "eth>sc":
      return ((await read("quoteBuyWithEth", [scZc(), ADDR.zc, amount])) as [bigint, bigint])[1];
  }
  throw new Error("no route");
}

/** Private balances by state: spendable now, waiting the hour after a deposit, or blocked (only back to where it came from). */
export type Buckets = { spendable: Partial<Record<Coin, bigint>>; waiting: Partial<Record<Coin, bigint>>; blocked: Partial<Record<Coin, bigint>> };

/** Follow the wallet's private balances as Railgun scans; `scan` reports the scan's progress from 0 to 1. */
export async function watch(o: Opened, onBalances: (b: Buckets) => void, scan: (p: number) => void) {
  const { W, S, chain } = await engine();
  const coins: Coin[] = ["sc", "zc", "eth"];
  // Railgun reports each of its buckets on its own; several of them are "waiting" here, so keep them apart and add up
  const raw = new Map<string, Partial<Record<Coin, bigint>>>();
  const into: Partial<Record<string, keyof Buckets>> = {
    [S.RailgunWalletBalanceBucket.Spendable]: "spendable",
    [S.RailgunWalletBalanceBucket.ShieldPending]: "waiting",
    [S.RailgunWalletBalanceBucket.ProofSubmitted]: "waiting",
    [S.RailgunWalletBalanceBucket.MissingInternalPOI]: "waiting",
    [S.RailgunWalletBalanceBucket.MissingExternalPOI]: "waiting",
    [S.RailgunWalletBalanceBucket.ShieldBlocked]: "blocked",
  };
  W.setOnBalanceUpdateCallback((ev) => {
    const bucket = into[ev.balanceBucket];
    if (ev.railgunWalletID !== o.id || !bucket) return;
    const next: Partial<Record<Coin, bigint>> = {};
    for (const c of coins) {
      const hit = ev.erc20Amounts.find((a) => a.tokenAddress.toLowerCase() === tokenOf(c).toLowerCase());
      if (hit) next[c] = hit.amount;
    }
    // a bucket's event lists every coin in it, so it replaces what that bucket held
    raw.set(ev.balanceBucket, next);
    const b: Buckets = { spendable: {}, waiting: {}, blocked: {} };
    for (const [name, amounts] of raw) {
      const to = b[into[name]!];
      for (const c of coins) if (amounts[c]) to[c] = (to[c] ?? 0n) + amounts[c]!;
    }
    onBalances(b);
  });
  W.setOnUTXOMerkletreeScanCallback((e) => scan(e.progress));
  await W.refreshBalances(chain, [o.id]);
}
