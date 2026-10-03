/**
 * A Silverchat client in one file: read the open polls, answer one with a signed EIP-712 answer, read a fixed result.
 * Nothing here comes from this repo, so you can copy it anywhere with viem installed.
 *
 *   PRIVATE_KEY=0x... npx tsx example-client.mts            # answer the first open poll you may answer, first option
 *   npx tsx example-client.mts result 12                    # print poll 12's result once it is fixed
 *
 * A wallet may answer when it held $20 of ZC or SC at the block the poll opened. Answering costs no gas.
 * An agent should say so first (POST /api/agents, see silverchat.cash/docs#agents), so results can show people and
 * agents apart.
 */
import { encodeAbiParameters, keccak256, toHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const SITE = process.env.SITE ?? "https://silverchat.cash";
// the answer signature binds the chain and SilverAsk, so it cannot be replayed on another poll, chain or contract
const domain = { name: "Silverchat", version: "1", chainId: 1, verifyingContract: "0xe68450E9435b2fFB5D8FC79bA951de4fA0Da899f" } as const;
const types = {
  Answer: [
    { name: "pollId", type: "uint256" },
    { name: "choices", type: "uint8[]" },
    { name: "tagsHash", type: "bytes32" },
    { name: "salt", type: "bytes32" },
  ],
} as const;
// region and age are optional; empty strings say nothing
const tagsHash = (region: string, age: string) => keccak256(encodeAbiParameters([{ type: "string" }, { type: "string" }], [region, age]));

type Poll = { id: string; content: { questions: { q: string; options: string[] }[] } | null; closesAt: number; tally: { answers: number; totals: number[][] } | null };

const get = async <T,>(path: string) => {
  const r = await fetch(`${SITE}${path}`);
  if (!r.ok) throw new Error(`${path}: ${r.status} ${(await r.json().catch(() => null))?.error ?? ""}`);
  return (await r.json()) as T;
};

if (process.argv[2] === "result") {
  const p = await get<Poll>(`/api/polls/${process.argv[3]}`);
  if (!p.tally || !p.content) throw new Error("not fixed yet");
  p.content.questions.forEach((q, i) => {
    console.log(q.q);
    q.options.forEach((o, j) => console.log(`  ${o}: ${p.tally!.totals[i][j]}`));
  });
} else {
  const account = privateKeyToAccount(process.env.PRIVATE_KEY as Hex);
  const { polls } = await get<{ polls: Poll[] }>("/api/polls?status=open");
  for (const p of polls.filter((x) => x.content)) {
    const choices = p.content!.questions.map(() => 0);
    // keep the salt: with it you can find your own answer in the public record later (GET /api/receipt)
    const salt = toHex(crypto.getRandomValues(new Uint8Array(32)));
    const signature = await account.signTypedData({
      domain,
      types,
      primaryType: "Answer",
      message: { pollId: BigInt(p.id), choices, tagsHash: tagsHash("", ""), salt },
    });
    const r = await fetch(`${SITE}/api/answer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pollId: p.id, voter: account.address, choices, region: "", age: "", salt, signature }),
    });
    const body = await r.json();
    if (r.ok) {
      console.log(`answered poll ${p.id} (${p.content!.questions[0].q}); keep this salt: ${salt}`);
      break;
    }
    // not eligible, already answered or closed: try the next one
    console.log(`poll ${p.id}: ${body.error}`);
  }
}
