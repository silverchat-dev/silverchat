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

import { askAbi } from "../src/lib/abi";
import { resultLeaf, tagsHash, types } from "../src/lib/answer";
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

const content = { v: 1, questions: [{ q: `End to end check ${Date.now()}`, options: ["Yes", "No"] }] };
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
const claimsUrl = `${APP}/api/claims/${VOTERS[0].address}?day=${day}&sig=${sig}`;
check((await fetch(`${APP}/api/claims/${VOTERS[0].address}?day=${day}&sig=0x00`)).status === 401, "rewards are private without the wallet's signature");
const { claims } = (await (await fetch(claimsUrl)).json()) as { claims: Claim[] };
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
const left = (await (await fetch(claimsUrl)).json()) as { claims: Claim[] };
check(left.claims.length === 0, "nothing is left to claim");
console.log("all good");
