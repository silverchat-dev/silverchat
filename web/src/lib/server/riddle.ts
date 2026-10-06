import { erc20Abi } from "viem";

import { riddleAbi } from "@/lib/abi";
import { ADDR } from "@/lib/config";
import { publicClient } from "@/lib/server/chain";

export type Riddle = { title: string; text: string[]; lock?: { rows: [string, string][]; rule: string } };

// the riddle that is live, set on the server when it goes live (RIDDLE, JSON), so its text is not public before then
export const live = (): Riddle | null => {
  try {
    return JSON.parse(process.env.RIDDLE ?? "null");
  } catch {
    return null;
  }
};

// every riddle so far, closed for good: they stay on the page as its record
export const SOLVED = [
  {
    title: "The courtyard",
    address: "0x30B536Faa675484e7051a7B9B285cb67818b392B",
    text: [
      "Zei's watch buzzed over tea. A courtyard he had eaten in once was writing to every guest of half a year, and someone had burned four hundred zipcoins to send it. The envelope said only who it was for.",
      "The courtyard has a token on Silverchat now, launched from the treasury's Realm. Its address on the cryptographic network opens the message. Four hundred zipcoins went to the door that the address and the first word name together. The source keeps four more seals, each over everything said before it; the hash on this page seals it all. Eleven words, each a word of the book. Say the address, then the words.",
    ],
    prize: "1,200,000",
    winner: "0x24fc0FE8459A35FDBB6b109f9F802dDE5A4398F8",
    reveal: "0x5afa289ddcaeffce58e0906571c96514b7efa3624c891817a9d8ce39151b33ee",
    solved: "3 October 2026, 17:45 UTC",
  },
  {
    title: "The count",
    address: "0x48FFB076C0C3F68F7E0E65cC4fA40ce4CA0FC346",
    text: [
      "On the hill in Kalimar the roof closed in ten ticks, and four teas came up the stairs. Seila had a question to ask, and a thousand others to hide it in.",
      "The source remembers seven lines from the book, and leaves one word out of each. Say the words it leaves out, in the order the book says them.",
      "Then say the block the source pinned, digit by digit, the way Zei counted down.",
      "Then say what they all shouted when the count ran out.",
    ],
    prize: "1,000,000",
    winner: "0x67797e1f48c7cdcfde90eb23e3e80b9221485e79",
    reveal: "0xaa3d2b75432becb229ec48b11933e142623dedf08498af26ae66d52b28898ed2",
    solved: "2 October 2026, 17:07 UTC",
  },
];

export async function read() {
  const r = { address: ADDR.riddle, abi: riddleAbi } as const;
  const [answerHash, deadline, solved, closed, winner, prize] = await publicClient.multicall({
    contracts: [
      { ...r, functionName: "ANSWER_HASH" },
      { ...r, functionName: "DEADLINE" },
      { ...r, functionName: "solved" },
      { ...r, functionName: "closed" },
      { ...r, functionName: "winner" },
      { address: ADDR.sc, abi: erc20Abi, functionName: "balanceOf", args: [ADDR.riddle] },
    ],
    allowFailure: false,
  });
  return { answerHash, deadline: Number(deadline), solved, closed, winner, prize };
}
