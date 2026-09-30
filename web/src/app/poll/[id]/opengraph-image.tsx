import type { Content } from "@/lib/content";
import { people, tokens } from "@/lib/format";
import { OG, printCard } from "@/lib/og/print";
import { db } from "@/lib/server/db";

export const size = OG;
export const contentType = "image/png";
export const alt = "A poll on Silverchat, as a print";
// crawlers and chat apps fetch this a lot; a minute old is fine
export const revalidate = 60;

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const poll = /^\d{1,20}$/.test(id) ? await db.poll(id) : null;
  const q = poll?.content ? (JSON.parse(poll.content) as Content).questions[0] : null;
  if (!poll || !q) return printCard({ kicker: "Silverchat", question: "A question for the network.", options: null, foot: "silverchat.cash" });

  const answered = poll.tally?.answers ?? 0;
  const counts = poll.tally?.totals[0];
  // the count is published once the result is fixed; until then the print is still in the tray
  const options = poll.status === "final" && counts && answered ? q.options.map((o, i) => [o, Math.round((100 * counts[i]) / answered)] as [string, number]) : null;
  return printCard({
    kicker: `Poll no. ${poll.id} · ${people(poll.breadth)} people · ${tokens(poll.cost, 0)} ZC`,
    question: q.q,
    options: options?.sort((a, b) => b[1] - a[1]) ?? null,
    foot:
      poll.status === "final"
        ? `${answered.toLocaleString("en-US")} signed answers · fixed on Ethereum`
        : `open · ${(await db.answerCount(id)).toLocaleString("en-US")} answers so far`,
  });
}
