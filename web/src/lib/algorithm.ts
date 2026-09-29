/**
 * The rules Silverchat runs by. SilverAlgorithm stores the keccak256 of this file, and a new version only counts 20
 * days after its hash is published (Snowmoon, ch. 27). Everything here is pure: no config, no database, no network.
 * Anyone can rerun `tally` on a poll's published answers; the paid set needs the voters, which only the server holds.
 */
import { encodePacked, keccak256, type Address, type Hex } from "viem";

/** A wallet can answer if it held this much ZC or SC, in dollars, at the block the poll was asked. */
export const MIN_HOLD_USD = 20;

/** A group in a breakdown (a region, an age range) shows only with at least this many answers. */
export const GROUP_MIN = 20;

/** Share of a poll's cost that pays the answerers, in basis points. The rest is fixed in SilverAsk. */
export const ANSWERERS_BPS = 3500n;

/**
 * Who is paid when more people answer than the poll paid for: every answer counts in the totals, and the paid places
 * go by a draw seeded with the hash of the first block after the poll closed. Answering first gives no edge.
 */
export function paidSet<T extends { voter: Address }>(answers: T[], breadth: number, seed: Hex): T[] {
  if (answers.length <= breadth) return answers;
  const ticket = (voter: Address) => BigInt(keccak256(encodePacked(["bytes32", "address"], [seed, voter])));
  return answers
    .map((a) => ({ a, t: ticket(a.voter) }))
    .sort((x, y) => (x.t < y.t ? -1 : x.t > y.t ? 1 : 0))
    .slice(0, breadth)
    .map((x) => x.a);
}

/** Each paid place gets an equal share of the answerers' part; what nobody earned goes back to the asker. */
export function rewards(cost: bigint, breadth: number, paid: number) {
  const each = (cost * ANSWERERS_BPS) / 10_000n / BigInt(breadth);
  return { each, total: each * BigInt(paid) };
}

type Counted = { choices: number[]; region: string; age: string };
type Counts = number[][];

/**
 * Totals per option, and a breakdown for one tag at a time. A breakdown is published only when every group in it,
 * "not said" included, has at least GROUP_MIN answers, so no group can be worked out by subtracting the others.
 */
export function tally(questions: { options: string[] }[], answers: Counted[]) {
  const empty = (): Counts => questions.map((q) => q.options.map(() => 0));
  const count = (into: Counts, a: Counted) => a.choices.forEach((c, i) => (into[i][c] += 1));

  const totals = empty();
  for (const a of answers) count(totals, a);

  const breakdown = (tag: "region" | "age") => {
    const groups = new Map<string, Counts>();
    for (const a of answers) {
      const name = a[tag] || "not said";
      if (!groups.has(name)) groups.set(name, empty());
      count(groups.get(name)!, a);
    }
    const sizes = [...groups.values()].map((g) => g[0].reduce((s, n) => s + n, 0));
    return groups.size > 1 && sizes.every((n) => n >= GROUP_MIN) ? Object.fromEntries(groups) : null;
  };

  return { answers: answers.length, totals, region: breakdown("region"), age: breakdown("age") };
}

export type Tally = ReturnType<typeof tally>;
