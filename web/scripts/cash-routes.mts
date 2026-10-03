// SilverCash's private swaps call Stockereum's router from Railgun's RelayAdapt. This runs the same router calls from a
// test wallet on the anvil fork, every route both ways, and checks each one pays out at least its minimum.
// The wrapBase / unwrapBase steps only exist inside RelayAdapt; here the wallet holds the ETH itself instead.
// Prereq: an anvil mainnet fork (./scripts/local-up.sh sets one up).
//   pnpm dlx tsx scripts/cash-routes.mts
import { createPublicClient, createWalletClient, erc20Abi, http, parseEther, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

process.env.NEXT_PUBLIC_SC ??= "0x3C3959052f60cbddC498b384958841b718112353";
const { ADDR } = await import("../src/lib/config");
const { swapCalls, tokenOf } = await import("../src/lib/cash/routes");

const RPC = process.env.RPC ?? "http://127.0.0.1:8545";
// a fresh wallet: the anvil test keys are public, and on mainnet some are delegated (EIP-7702) to contracts that sweep
// any ETH they receive, which a fork inherits
const me = privateKeyToAccount(generatePrivateKey());
const pub = createPublicClient({ chain: foundry, transport: http(RPC) });
const wallet = createWalletClient({ account: me, chain: foundry, transport: http(RPC) });

const balance = async (coin: "sc" | "zc" | "eth") =>
  coin === "eth" ? pub.getBalance({ address: me.address }) : pub.readContract({ address: tokenOf(coin), abi: erc20Abi, functionName: "balanceOf", args: [me.address] });
const send = async (to: Address, data: `0x${string}`, value = 0n) => {
  const r = await pub.waitForTransactionReceipt({ hash: await wallet.sendTransaction({ to, data, value }) });
  if (r.status !== "success") throw new Error(`reverted: ${to}`);
  return r;
};

await pub.request({ method: "anvil_setBalance" as never, params: [me.address, "0x56BC75E2D63100000"] as never }); // 100 ETH
// coins from the PoolManager, which holds every v4 pool's: the fork lets us act as it
await pub.request({ method: "anvil_impersonateAccount" as never, params: [ADDR.poolManager] as never });
await pub.request({ method: "anvil_setBalance" as never, params: [ADDR.poolManager, "0xDE0B6B3A7640000"] as never });
const pm = createWalletClient({ account: ADDR.poolManager, chain: foundry, transport: http(RPC) });
for (const token of [ADDR.sc, ADDR.zc]) {
  await pub.waitForTransactionReceipt({ hash: await pm.writeContract({ address: token, abi: erc20Abi, functionName: "transfer", args: [me.address, 2_000_000n * 10n ** 18n] }) });
}
await send(ADDR.weth, "0xd0e30db0", parseEther("2")); // WETH.deposit()

const routes = [
  ["sc", "zc", 100_000n * 10n ** 18n],
  ["zc", "sc", 1_000n * 10n ** 18n],
  ["zc", "eth", 1_000n * 10n ** 18n],
  ["eth", "zc", parseEther("0.05")],
  ["sc", "eth", 100_000n * 10n ** 18n],
  ["eth", "sc", parseEther("0.05")],
] as const;

for (const [from, to, amount] of routes) {
  // ETH out of a route lands as ETH here (RelayAdapt wraps it); the eth>zc route spends WETH like RelayAdapt does
  const out = to === "eth" && from === "zc" ? "weth" : to;
  const before = out === "weth" ? await pub.readContract({ address: ADDR.weth, abi: erc20Abi, functionName: "balanceOf", args: [me.address] }) : await balance(to);
  let gas = 0n;
  for (const c of swapCalls(from, to, amount, 1n)) {
    // RelayAdapt's own wrap and unwrap: the wallet already holds ETH, skip
    if (c.to.toLowerCase() === "0xac9f360ae85469b27aeddeafc579ef2d052ad405") continue;
    const r = await send(c.to, c.data, c.value);
    if (out === "eth") gas += r.gasUsed * r.effectiveGasPrice;
  }
  const after = out === "weth" ? await pub.readContract({ address: ADDR.weth, abi: erc20Abi, functionName: "balanceOf", args: [me.address] }) : await balance(to);
  const got = after - before + gas;
  if (got <= 0n) throw new Error(`FAILED ${from} > ${to}: got ${got}`);
  console.log(`ok  ${from} > ${to}: ${amount} in, ${got} out`);
}
console.log("all routes good");
