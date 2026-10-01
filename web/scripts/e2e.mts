// End to end on the local fork: ask -> three answers -> close -> finalize -> claim -> recount.
// Proves the TypeScript trees and the Solidity verifier agree.
// Prereq: anvil fork + ./scripts/local-up.sh, and the web app running with web/.env.local (ENABLE_WORKERS=1).
//   pnpm dlx tsx scripts/e2e.mts
import { readFileSync } from "node:fs";

import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  erc20Abi,
  http,
  keccak256,
  parseEventLogs,
  stringToBytes,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

import { askAbi, predictAbi } from "../src/lib/abi";
import { resultLeaf, tagsHash, types } from "../src/lib/answer";
import { commitmentOf, FEEDS, NO, questionString, YES, type Side } from "../src/lib/market";
import { rewardsMessage, today } from "../src/lib/rewards";

const RPC = "http://127.0.0.1:8545";
const APP = process.env.APP_URL ?? "http://localhost:3100";
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => l.split(/=(.*)/).slice(0, 2) as [string, string]),
);
const ASK = env.NEXT_PUBLIC_ASK as Address;
const ZC = "0x4E67DB19044549fF420860834c91b45BaD298722" as Address;
const POOL_MANAGER = "0x000000000004444c5dc75cB358380D2e3dE08A90" as Address;
const PREDICT = env.NEXT_PUBLIC_PREDICT as Address;
const SC = "0x3C3959052f60cbddC498b384958841b718112353" as Address;
const REALITY = "0x5b7dD1E86623548AF054A4985F7fc8Ccbb554E2c" as Address;
// anvil test key 3, the keeper; it also posts the operator's answer on Reality.eth here
const KEEPER = privateKeyToAccount(env.KEEPER_PRIVATE_KEY as Hex);
// anvil test keys 5..8
const ASKER = privateKeyToAccount("0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba");
const VOTERS = [
  "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e",
  "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356",
  "0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97",
].map((k) => privateKeyToAccount(k as Hex));

const pub = createPublicClient({ chain: foundry, transport: http(RPC) });
const wallet = (account: ReturnType<typeof privateKeyToAccount>) => createWalletClient({ account, chain: foundry, transport: http(RPC) });
const rpc = (method: string, params: unknown[]) =>
  fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }).then((r) => r.json());
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const check = (ok: unknown, what: string) => {
  if (!ok) throw new Error(`FAILED: ${what}`);
  console.log(`ok  ${what}`);
};
async function until<T>(what: string, fn: () => Promise<T | null | undefined | false>, seconds = 90): Promise<T> {
  for (let i = 0; i < seconds; i++) {
    const v = await fn().catch(() => null);
    if (v) return v;
    await sleep(1000);
  }
  throw new Error(`timed out waiting for ${what}`);
}

// ZC for the voters, before the poll opens (eligibility is read at the ask block)
await rpc("anvil_impersonateAccount", [POOL_MANAGER]);
await rpc("anvil_setBalance", [POOL_MANAGER, "0x56BC75E2D63100000"]);
for (const v of VOTERS) {
  await rpc("eth_sendTransaction", [{ from: POOL_MANAGER, to: ZC, data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [v.address, 10n ** 24n] }) }]);
}
await rpc("anvil_stopImpersonatingAccount", [POOL_MANAGER]);

const content = { v: 2, topic: "Other", questions: [{ q: `End to end check ${Date.now()}`, options: ["Yes", "No"] }] };
const text = JSON.stringify(content);
const hash = keccak256(stringToBytes(text));
const draft = await (await fetch(`${APP}/api/polls`, { method: "POST", headers: { "content-type": "application/json" }, body: text })).json();
check(draft.contentHash === hash, "draft hash matches the browser's");

await until("a price", async () => (await pub.readContract({ address: ASK, abi: askAbi, functionName: "pricePerPerson" })) > 0n);
const cost = await pub.readContract({ address: ASK, abi: askAbi, functionName: "costOf", args: [100n, 0] });
const asker = wallet(ASKER);
await pub.waitForTransactionReceipt({ hash: await asker.writeContract({ address: ZC, abi: erc20Abi, functionName: "approve", args: [ASK, cost] }) });
const receipt = await pub.waitForTransactionReceipt({
  hash: await asker.writeContract({ address: ASK, abi: askAbi, functionName: "ask", args: [hash, 100, 0, 3600, cost] }),
});
const id = parseEventLogs({ abi: askAbi, logs: receipt.logs, eventName: "Asked" })[0].args.id;
await until("the indexer", async () => (await fetch(`${APP}/api/polls/${id}`)).ok);
check(true, `poll ${id} asked and indexed`);

