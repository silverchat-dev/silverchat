// Rerun the published feed ranking on the public data and compare with what the site shows.
//   pnpm dlx tsx scripts/verify-feed.mts [https://silverchat.cash]
import { rank } from "../src/lib/algorithm";

const APP = process.argv[2] ?? "http://localhost:3100";
const feed = await (await fetch(`${APP}/api/polls?status=open&limit=100`)).json();
const { polls } = await (await fetch(`${APP}/api/export`)).json();

const ids = new Set(feed.polls.map((p: { id: string }) => p.id));
const mine = rank(
  polls.filter((p: { id: string }) => ids.has(p.id)),
  feed.rankedWith.hash,
).map((p: { id: string }) => p.id);
const theirs = feed.polls.map((p: { id: string }) => p.id);

console.log(`block ${feed.rankedWith.number}`);
console.log(`site:  ${theirs.join(" ")}`);
console.log(`rerun: ${mine.join(" ")}`);
console.log(JSON.stringify(mine) === JSON.stringify(theirs) ? "same order" : "DIFFERENT ORDER");
