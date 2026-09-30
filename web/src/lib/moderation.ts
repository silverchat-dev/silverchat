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

// lower case, accents off, digits people swap for letters put back, everything else a space ($ too: "$CAM" is a ticker)
const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a" };
const squeeze = (w: string) => w.replace(/(.)\1+/g, "$1"); // "scaaam" is "scam"
function words(text: string) {
  const tokens = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[013457@]/g, (c) => LEET[c])
    .replace(/[^a-z]+/g, " ")
    .trim()
    .split(" ");
  // letters spaced out ("s c a m") are joined into a run; a run is only ever a spelling trick, so it is searched inside
  const out: string[] = [];
  const runs: string[] = [];
  let run = "";
  const end = () => {
    if (run) out.push(run);
    if (run.length > 1) runs.push(run);
    run = "";
  };
  for (const t of tokens) {
    if (t.length === 1) run += t;
    else {
      end();
      out.push(t);
    }
  }
  end();
  return { words: out.map(squeeze), runs: runs.map(squeeze) };
}

const LIST = REFUSED.map((r) => words(r).words.join(" "));

/** The first refused word or phrase in the question or its options, or null if it can be published. */
export function refused(content: Content): string | null {
  const parts = content.questions.flatMap((q) => [q.q, ...q.options]).map(words);
  const text = ` ${parts.flatMap((p) => p.words).join(" ")} `;
  const runs = parts.flatMap((p) => p.runs);
  const hit = LIST.findIndex((r) => text.includes(` ${r} `) || runs.some((run) => run.includes(r.replace(/ /g, ""))));
  return hit < 0 ? null : REFUSED[hit];
}
