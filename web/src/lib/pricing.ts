/** Breadth and priority as SilverAsk takes them, and the same cost math as `SilverAsk.costOf`. */
export const BREADTHS = [10, 100, 1000, 10_000];

export const PRIORITIES = [
  { label: "Normal", mult: 10_000n },
  { label: "High", mult: 12_000n },
  { label: "Top", mult: 15_000n },
];

export const costOf = (pricePerPerson: bigint, breadth: number, priority: number) =>
  (pricePerPerson * BigInt(breadth) * PRIORITIES[priority].mult) / 10_000n;

/**
 * Where each poll's ZC goes once the result is fixed, in basis points. The burn is the book's costly signal, "except
 * for burning a hundred zipcoins at his doorstep" (Snowmoon, ch. 20).
 */
export const SPLIT = [
  ["Answerers", 8500n],
  ["Treasury", 500n],
  ["Burned", 1000n],
] as const;
