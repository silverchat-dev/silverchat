import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";

import { ADDR, CHAIN_ID } from "./config";

/**
 * An answer is an EIP-712 signature over the poll, the choices, the optional tags and a random salt the browser keeps.
 * The signature binds the chain and the SilverAsk contract, so it cannot be replayed on another poll or chain.
 */
export const REGIONS = ["Africa", "Asia", "Europe", "Middle East", "North America", "Oceania", "South America"];
export const AGES = ["18 to 24", "25 to 34", "35 to 44", "45 to 54", "55 and over"];

export const domain = () => ({ name: "Silverchat", version: "1", chainId: CHAIN_ID, verifyingContract: ADDR.ask });

export const types = {
  Answer: [
    { name: "pollId", type: "uint256" },
    { name: "choices", type: "uint8[]" },
    { name: "tagsHash", type: "bytes32" },
    { name: "salt", type: "bytes32" },
  ],
} as const;

export const tagsHash = (region: string, age: string) =>
  keccak256(encodeAbiParameters([{ type: "string" }, { type: "string" }], [region, age]));

/** One leaf of a poll's result tree. No voter in it: anyone can recount, only the voter can find their own. */
export const resultLeaf = (pollId: bigint, choices: number[], salt: Hex) =>
  keccak256(encodeAbiParameters([{ type: "uint256" }, { type: "uint8[]" }, { type: "bytes32" }], [pollId, choices, salt]));

export type Receipt = { pollId: string; voter: Address; choices: number[]; salt: Hex; leaf: Hex };

const key = (pollId: string, voter: string) => `silverchat:receipt:${pollId}:${voter.toLowerCase()}`;

export function saveReceipt(r: Receipt) {
  try {
    localStorage.setItem(key(r.pollId, r.voter), JSON.stringify(r));
  } catch {}
}

export function loadReceipt(pollId: string, voter: string): Receipt | null {
  try {
    return JSON.parse(localStorage.getItem(key(pollId, voter)) ?? "null");
  } catch {
    return null;
  }
}

/** Whether this browser holds any receipt for `voter`, i.e. the wallet answered something from here. */
export function hasReceipts(voter: string) {
  try {
    const end = `:${voter.toLowerCase()}`;
    return Object.keys(localStorage).some((k) => k.startsWith("silverchat:receipt:") && k.endsWith(end));
  } catch {
    return false;
  }
}
