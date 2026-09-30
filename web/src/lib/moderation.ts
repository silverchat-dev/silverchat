import type { Content } from "./content";

/**
 * What Silverchat won't publish: questions built to smear, like calling something a scam or a rug. The list is public
 * (the docs page shows it) and lives outside the rules file, so it can grow without the 20-day wait. The browser checks
 * it before anyone pays; the server checks it again before it publishes anything.
 */
export const REFUSED = [
  "scam",
  "scams",
  "scammer",
  "scammers",
  "scammy",
  "rug",
  "rugs",
  "rugged",
  "rugging",
  "rugpull",
  "rug pull",
  "honeypot",
  "ponzi",
  "pyramid scheme",
  "fraud",
  "fraudulent",
  "fraudster",
  "exit scam",
  "fud",
  "grift",
  "grifter",
  "drainer",
  "phishing",
  "stolen funds",
];

// lower case, accents off, digits and symbols people swap for letters put back, everything else a space
const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s" };
function words(text: string) {
  const tokens = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[013457@$]/g, (c) => LEET[c])
    .replace(/[^a-z]+/g, " ")
    .trim()
    .split(" ");
  // "s c a m" counts as one word
  const out: string[] = [];
  let run = "";
  for (const t of tokens) {
    if (t.length === 1) {
      run += t;
      continue;
    }
    if (run) out.push(run);
    run = "";
    out.push(t);
  }
  if (run) out.push(run);
  // and "scaaam" is "scam"
  return out.map((w) => w.replace(/(.)\1+/g, "$1"));
}

const LIST = REFUSED.map((r) => words(r).join(" "));

/** The first refused word or phrase in the question or its options, or null if it can be published. */
export function refused(content: Content): string | null {
  const text = ` ${content.questions.flatMap((q) => [q.q, ...q.options]).map((t) => words(t).join(" ")).join(" ")} `;
  const hit = LIST.findIndex((r) => text.includes(` ${r} `));
  return hit < 0 ? null : REFUSED[hit];
}
