import { formatUnits } from "viem";

import type { Tally } from "./algorithm";
import type { Content } from "./content";

const nf = (max: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: max });

/** 1443790374958775117520n -> "1,443.79" */
export function tokens(wei: bigint | string, digits = 2) {
  const n = Number(formatUnits(BigInt(wei), 18));
  return nf(n >= 1000 ? 0 : digits).format(n);
}

export const usd = (n: number) => `$${nf(2).format(n)}`;

export const people = (n: number) => (n >= 1000 ? `${n / 1000}K` : String(n));

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** "3 h 20 min", "2 days", "40 s" */
export function span(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  if (s >= 2 * 86_400) return `${Math.floor(s / 86_400)} days`;
  if (s >= 3600) return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
  if (s >= 60) return `${Math.floor(s / 60)} min`;
  return `${s} s`;
}

export const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

/** The first question's leading option and its share of the answers, once a result is fixed. */
export function lead(content: Content | null, tally: Tally | null | undefined) {
  if (!content || !tally?.answers) return null;
  const counts = tally.totals[0];
  const k = counts.indexOf(Math.max(...counts));
  return { option: content.questions[0].options[k], share: pct(counts[k], tally.answers) };
}
