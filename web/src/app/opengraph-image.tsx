import { EXAMPLE } from "@/lib/example";
import { OG, printCard } from "@/lib/og/print";

export const size = OG;
export const contentType = "image/png";
export const alt = "Silverchat: ask the network, watch the answer develop";

export default function Image() {
  return printCard({
    kicker: "Example",
    question: EXAMPLE.question,
    options: EXAMPLE.options.map((o) => [o.label, o.share]),
    foot: `${EXAMPLE.answers.toLocaleString("en-US")} signed answers`,
  });
}
