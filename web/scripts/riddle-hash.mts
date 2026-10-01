// Prints ANSWER_HASH for SilverRiddle from an answer typed on stdin, normalized exactly as the /riddle page does.
// The answer is never written anywhere. Type it, press enter, then ctrl-d:
//   pnpm dlx tsx scripts/riddle-hash.mts
import { answerHash, normalize } from "../src/lib/riddle";

let input = "";
for await (const chunk of process.stdin) input += chunk;
console.error(`normalized: ${normalize(input).split(" ").length} words`);
console.log(answerHash(input));