const domain = { name: "Silverchat", version: "1", chainId: foundry.id, verifyingContract: ASK } as const;
const kept: { choices: number[]; salt: Hex }[] = [];
for (const [i, v] of VOTERS.entries()) {
  const choices = [i === 2 ? 1 : 0];
  const salt = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const signature = await wallet(v).signTypedData({ domain, types, primaryType: "Answer", message: { pollId: id, choices, tagsHash: tagsHash("", ""), salt } });
  const res = await fetch(`${APP}/api/answer`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pollId: String(id), voter: v.address, choices, region: "", age: "", salt, signature }),
  });
  check(res.ok, `voter ${i + 1} answered (${res.status})`);
  kept.push({ choices, salt });
}
const again = await fetch(`${APP}/api/answer`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pollId: String(id), voter: VOTERS[0].address, choices: [1], region: "", age: "", salt: kept[0].salt, signature: "0x00" }) });
check(again.status === 401 || again.status === 409, "a second answer is refused");

await rpc("evm_increaseTime", [3661]);
await rpc("evm_mine", []);
const final = await until("the finalizer", async () => {
  const p = await (await fetch(`${APP}/api/polls/${id}`)).json();
  return p.status === "final" ? p : null;
}, 180);
check(JSON.stringify(final.tally.totals) === "[[2,1]]", "totals are 2 yes, 1 no");

const leaves = await (await fetch(`${APP}/api/polls/${id}/leaves`)).json();
const recount = StandardMerkleTree.of(
  leaves.answers.map((a: { choices: number[]; salt: Hex }) => [resultLeaf(id, a.choices, a.salt)]),
  ["bytes32"],
);
check(recount.root === final.resultRoot, "anyone can recompute the result root from the published leaves");
const mine = await (await fetch(`${APP}/api/receipt?poll=${id}&leaf=${resultLeaf(id, kept[0].choices, kept[0].salt)}`)).json();
check(mine.included, "a voter can prove their answer is in the record");

const before = await pub.readContract({ address: ZC, abi: erc20Abi, functionName: "balanceOf", args: [VOTERS[0].address] });
type Claim = { id: string; amount: string; proof: Hex[] };
const day = today();
const sig = await wallet(VOTERS[0]).signMessage({ message: rewardsMessage(VOTERS[0].address, day) });
const claimsUrl = `${APP}/api/claims/${VOTERS[0].address}?day=${day}`;
check((await fetch(claimsUrl, { headers: { "x-rewards-signature": "0x00" } })).status === 401, "rewards are private without the wallet's signature");
const { claims } = (await (await fetch(claimsUrl, { headers: { "x-rewards-signature": sig } })).json()) as { claims: Claim[] };
check(claims.some((c) => c.id === String(id)), "the voter has a reward to claim from this poll");
await pub.waitForTransactionReceipt({
  hash: await wallet(VOTERS[0]).writeContract({
    address: ASK,
    abi: askAbi,
    functionName: "claimMany",
    args: [VOTERS[0].address, claims.map((c) => BigInt(c.id)), claims.map((c) => BigInt(c.amount)), claims.map((c) => c.proof)],
  }),
});
const after = await pub.readContract({ address: ZC, abi: erc20Abi, functionName: "balanceOf", args: [VOTERS[0].address] });
const sum = claims.reduce((s, c) => s + BigInt(c.amount), 0n);
check(after - before === sum, `claimed ${sum} wei of ZC from ${claims.length} poll(s) through the on-chain proofs`);
const left = (await (await fetch(claimsUrl, { headers: { "x-rewards-signature": sig } })).json()) as { claims: Claim[] };
check(left.claims.length === 0, "nothing is left to claim");

// Predict: an event market end to end, a price market up to its reveals, an unanswered event voided
const realityAbi = [
  { type: "function", name: "submitAnswer", stateMutability: "payable", inputs: [{ type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }], outputs: [] },
] as const;
const tx = async (hash: Hex) => {
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`reverted: ${hash}`);
  return receipt;
};
const chainNow = async () => Number((await pub.getBlock()).timestamp);
const warpTo = async (ts: number) => {
  await rpc("evm_increaseTime", [Math.max(0, ts - (await chainNow()))]);
  await rpc("evm_mine", []);
};
const market = async (mid: bigint) => (await fetch(`${APP}/api/markets/${mid}`)).json();

const opener = wallet(ASKER);
const lock = await pub.readContract({ address: PREDICT, abi: predictAbi, functionName: "lockAmount" });
await tx(await opener.writeContract({ address: SC, abi: erc20Abi, functionName: "approve", args: [PREDICT, lock * 3n] }));
const t0 = await chainNow();
const closesAt = t0 + 2 * 3600;
const resolvesAt = closesAt + 3600;
const openOne = async (fn: () => Promise<Hex>) => {
  const r = await tx(await fn());
  return parseEventLogs({ abi: predictAbi, logs: r.logs, eventName: "Opened" })[0].args.id;
};
const ev = await openOne(() =>
  opener.writeContract({ address: PREDICT, abi: predictAbi, functionName: "openEvent", args: [questionString(`End to end event ${t0}?`, "Other"), closesAt, resolvesAt] }),
);
const price = await openOne(() =>
  opener.writeContract({ address: PREDICT, abi: predictAbi, functionName: "openPrice", args: [keccak256(stringToBytes("eth")), FEEDS["ETH/USD"], 1n, closesAt, resolvesAt] }),
);
const quiet = await openOne(() =>
  opener.writeContract({ address: PREDICT, abi: predictAbi, functionName: "openEvent", args: [questionString(`Nobody answers this ${t0}?`, "Other"), closesAt, resolvesAt] }),
);
await until("the indexer", async () => (await fetch(`${APP}/api/markets/${quiet}`)).ok);
check((await market(ev)).title === `End to end event ${t0}?`, `markets ${ev}, ${price}, ${quiet} opened and indexed with the question from the chain`);

