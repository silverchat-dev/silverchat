// Rerun the published feed ranking on the data the site serves and compare with its order.
//   pnpm dlx tsx scripts/verify-feed.mts [https://silverchat.cash]
import { rank } from "../src/lib/algorithm";

const APP = process.argv[2] ?? "http://localhost:3100";
const feed = await (await fetch(`${APP}/api/polls?status=open&limit=100`)).json();
if (!feed.rankedWith) throw new Error("the site could not read the chain, so it served no ranking");

// the response carries every input the ranking uses, so the rerun cannot race a new answer
const mine = rank(feed.polls, feed.rankedWith.hash).map((p: { id: string }) => p.id);
const theirs = feed.polls.map((p: { id: string }) => p.id);

console.log(`block ${feed.rankedWith.number}`);
console.log(`site:  ${theirs.join(" ")}`);
console.log(`rerun: ${mine.join(" ")}`);
console.log(JSON.stringify(mine) === JSON.stringify(theirs) ? "same order" : "DIFFERENT ORDER");
