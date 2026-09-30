/** Breadth and priority as SilverAsk takes them, and the same cost math as `SilverAsk.costOf`. */
export const BREADTHS = [100, 1000, 10_000, 100_000, 1_000_000];

export const PRIORITIES = [
  { label: "Normal", mult: 10_000n },
  { label: "High", mult: 12_000n },
  { label: "Top", mult: 15_000n },
];

export const costOf = (pricePerPerson: bigint, breadth: number, priority: number) =>
  (pricePerPerson * BigInt(breadth) * PRIORITIES[priority].mult) / 10_000n;

/** Where each poll's ZC goes once the result is fixed, in basis points. */
export const SPLIT = [
  ["Answerers", 3500n],
  ["Treasury", 2500n],
  ["SC buyback", 2000n],
  ["Burned", 2000n],
] as const;