// voter 1 reveals in the browser, voter 2 hands the seal to the keeper, voter 3 never reveals and loses
const sides: Side[] = [YES, NO, YES];
const salts = VOTERS.map(() => toHex(crypto.getRandomValues(new Uint8Array(32))));
const STAKE = 1000n * 10n ** 18n;
for (const [i, v] of VOTERS.entries()) {
  await tx(await wallet(v).writeContract({ address: ZC, abi: erc20Abi, functionName: "approve", args: [PREDICT, STAKE * 3n] }));
  for (const mid of [ev, price, quiet]) {
    await tx(
      await wallet(v).writeContract({ address: PREDICT, abi: predictAbi, functionName: "stake", args: [mid, STAKE, commitmentOf(mid, v.address, sides[i], salts[i])] }),
    );
  }
}
const seal = (mid: bigint, i: number, salt = salts[i]) =>
  fetch(`${APP}/api/markets/${mid}/seal`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ staker: VOTERS[i].address, side: sides[i], salt }) });
check((await seal(ev, 1, toHex(crypto.getRandomValues(new Uint8Array(32))))).status === 401, "a seal that does not open the stake is refused");
check((await seal(ev, 1)).ok && (await seal(price, 1)).ok, "voter 2 handed the keeper the seals");
await until("the stakes", async () => (await market(ev)).stakes === 3);
const before24 = await market(ev);
check(before24.yes === "0" && before24.no === "0" && before24.pool === String(STAKE * 3n), "while open: the pool is public, no side is");

await warpTo(closesAt);
const one = (mid: bigint) =>
  wallet(VOTERS[0]).writeContract({ address: PREDICT, abi: predictAbi, functionName: "reveal", args: [mid, [VOTERS[0].address], [YES], [salts[0]]] });
await tx(await one(ev));
await tx(await one(price));
await warpTo(closesAt + 48 * 3600 + 1);
await until("the keeper's reveals", async () => (await market(ev)).no === String(STAKE) && (await market(price)).no === String(STAKE), 240);
check(true, "the keeper revealed the seal it holds, 48 hours after close");

// the operator answers YES on Reality.eth from the keeper key; then the 2-day timeout and the reveal window pass
const qid = (await pub.readContract({ address: PREDICT, abi: predictAbi, functionName: "market", args: [ev] })).questionId;
await tx(await wallet(KEEPER).writeContract({ address: REALITY, abi: realityAbi, functionName: "submitAnswer", args: [qid, toHex(1, { size: 32 }), 0n], value: 10n ** 16n }));
await warpTo(Math.max(resolvesAt, closesAt + 72 * 3600) + 2 * 86_400 + 1);
const settled = await until("the keeper's settle", async () => ((await market(ev)).status === "yes" ? market(ev) : null), 240);
check(settled.refund === false, "settled YES; voter 3's unrevealed YES is lost to the pool");
const zcBefore = await pub.readContract({ address: ZC, abi: erc20Abi, functionName: "balanceOf", args: [VOTERS[0].address] });
await tx(await wallet(VOTERS[0]).writeContract({ address: PREDICT, abi: predictAbi, functionName: "claim", args: [ev] }));
const won = (await pub.readContract({ address: ZC, abi: erc20Abi, functionName: "balanceOf", args: [VOTERS[0].address] })) - zcBefore;
check(won === (STAKE * 3n * 98n) / 100n, `the one revealed winner took the pool less 2%: ${won} wei`);
const scBefore = await pub.readContract({ address: SC, abi: erc20Abi, functionName: "balanceOf", args: [ASKER.address] });
await tx(await opener.writeContract({ address: PREDICT, abi: predictAbi, functionName: "claimLock", args: [ev] }));
check((await pub.readContract({ address: SC, abi: erc20Abi, functionName: "balanceOf", args: [ASKER.address] })) - scBefore === lock, "the opener took the SC lock back");

await warpTo(resolvesAt + 30 * 86_400 + 1);
await until("the keeper's void", async () => (await market(quiet)).status === "void", 240);
await tx(await wallet(VOTERS[2]).writeContract({ address: PREDICT, abi: predictAbi, functionName: "claim", args: [quiet] }));
check(true, "an event nobody answered was voided after 30 days and refunds every stake");
console.log("all good");
