import { encodeAbiParameters, keccak256, stringToBytes, type Address, type Hex } from "viem";

import { ADDR, CHAIN_ID } from "./config";

/**
 * The riddle's answer, shared by the page and by whoever computes the hash for the deploy. Letters lose their accents,
 * everything is lowercase, anything that is not a to z or 0 to 9 becomes a space, and spaces collapse to one.
 * SilverRiddle compares keccak256 of exactly this string.
 */
export function normalize(answer: string) {
  return answer
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export const answerHash = (answer: string) => keccak256(stringToBytes(normalize(answer)));

/** What SilverRiddle.commit takes: the guess sealed to the solver, so nobody else can reveal it. */
export const commitmentOf = (solver: Address, answer: string, salt: Hex) =>
  keccak256(encodeAbiParameters([{ type: "address" }, { type: "string" }, { type: "bytes32" }], [solver, normalize(answer), salt]));

export const REVEAL_DELAY = 10n;

// the guess and its salt stay in this browser until the reveal, keyed by wallet and commitment
const key = (solver: string, commitment: Hex) =>
  `silverchat:riddle:${CHAIN_ID}:${ADDR.riddle.toLowerCase()}:${solver.toLowerCase()}:${commitment.toLowerCase()}`;

export type Guess = { answer: string; salt: Hex };

export function saveGuess(solver: string, commitment: Hex, guess: Guess) {
  try {
    localStorage.setItem(key(solver, commitment), JSON.stringify(guess));
    return loadGuess(solver, commitment)?.salt === guess.salt;
  } catch {
    return false;
  }
}

export function loadGuess(solver: string, commitment: Hex): Guess | null {
  try {
    return JSON.parse(localStorage.getItem(key(solver, commitment)) ?? "null");
  } catch {
    return null;
  }
}
