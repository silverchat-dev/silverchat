import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";

import { ADDR, CHAIN_ID } from "./config";
import { refused } from "./moderation";

/**
 * Silverchat Predict, shared by the browser and the server. A side is sealed as keccak256(abi.encode(id, staker,
 * side, salt)) with a 32-byte random salt, the same encoding SilverPredict checks on reveal.
 */
export const YES = 1;
export const NO = 2;
export type Side = typeof YES | typeof NO;

export const STATUS = ["none", "open", "yes", "no", "void"] as const;

/** The Chainlink feeds SilverPredict accepts, 8 decimals each. */
export const FEEDS = {
  "ETH/USD": "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
  "BTC/USD": "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c",
} as const satisfies Record<string, Address>;
export const FEED_DECIMALS = 8;

export const feedName = (feed: string) => Object.entries(FEEDS).find(([, a]) => a.toLowerCase() === feed.toLowerCase())?.[0] ?? null;

export const REVEAL_WINDOW = 72 * 3600;
/** The keeper reveals what is still sealed this long after close; until then each staker's browser does. */
export const KEEPER_REVEALS_AFTER = 48 * 3600;

export const commitmentOf = (id: bigint, staker: Address, side: Side, salt: Hex) =>
  keccak256(
    encodeAbiParameters([{ type: "uint256" }, { type: "address" }, { type: "uint8" }, { type: "bytes32" }], [id, staker, side, salt]),
  );

/** Reality.eth template 0 (yes/no): title, category and language joined by U+241F. */
const SEP = "\u241f";
export const questionString = (title: string, category: string) => [title.trim(), category, "en"].join(SEP);
export const titleOf = (question: string) => question.split(SEP)[0];

export const TITLE_MAX = 280;

/** Why a title cannot be asked, or null. Template 0 is JSON, so quotes and backslashes would break it. */
export function badTitle(title: string): string | null {
  const t = title.trim();
  if (t.length < 10) return "write the question in full";
  if ([...t].length > TITLE_MAX) return `keep it under ${TITLE_MAX} characters`;
  if (/["\\\u241f\u0000-\u001f\u007f]/.test(t)) return "no quotes, backslashes or control characters";
  const word = refused({ v: 1, questions: [{ q: t, options: [] }] });
  return word ? `Silverchat does not publish questions with "${word}" in them` : null;
}

/** "2026-12-31 00:00 UTC" */
export const utcStamp = (ts: number) => `${new Date(ts * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`;

/** The text of a price market, made from what is on-chain, so it can never say something else. */
export function priceTitle(feed: string, threshold: bigint, at: number) {
  const name = feedName(feed) ?? "the feed";
  const usd = Number(threshold) / 10 ** FEED_DECIMALS;
  return `Will ${name} be at or above $${usd.toLocaleString("en-US", { maximumFractionDigits: FEED_DECIMALS })} on ${utcStamp(at)}, by Chainlink?`;
}

// the seal is kept in the browser too, so the staker can always reveal without the keeper. Keyed by the commitment
// and never overwritten: a second try, a second tab or a stake that failed can never replace the seal that counts.
const sealKey = (id: string, staker: string, commitment: Hex) =>
  `silverchat:seal:${CHAIN_ID}:${ADDR.predict.toLowerCase()}:${id}:${staker.toLowerCase()}:${commitment.toLowerCase()}`;

export type Seal = { side: Side; salt: Hex };

export function loadSeal(id: string, staker: string, commitment: Hex): Seal | null {
  try {
    return JSON.parse(localStorage.getItem(sealKey(id, staker, commitment)) ?? "null");
  } catch {
    return null;
  }
}

/** True once the seal is stored and reads back the same. */
export function saveSeal(id: string, staker: string, commitment: Hex, seal: Seal) {
  try {
    const key = sealKey(id, staker, commitment);
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(seal));
    return loadSeal(id, staker, commitment)?.salt === seal.salt;
  } catch {
    return false;
  }
}
