import "server-only";

import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import type { Address, Hex } from "viem";

import { paidSet, rewards } from "@/lib/algorithm";
import { resultLeaf } from "@/lib/answer";

import { db, type PollRow } from "./db";

const ZERO_ROOT = `0x${"0".repeat(64)}` as Hex;

/**
 * Both trees are pure functions of the stored answers and the seed block, so they are rebuilt when needed instead of
 * stored. The reward tree uses the same (address, uint256) double-hashed leaves SilverAsk verifies.
 */
export async function trees(poll: PollRow, seed: Hex) {
  const answers = await db.answers(poll.id);
  const leaves = answers.map((a) => resultLeaf(BigInt(poll.id), a.choices, a.salt as Hex)).sort();
  const result = leaves.length ? StandardMerkleTree.of(leaves.map((l) => [l]), ["bytes32"]) : null;

  const paid = paidSet(answers as ((typeof answers)[number] & { voter: Address })[], poll.breadth, seed);
  const { each, total } = rewards(BigInt(poll.cost), poll.breadth, paid.length);
  const reward = paid.length && each > 0n ? StandardMerkleTree.of(paid.map((a) => [a.voter, each.toString()]), ["address", "uint256"]) : null;

  return {
    answers,
    leaves,
    result,
    reward,
    each,
    rewardTotal: reward ? total : 0n,
    resultRoot: (result?.root ?? ZERO_ROOT) as Hex,
    rewardRoot: (reward?.root ?? ZERO_ROOT) as Hex,
  };
}

const memo = new Map<string, Awaited<ReturnType<typeof trees>>>();

/** Trees of a finalized poll never change; keep the last few hundred. */
export async function finalTrees(poll: PollRow) {
  const hit = memo.get(poll.id);
  if (hit) return hit;
  const t = await trees(poll, poll.seed as Hex);
  if (memo.size > 300) memo.clear();
  memo.set(poll.id, t);
  return t;
}
